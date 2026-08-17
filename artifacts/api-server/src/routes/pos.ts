import { recordPaymentEvent } from "../lib/paymentLog";
import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { accountsTable, pendingInvoicesTable, entitiesTable, cardsTable, transactionsTable } from "@workspace/db";
import { eq, and, isNull, isNotNull, gte } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { makeInvoice, lookupInvoice, resolveNwcUrl, getAccountNwcUrl } from "../lib/nwc";
import { processExternalPayment } from "../lib/feeEngine";
import { encrypt, decrypt } from "../lib/encrypt";
import { subscribeSubWalletInvoice, settleInvoiceByPaymentHash } from "../lib/invoiceMonitor";
import { createWrappedInvoice, advanceWrap, type WrapRow } from "../lib/holdWrap";
import { resolveWalletSource } from "../lib/walletSource";
import { requestLnurlInvoice, checkLnurlVerify } from "../lib/lnAddress";
import { decryptSunP, verifySunC, generateK1, encodeLnurl } from "../lib/boltcard";
import { logger } from "../lib/logger";
import { DOMAIN } from "../lib/domain";

const router: IRouter = Router();

// GET /pos/config — device fetches merchant config (currency) on boot.
router.get("/pos/config", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.auth!.accountId;

  const [account] = await db
    .select({ currency: accountsTable.currency, sendRateModifier: accountsTable.sendRateModifier })
    .from(accountsTable)
    .where(eq(accountsTable.id, accountId));

  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  res.json({ currency: account.currency, sendRateModifier: account.sendRateModifier ?? "" });
});

// POST /pos/invoice — create a Lightning invoice (used by posBOX device)
router.post("/pos/invoice", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.auth!.accountId;

  const amountSats = Number(req.body?.amountSats);
  if (!amountSats || !Number.isInteger(amountSats) || amountSats < 1) {
    res.status(400).json({ error: "amountSats must be a positive integer" });
    return;
  }

  const memo: string = typeof req.body?.memo === "string" ? req.body.memo.slice(0, 140) : "posBOX payment";

  const source = await resolveWalletSource(accountId);

  if (source.kind === "none") {
    res.status(400).json({ error: "Wallet not configured - complete wallet setup in the bitPOS app before taking payments" });
    return;
  }

  // Lightning-address merchant: fetch the invoice from their provider via
  // LNURL-pay; settlement is detected by polling the LUD-21 verify URL.
  // No hold-wrap - the payment goes straight to the provider.
  if (source.kind === "lnaddress") {
    let lnurlInvoice;
    try {
      lnurlInvoice = await requestLnurlInvoice(source.address, amountSats, memo);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: `Could not get an invoice from ${source.address}: ${message}` });
      return;
    }
    if (!lnurlInvoice.verifyUrl) {
      res.status(502).json({
        error: "Your lightning address provider stopped supporting payment verification - reconnect your wallet in settings",
      });
      return;
    }

    const expiresAt = new Date(Date.now() + 3600 * 1000);
    await db.insert(pendingInvoicesTable).values({
      accountId,
      bolt11: lnurlInvoice.bolt11,
      paymentHash: lnurlInvoice.paymentHash,
      amountSats,
      memo,
      lnurlVerifyUrl: lnurlInvoice.verifyUrl,
      expiresAt,
    });

    res.status(201).json({
      bolt11: lnurlInvoice.bolt11,
      paymentHash: lnurlInvoice.paymentHash,
      amountSats,
      expiresAt,
    });
    return;
  }

  const nwcUrl = source.nwcUrl;
  const nwcUrlEncrypted = encrypt(nwcUrl);

  // 1% incoming fee via wrapped hold invoice on the platform fee wallet.
  // Falls back to a direct (fee-free) invoice if wrapping is unavailable -
  // a sale is never blocked by the fee engine.
  const wrap = await createWrappedInvoice(amountSats, memo, nwcUrl);

  if (wrap) {
    await db.insert(pendingInvoicesTable).values({
      accountId,
      bolt11: wrap.bolt11,
      paymentHash: wrap.paymentHash,
      amountSats,
      memo,
      nwcUrlEncrypted,
      merchantBolt11: wrap.merchantBolt11,
      merchantPaymentHash: wrap.merchantPaymentHash,
      holdPreimage: wrap.holdPreimage,
      feeSats: wrap.feeSats,
      wrapStatus: "created",
      wrapUpdatedAt: new Date(),
      expiresAt: wrap.expiresAt,
    });

    recordPaymentEvent({
      paymentId: wrap.paymentHash,
      accountId,
      kind: "wrap",
      event: "wrap.invoice_persisted",
      status: "info",
      mile: "first_mile",
      message: `POS wrap invoice persisted (${amountSats} sats, fee ${wrap.feeSats})`,
      paymentHash: wrap.paymentHash,
      merchantPaymentHash: wrap.merchantPaymentHash,
      amountSats,
      feeSats: wrap.feeSats,
    });

    res.status(201).json({
      bolt11: wrap.bolt11,
      paymentHash: wrap.paymentHash,
      amountSats,
      expiresAt: wrap.expiresAt,
    });
    return;
  }

  const invoiceResult = await makeInvoice(amountSats, memo, 3600, nwcUrl);

  await db.insert(pendingInvoicesTable).values({
    accountId,
    bolt11: invoiceResult.bolt11,
    paymentHash: invoiceResult.paymentHash,
    amountSats,
    memo,
    nwcUrlEncrypted,
    expiresAt: invoiceResult.expiresAt,
  });

  // Subscribe for instant push notification when paid
  if (nwcUrl) {
    subscribeSubWalletInvoice(invoiceResult.paymentHash, nwcUrl).catch(() => {});
  }

  res.status(201).json({
    bolt11: invoiceResult.bolt11,
    paymentHash: invoiceResult.paymentHash,
    amountSats,
    expiresAt: invoiceResult.expiresAt,
  });
});

// GET /pos/invoice/:paymentHash/status — poll payment status
router.get("/pos/invoice/:paymentHash/status", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.auth!.accountId;
  const paymentHash = req.params.paymentHash as string;

  const [invoice] = await db
    .select()
    .from(pendingInvoicesTable)
    .where(and(
      eq(pendingInvoicesTable.paymentHash, paymentHash),
      eq(pendingInvoicesTable.accountId, accountId),
    ));

  if (!invoice) {
    res.json({ status: "expired" });
    return;
  }

  if (invoice.paidAt) {
    res.json({ status: "paid" });
    return;
  }

  // Wrapped invoice: every poll drives the hold-wrap state machine forward
  // (accepted -> forward -> settle). Settlement is request-driven because
  // production runs on autoscale.
  if (invoice.wrapStatus) {
    try {
      const status = await advanceWrap(invoice as WrapRow);
      if (status === "settled") {
        res.json({ status: "paid" });
        return;
      }
      if (status === "cancelled") {
        // Forward failed - the customer's held sats refund automatically.
        // Reported as "expired" because the posBOX firmware only understands
        // paid/expired/error.
        res.json({ status: "expired", detail: "cancelled" });
        return;
      }
    } catch {
      // fall through to pending/expired below
    }

    if (invoice.expiresAt < new Date()) {
      res.json({ status: "expired" });
      return;
    }
    res.json({ status: "pending" });
    return;
  }

  // Lightning-address invoice: settlement is detected by polling the
  // provider's LUD-21 verify URL - no NWC involved.
  if (invoice.lnurlVerifyUrl) {
    try {
      const verify = await checkLnurlVerify(invoice.lnurlVerifyUrl);
      if (verify.settled) {
        await settleInvoiceByPaymentHash(paymentHash, new Date());
        res.json({ status: "paid" });
        return;
      }
    } catch {
      // verify endpoint unreachable - fall through to pending/expired
    }
    if (invoice.expiresAt < new Date()) {
      res.json({ status: "expired" });
      return;
    }
    res.json({ status: "pending" });
    return;
  }

  if (invoice.expiresAt < new Date()) {
    res.json({ status: "expired" });
    return;
  }

  try {
    const nwcUrl = resolveNwcUrl(invoice.nwcUrlEncrypted);
    const result = await lookupInvoice(paymentHash, nwcUrl);
    if (result.paid) {
      // Full settlement (marks paidAt AND records the receive transaction).
      await settleInvoiceByPaymentHash(paymentHash, result.paidAt ?? new Date());
      res.json({ status: "paid" });
      return;
    }
  } catch {
    // NWC lookup failed — fall through to pending
  }

  res.json({ status: "pending" });
});

// ── Send mode: merchant sends sats outward ─────────────────────────────────

// POST /pos/withdraw — create a LNURL-W for the merchant to send sats outward.
// The customer scans the QR with any Lightning wallet, generates an invoice,
// and the merchant's wallet pays it via the callback endpoint.
router.post("/pos/withdraw", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.auth!.accountId;
  const entityId = req.auth!.entityId;

  const amountSats = Number(req.body?.amountSats);
  const pin = String(req.body?.pin ?? "");

  if (!amountSats || !Number.isInteger(amountSats) || amountSats < 1) {
    res.status(400).json({ error: "amountSats must be a positive integer" });
    return;
  }
  if (!pin) {
    res.status(400).json({ error: "PIN required" });
    return;
  }

  const [entity] = await db
    .select({ pinHash: entitiesTable.pinHash })
    .from(entitiesTable)
    .where(eq(entitiesTable.id, entityId));

  if (!entity) { res.status(404).json({ error: "Account not found" }); return; }

  const pinValid = await bcrypt.compare(pin, entity.pinHash);
  if (!pinValid) { res.status(401).json({ error: "Invalid PIN" }); return; }

  const source = await resolveWalletSource(accountId);
  if (source.kind === "none") { res.status(400).json({ error: "Wallet not configured" }); return; }
  if (source.kind === "lnaddress") { res.status(400).json({ error: "Lightning address accounts are receive-only" }); return; }

  const k1 = generateK1();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await db.insert(pendingInvoicesTable).values({
    accountId, bolt11: "", paymentHash: k1, amountSats,
    memo: "posBOX send (QR)", expiresAt,
  });

  const callbackUrl = `https://${DOMAIN}/api/pos/withdraw/callback`;
  const withdrawUrl = `${callbackUrl}?k1=${k1}`;
  const lnurlw = encodeLnurl(withdrawUrl);

  logger.info({ accountId, amountSats, k1 }, "posBOX send: LNURL-W created");
  res.json({ lnurlw, k1 });
});

// GET /pos/withdraw/:k1/status — poll withdrawal status (device polls while QR shown)
router.get("/pos/withdraw/:k1/status", requireAuth, async (req, res): Promise<void> => {
  const k1 = req.params.k1 as string;

  const [pending] = await db
    .select()
    .from(pendingInvoicesTable)
    .where(and(
      eq(pendingInvoicesTable.paymentHash, k1),
      eq(pendingInvoicesTable.memo, "posBOX send (QR)"),
    ));

  if (!pending) { res.json({ status: "expired" }); return; }
  if (pending.paidAt) { res.json({ status: "paid" }); return; }
  if (pending.expiresAt < new Date()) { res.json({ status: "expired" }); return; }
  res.json({ status: "pending" });
});

// GET /pos/withdraw/callback — LNURL-W callback.
// Step 1 (no pr): wallet fetches the withdrawRequest JSON (tag, callback, k1, limits)
// Step 2 (with pr): wallet submits a bolt11 invoice, merchant pays it
router.get("/pos/withdraw/callback", async (req, res): Promise<void> => {
  const k1 = String(req.query.k1 ?? "");
  const pr = String(req.query.pr ?? "");

  if (!k1) { res.json({ status: "ERROR", reason: "Missing k1" }); return; }

  // Look up the pending withdrawal
  const [pending] = await db
    .select()
    .from(pendingInvoicesTable)
    .where(and(
      eq(pendingInvoicesTable.paymentHash, k1),
      eq(pendingInvoicesTable.memo, "posBOX send (QR)"),
    ));

  if (!pending) { res.json({ status: "ERROR", reason: "Invalid or expired withdrawal" }); return; }
  if (pending.expiresAt < new Date()) { res.json({ status: "ERROR", reason: "Withdrawal expired" }); return; }

  // Step 1: wallet fetched the LNURL-W URL — return the withdrawRequest JSON
  if (!pr) {
    res.json({
      tag: "withdrawRequest",
      callback: `https://${DOMAIN}/api/pos/withdraw/callback`,
      k1,
      defaultDescription: "bitPOS send",
      minWithdrawable: pending.amountSats * 1000,
      maxWithdrawable: pending.amountSats * 1000,
    });
    return;
  }

  // Step 2: wallet submitted a bolt11 invoice — pay it from the merchant's wallet
  if (pending.paidAt) { res.json({ status: "ERROR", reason: "Withdrawal already claimed" }); return; }

  try {
    const { paymentHash, feeSats } = await processExternalPayment(
      pending.accountId, pr, pending.amountSats, undefined, "posBOX send (QR)",
    );

    logger.info({ accountId: pending.accountId, amountSats: pending.amountSats, feeSats, paymentHash }, "posBOX send: payment sent via QR");

    await db.update(pendingInvoicesTable)
      .set({ paidAt: new Date(), bolt11: pr })
      .where(eq(pendingInvoicesTable.id, pending.id));

    res.json({ status: "OK" });
  } catch (err) {
    logger.error({ accountId: pending.accountId, err }, "posBOX send: payment failed");
    res.json({ status: "ERROR", reason: err instanceof Error ? err.message : "Payment failed" });
  }
});

// POST /pos/send-to-card — send sats to a bitPOS Bolt Card holder directly.
// Device reads card URL (cardId + p + c), server verifies card and pays card holder.
router.post("/pos/send-to-card", requireAuth, async (req, res): Promise<void> => {
  const merchantAccountId = req.auth!.accountId;
  const entityId = req.auth!.entityId;

  const cardUrl = String(req.body?.cardUrl ?? "");
  const amountSats = Number(req.body?.amountSats);
  const pin = String(req.body?.pin ?? "");

  if (!cardUrl || !amountSats || !pin) {
    res.status(400).json({ error: "cardUrl, amountSats, and pin are required" });
    return;
  }

  const [entity] = await db
    .select({ pinHash: entitiesTable.pinHash })
    .from(entitiesTable)
    .where(eq(entitiesTable.id, entityId));

  if (!entity) { res.status(404).json({ error: "Account not found" }); return; }

  const pinValid = await bcrypt.compare(pin, entity.pinHash);
  if (!pinValid) { res.status(401).json({ error: "Invalid PIN" }); return; }

  // Parse cardUrl: https://bitpos.app/card/{cardId}?p={hex}&c={hex}
  const urlMatch = cardUrl.match(/\/card\/([^?]+)\?p=([0-9a-fA-F]+)&c=([0-9a-fA-F]+)/);
  if (!urlMatch) { res.status(400).json({ error: "Invalid card URL" }); return; }

  const [, cardId, pHex, cHex] = urlMatch;

  const [card] = await db.select().from(cardsTable).where(eq(cardsTable.id, cardId));
  if (!card) { res.status(404).json({ error: "Card not found" }); return; }
  if (card.status === "cancelled") { res.status(400).json({ error: "Card has been cancelled" }); return; }

  // Verify AES-SUN
  let key1Hex: string, key2Hex: string;
  try {
    key1Hex = decrypt(card.aesKey1);
    key2Hex = decrypt(card.aesKey2);
  } catch {
    logger.error({ cardId }, "Failed to decrypt card AES keys for send-to-card");
    res.status(500).json({ error: "Internal error" });
    return;
  }

  const sunData = decryptSunP(key1Hex, pHex.toLowerCase());
  if (!sunData) { res.status(400).json({ error: "Card authentication failed" }); return; }
  if (!verifySunC(key2Hex, sunData.uid, sunData.counter, cHex.toLowerCase())) {
    res.status(400).json({ error: "Card verification failed" });
    return;
  }

  // Card holder's wallet (to create a receive invoice)
  const cardAccountId = card.accountId;
  const cardNwcUrl = await getAccountNwcUrl(cardAccountId);
  if (!cardNwcUrl) { res.status(400).json({ error: "Card holder has no wallet configured" }); return; }

  // Merchant's wallet (to pay from)
  const merchantSource = await resolveWalletSource(merchantAccountId);
  if (merchantSource.kind === "none") { res.status(400).json({ error: "Merchant wallet not configured" }); return; }
  if (merchantSource.kind === "lnaddress") { res.status(400).json({ error: "Lightning address accounts are receive-only" }); return; }

  const merchantNwcUrl = await getAccountNwcUrl(merchantAccountId);
  if (!merchantNwcUrl) { res.status(400).json({ error: "Merchant wallet not available" }); return; }

  // Create invoice on card holder's wallet, pay it from merchant's wallet
  try {
    const invoice = await makeInvoice(amountSats, "bitPOS send from merchant", 300, cardNwcUrl);

    const { paymentHash, feeSats } = await processExternalPayment(
      merchantAccountId, invoice.bolt11, amountSats, undefined,
      "posBOX send to card", merchantNwcUrl,
    );

    logger.info({ cardId, merchantAccountId, cardAccountId, amountSats, feeSats, paymentHash }, "posBOX send: payment sent to card holder");

    await db.insert(transactionsTable).values({
      cardId, accountId: cardAccountId, amountSats,
      direction: "in", type: "receive", status: "completed",
      bolt11: invoice.bolt11, paymentHash, memo: "bitPOS send to card",
    });

    res.json({ status: "OK" });
  } catch (err) {
    logger.error({ cardId, merchantAccountId, cardAccountId, err }, "posBOX send to card failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Payment failed" });
  }
});

// ── Card provisioning (write/wipe) ─────────────────────────────────────────

// Build the NDEF file for a Bolt Card lnurlw URL (ported from card-writer/utils/ndef.ts).
// The NTAG424 chip overwrites the zeroed p= and c= placeholders at each tap.
function buildNdefFile(lnurlwBase: string): Buffer {
  const sep = lnurlwBase.includes("?") ? "&" : "?";
  const url = `${lnurlwBase}${sep}p=${"0".repeat(32)}&c=${"0".repeat(16)}`;
  const urlBytes = Buffer.from(url, "utf8");
  const payloadLen = 1 + urlBytes.length;
  const ndefMsg = Buffer.alloc(5 + urlBytes.length);
  ndefMsg[0] = 0xD1;
  ndefMsg[1] = 0x01;
  ndefMsg[2] = payloadLen;
  ndefMsg[3] = 0x55; // 'U'
  ndefMsg[4] = 0x00; // URI identifier
  urlBytes.copy(ndefMsg, 5);
  const file = Buffer.alloc(2 + ndefMsg.length);
  file.writeUInt16BE(ndefMsg.length, 0);
  ndefMsg.copy(file, 2);
  return file;
}

// Compute SDM byte offsets for ChangeFileSettings (ported from ndef.ts).
function computeSdmOffsets(lnurlwBase: string): { ndefFile: Buffer; encPiccOffset: number; macOffset: number } {
  const ndefFile = buildNdefFile(lnurlwBase);
  const urlStartInFile = 7;
  const sep = lnurlwBase.includes("?") ? "&" : "?";
  const encPiccOffset = urlStartInFile + lnurlwBase.length + sep.length + 2; // "p=" = 2
  const macOffset = encPiccOffset + 32 + 3; // 32 chars + "&c=" = 3
  return { ndefFile, encPiccOffset, macOffset };
}

// Build the SDM file settings payload for ChangeFileSettings (ported from ntag424.ts).
function buildSdmSettings(encPiccOffset: number, macOffset: number): Buffer {
  const o3 = (n: number) => Buffer.from([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff]);
  return Buffer.concat([
    Buffer.from([
      0x40, // FileOption: SDM enabled, CommMode=Plain
      0x00, // AR[0]: Change=K0, ReadWrite=K0
      0xE0, // AR[1]: Write=free, Read=K0
      0xC1, // SDMOptions
      0xFF, // SDM AR high
      0x12, // SDM AR low: MetaRead=K1, FileRead=K2
    ]),
    o3(encPiccOffset),
    o3(macOffset),
    o3(macOffset),
  ]);
}

// GET /pos/next-provision — returns the oldest pending unwritten card for this account,
// with pre-built NDEF file + SDM settings + all 5 AES keys (hex).
// The device writes the card using these values — no computation needed on-device.
router.get("/pos/next-provision", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.auth!.accountId;

  // Find the oldest ACTIVE card with a valid (non-expired) provision token
  // that hasn't been used yet. Excludes cancelled/frozen cards, cards already
  // provisioned (lastUsedAt set), and cards with expired tokens (>24h old).
  const now = new Date();
  const [card] = await db
    .select()
    .from(cardsTable)
    .where(and(
      eq(cardsTable.accountId, accountId),
      eq(cardsTable.status, "active"),
      isNotNull(cardsTable.provisionToken),
      isNotNull(cardsTable.provisionTokenExpiresAt),
      gte(cardsTable.provisionTokenExpiresAt, now),
      isNull(cardsTable.lastUsedAt),
    ))
    .orderBy(cardsTable.createdAt)
    .limit(1);

  if (!card) {
    res.status(404).json({ error: "No pending cards to write" });
    return;
  }

  // Decrypt all 5 AES keys
  let k0: string, k1: string, k2: string, k3: string, k4: string;
  try {
    k0 = decrypt(card.aesKey0);
    k1 = decrypt(card.aesKey1);
    k2 = decrypt(card.aesKey2);
    k3 = decrypt(card.aesKey3);
    k4 = decrypt(card.aesKey4);
  } catch {
    logger.error({ cardId: card.id }, "Failed to decrypt card AES keys for next-provision");
    res.status(500).json({ error: "Internal error" });
    return;
  }

  const lnurlwBase = `lnurlw://${DOMAIN}/card/${card.id}`;
  const { ndefFile, encPiccOffset, macOffset } = computeSdmOffsets(lnurlwBase);
  const sdmSettings = buildSdmSettings(encPiccOffset, macOffset);

  logger.info({ cardId: card.id, accountId }, "posBOX next-provision served");

  res.json({
    cardId: card.id,
    ndefFile: ndefFile.toString("hex"),
    sdmSettings: sdmSettings.toString("hex"),
    k0, k1, k2, k3, k4,
  });
});

// POST /pos/mark-written/:cardId — mark a card as written (provisioned).
// Called by the device after successful card write.
router.post("/pos/mark-written/:cardId", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.auth!.accountId;
  const cardId = req.params.cardId as string;

  const [card] = await db
    .select()
    .from(cardsTable)
    .where(and(
      eq(cardsTable.id, cardId),
      eq(cardsTable.accountId, accountId),
    ));

  if (!card) {
    res.status(404).json({ error: "Card not found" });
    return;
  }

  await db
    .update(cardsTable)
    .set({
      provisionToken: null,
      provisionTokenExpiresAt: null,
      status: "active",
      lastUsedAt: new Date(),
    })
    .where(eq(cardsTable.id, cardId));

  logger.info({ cardId, accountId }, "Card marked as written (provisioned)");
  res.json({ status: "OK" });
});

// GET /pos/wipe-keys/:cardId — returns the 5 AES keys for wiping a card.
// The device authenticates with key 0, resets SDM to factory, resets all keys.
router.get("/pos/wipe-keys/:cardId", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.auth!.accountId;
  const cardId = req.params.cardId as string;

  const [card] = await db
    .select()
    .from(cardsTable)
    .where(and(
      eq(cardsTable.id, cardId),
      eq(cardsTable.accountId, accountId),
    ));

  if (!card) {
    res.status(404).json({ error: "Card not found" });
    return;
  }

  let k0: string, k1: string, k2: string, k3: string, k4: string;
  try {
    k0 = decrypt(card.aesKey0);
    k1 = decrypt(card.aesKey1);
    k2 = decrypt(card.aesKey2);
    k3 = decrypt(card.aesKey3);
    k4 = decrypt(card.aesKey4);
  } catch {
    logger.error({ cardId }, "Failed to decrypt card AES keys for wipe");
    res.status(500).json({ error: "Internal error" });
    return;
  }

  // Factory settings for ChangeFileSettings (reset SDM)
  const factorySettings = Buffer.from([0x40, 0xE0, 0xEE, 0x01, 0xFF, 0xFF]);

  logger.info({ cardId, accountId }, "posBOX wipe-keys served");

  res.json({
    cardId,
    k0, k1, k2, k3, k4,
    factorySettings: factorySettings.toString("hex"),
  });
});

// POST /pos/mark-wiped/:cardId — mark a card as wiped.
router.post("/pos/mark-wiped/:cardId", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.auth!.accountId;
  const cardId = req.params.cardId as string;

  const [card] = await db
    .select()
    .from(cardsTable)
    .where(and(
      eq(cardsTable.id, cardId),
      eq(cardsTable.accountId, accountId),
    ));

  if (!card) {
    res.status(404).json({ error: "Card not found" });
    return;
  }

  await db
    .update(cardsTable)
    .set({ status: "cancelled", lastUsedAt: new Date() })
    .where(eq(cardsTable.id, cardId));

  logger.info({ cardId, accountId }, "Card marked as wiped");
  res.json({ status: "OK" });
});

export default router;
