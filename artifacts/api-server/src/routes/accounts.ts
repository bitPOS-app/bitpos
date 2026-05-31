import { Router, type IRouter } from "express";
import { promises as dns } from "dns";
import { db } from "@workspace/db";
import {
  accountsTable,
  transactionsTable,
  pendingInvoicesTable,
  entitiesTable,
  swapsTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAccountAccess } from "../middleware/auth";
import { makeInvoice } from "../lib/nwc";
import { processExternalPayment, processInternalPayment, calculateFee } from "../lib/feeEngine";
import { createReverseSwap } from "../lib/boltz";
import { getSwapStatus } from "../lib/boltz";
import { decrypt, encrypt } from "../lib/encrypt";
import { DOMAIN } from "../lib/domain";
import {
  CreateInvoiceBody,
  PayBody,
  CreateSwapBody,
  ActivateBusinessBody,
  GetBalanceParams,
  ListTransactionsParams,
  CreateInvoiceParams,
  PayParams,
  CreateSwapParams,
  ActivateBusinessParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

/**
 * Decode a raw LNURL (bech32-encoded) string to the underlying HTTPS URL.
 * LNURL uses standard bech32 with hrp "lnurl".
 */
function decodeLnurl(lnurl: string): string {
  const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  const lower = lnurl.toLowerCase();
  const sepIdx = lower.lastIndexOf("1");
  if (sepIdx === -1) throw new Error("Invalid LNURL: no bech32 separator");
  const dataPart = lower.slice(sepIdx + 1);
  // Drop last 6 characters (bech32 checksum)
  const values = Array.from(dataPart.slice(0, -6)).map((c) => {
    const idx = CHARSET.indexOf(c);
    if (idx === -1) throw new Error(`Invalid bech32 character: ${c}`);
    return idx;
  });
  // Convert 5-bit groups → 8-bit bytes
  const bytes: number[] = [];
  let acc = 0, bits = 0;
  for (const val of values) {
    acc = (acc << 5) | val;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 0xff);
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

/**
 * Decode the sat amount from a bolt11 invoice's human-readable prefix.
 * Returns null for zero-amount invoices.
 */
function decodeBolt11AmountSats(invoice: string): number | null {
  const match = invoice.toLowerCase().match(/^ln[a-z]+(\d+)([munp])?1/);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  const unit = match[2];
  if (!unit) return num * 100_000_000;
  if (unit === "m") return Math.floor(num * 100_000);
  if (unit === "u") return Math.floor(num * 100);
  if (unit === "n") return Math.ceil(num / 10);
  if (unit === "p") return Math.ceil(num / 10_000);
  return null;
}

function resolveNwcUrl(encrypted: string | null | undefined): string | undefined {
  if (!encrypted) return undefined;
  try { return decrypt(encrypted); } catch { return undefined; }
}

/**
 * Returns true if the given IPv4/IPv6 address string is in a private, loopback,
 * or link-local range that should never be contacted from this server.
 */
function isPrivateIp(ip: string): boolean {
  const lower = ip.toLowerCase().trim();
  // IPv4 private / special ranges
  if (
    lower === "127.0.0.1" ||
    lower === "0.0.0.0" ||
    /^127\./.test(lower) ||          // 127.0.0.0/8 loopback
    /^10\./.test(lower) ||            // 10.0.0.0/8 private
    /^192\.168\./.test(lower) ||      // 192.168.0.0/16 private
    /^172\.(1[6-9]|2\d|3[01])\./.test(lower) || // 172.16-31.0.0/12 private
    /^169\.254\./.test(lower) ||      // 169.254.0.0/16 link-local (APIPA)
    /^100\.6[4-9]\./.test(lower) ||  // 100.64.0.0/10 shared address space
    /^100\.[7-9]\d\./.test(lower) ||
    /^100\.1[01]\d\./.test(lower) ||
    /^100\.12[0-7]\./.test(lower) ||
    /^192\.0\.2\./.test(lower) ||    // TEST-NET-1
    /^198\.51\.100\./.test(lower) || // TEST-NET-2
    /^203\.0\.113\./.test(lower)     // TEST-NET-3
  ) return true;
  // IPv6 loopback, link-local, ULA
  if (
    lower === "::1" ||
    lower === "::" ||
    /^fe80:/i.test(lower) ||         // IPv6 link-local
    /^fc[0-9a-f]{2}:/i.test(lower) || // IPv6 ULA (fc00::/7)
    /^fd[0-9a-f]{2}:/i.test(lower)   // IPv6 ULA (fd00::/8)
  ) return true;
  return false;
}

/**
 * SSRF guard: validates domain syntactically then resolves DNS to reject
 * any hostname that resolves to a private/internal IP address.
 *
 * Two-layer defense:
 * 1. Syntactic check catches obvious blocked names (localhost, known private IPs)
 * 2. DNS resolution check catches attacker-controlled domains that resolve to
 *    internal targets (e.g. attacker.com → 192.168.1.1)
 */
function isSafeDomainSyntax(domain: string): boolean {
  if (!domain || !/^[a-zA-Z0-9.-]+$/.test(domain)) return false;
  if (!domain.includes(".")) return false;
  const lower = domain.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost")) return false;
  return !isPrivateIp(lower);
}

async function isSafeDomainAfterDns(domain: string): Promise<boolean> {
  if (!isSafeDomainSyntax(domain)) return false;
  try {
    const result = await dns.lookup(domain, { all: true });
    for (const addr of result) {
      if (isPrivateIp(addr.address)) return false;
    }
  } catch {
    // DNS failure is treated as unsafe (deny by default)
    return false;
  }
  return true;
}

// Keep legacy sync helper name for callback-URL validation (already DNS-checked at domain step)
function isSafeDomain(domain: string): boolean {
  return isSafeDomainSyntax(domain);
}

// GET /accounts/:id/balance
router.get("/accounts/:id/balance", requireAccountAccess, async (req, res): Promise<void> => {
  const params = GetBalanceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [account] = await db
    .select({ balanceSats: accountsTable.balanceSats })
    .from(accountsTable)
    .where(eq(accountsTable.id, params.data.id));

  if (!account) { res.status(404).json({ error: "Account not found" }); return; }
  res.json({ balanceSats: account.balanceSats });
});

// GET /accounts/:id/transactions
router.get("/accounts/:id/transactions", requireAccountAccess, async (req, res): Promise<void> => {
  const params = ListTransactionsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  const txs = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.accountId, params.data.id))
    .orderBy(desc(transactionsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(txs);
});

// GET /accounts/:id/lightning-address
router.get("/accounts/:id/lightning-address", requireAccountAccess, async (req, res): Promise<void> => {
  const params = GetBalanceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [account] = await db
    .select({ entityId: accountsTable.entityId })
    .from(accountsTable)
    .where(eq(accountsTable.id, params.data.id));

  if (!account) { res.status(404).json({ error: "Account not found" }); return; }

  const [entity] = await db
    .select({ handle: entitiesTable.handle })
    .from(entitiesTable)
    .where(eq(entitiesTable.id, account.entityId));

  if (!entity) { res.status(404).json({ error: "Entity not found" }); return; }
  res.json({ lightningAddress: `${entity.handle}@${DOMAIN}` });
});

// POST /accounts/:id/fund - dedicated "fund account" endpoint (generates receive invoice)
router.post("/accounts/:id/fund", requireAccountAccess, async (req, res): Promise<void> => {
  const params = CreateInvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = CreateInvoiceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { amountSats, memo } = parsed.data;

  const [account] = await db
    .select({ albySubWalletNwcUrl: accountsTable.albySubWalletNwcUrl })
    .from(accountsTable)
    .where(eq(accountsTable.id, params.data.id));

  const nwcUrl = resolveNwcUrl(account?.albySubWalletNwcUrl);
  const invoiceResult = await makeInvoice(amountSats, memo ?? "Fund bitPOS account", 3600, nwcUrl);
  const nwcUrlEncrypted = nwcUrl ? encrypt(nwcUrl) : null;

  await db.insert(pendingInvoicesTable).values({
    accountId: params.data.id,
    bolt11: invoiceResult.bolt11,
    paymentHash: invoiceResult.paymentHash,
    amountSats,
    memo,
    nwcUrlEncrypted,
    expiresAt: invoiceResult.expiresAt,
  });

  res.status(201).json({
    bolt11: invoiceResult.bolt11,
    paymentHash: invoiceResult.paymentHash,
    amountSats,
    expiresAt: invoiceResult.expiresAt,
  });
});

// POST /accounts/:id/invoice
router.post("/accounts/:id/invoice", requireAccountAccess, async (req, res): Promise<void> => {
  const params = CreateInvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = CreateInvoiceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { amountSats, memo } = parsed.data;

  const [account] = await db
    .select({ albySubWalletNwcUrl: accountsTable.albySubWalletNwcUrl })
    .from(accountsTable)
    .where(eq(accountsTable.id, params.data.id));

  const nwcUrl = resolveNwcUrl(account?.albySubWalletNwcUrl);
  const invoiceResult = await makeInvoice(amountSats, memo ?? "bitPOS payment", 3600, nwcUrl);
  const nwcUrlEncrypted = nwcUrl ? encrypt(nwcUrl) : null;

  await db.insert(pendingInvoicesTable).values({
    accountId: params.data.id,
    bolt11: invoiceResult.bolt11,
    paymentHash: invoiceResult.paymentHash,
    amountSats,
    memo,
    nwcUrlEncrypted,
    expiresAt: invoiceResult.expiresAt,
  });

  res.status(201).json({
    bolt11: invoiceResult.bolt11,
    paymentHash: invoiceResult.paymentHash,
    amountSats,
    expiresAt: invoiceResult.expiresAt,
  });
});

// POST /accounts/:id/pay
router.post("/accounts/:id/pay", requireAccountAccess, async (req, res): Promise<void> => {
  const params = PayParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = PayBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const accountId = params.data.id;
  const { destination, amountSats, memo } = parsed.data;

  const [account] = await db
    .select({ albySubWalletNwcUrl: accountsTable.albySubWalletNwcUrl })
    .from(accountsTable)
    .where(eq(accountsTable.id, accountId));

  const nwcUrl = resolveNwcUrl(account?.albySubWalletNwcUrl);

  // Lightning address (user@domain)
  if (destination.includes("@")) {
    const atIdx = destination.indexOf("@");
    const destHandle = destination.slice(0, atIdx).toLowerCase();
    const destDomain = destination.slice(atIdx + 1).toLowerCase();

    if (!amountSats) {
      res.status(400).json({ error: "amountSats is required for Lightning address payments" });
      return;
    }

    // In-network: free internal DB transfer
    if (destDomain === DOMAIN || destDomain === "bitpos.app") {
      const [destEntity] = await db
        .select({ id: entitiesTable.id, handle: entitiesTable.handle })
        .from(entitiesTable)
        .where(eq(entitiesTable.handle, destHandle));

      if (!destEntity) { res.status(404).json({ error: "Recipient not found" }); return; }

      const [destAccount] = await db
        .select({ id: accountsTable.id })
        .from(accountsTable)
        .where(eq(accountsTable.entityId, destEntity.id));

      if (!destAccount) { res.status(404).json({ error: "Recipient account not found" }); return; }

      const [senderEntity] = await db
        .select({ handle: entitiesTable.handle })
        .from(entitiesTable)
        .where(eq(entitiesTable.id, req.auth!.entityId));

      await processInternalPayment(
        accountId,
        destAccount.id,
        amountSats,
        senderEntity?.handle ?? "unknown",
        destEntity.handle,
        memo,
      );

      res.json({ paymentHash: null, amountSats, feeSats: 0, type: "internal" });
      return;
    }

    // SSRF guard: syntactic check + DNS resolution to reject private/internal destinations
    if (!(await isSafeDomainAfterDns(destDomain))) {
      res.status(400).json({ error: "Invalid destination domain" });
      return;
    }

    // External Lightning address - resolve LNURL then pay
    const { default: axios } = await import("axios");
    const metaResp = await axios.get(
      `https://${destDomain}/.well-known/lnurlp/${destHandle}`,
      { timeout: 10000 },
    );

    const rawCallback = metaResp.data?.callback;
    if (!rawCallback || typeof rawCallback !== "string") {
      res.status(400).json({ error: "Invalid LNURL-pay endpoint at destination" });
      return;
    }

    // SSRF guard on the callback URL returned by the external LNURL endpoint -
    // an attacker-controlled server could otherwise redirect us to internal targets
    let parsedCallback: URL;
    try {
      parsedCallback = new URL(rawCallback);
    } catch {
      res.status(400).json({ error: "Malformed callback URL from LNURL endpoint" });
      return;
    }
    if (parsedCallback.protocol !== "https:") {
      res.status(400).json({ error: "LNURL callback must use HTTPS" });
      return;
    }
    if (!isSafeDomain(parsedCallback.hostname)) {
      res.status(400).json({ error: "LNURL callback redirects to internal network" });
      return;
    }

    const callbackResp = await axios.get(rawCallback, {
      params: { amount: amountSats * 1000 },
      timeout: 10000,
    });
    const bolt11 = callbackResp.data?.pr;

    if (!bolt11) {
      res.status(400).json({ error: "No invoice returned from destination LNURL callback" });
      return;
    }

    try {
      const result = await processExternalPayment(accountId, bolt11, amountSats, destination, memo, nwcUrl);
      res.json({ paymentHash: result.paymentHash, amountSats, feeSats: result.feeSats, type: "external" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(msg.toLowerCase().includes("insufficient") ? 400 : 502).json({ error: msg });
    }
    return;
  }

  // Raw LNURL (bech32-encoded, starts with lnurl1)
  if (destination.toLowerCase().startsWith("lnurl1")) {
    if (!amountSats) {
      res.status(400).json({ error: "amountSats is required for LNURL payments" });
      return;
    }

    let lnurlUrl: string;
    try {
      lnurlUrl = decodeLnurl(destination);
    } catch {
      res.status(400).json({ error: "Failed to decode LNURL" });
      return;
    }

    let parsedLnurlUrl: URL;
    try {
      parsedLnurlUrl = new URL(lnurlUrl);
    } catch {
      res.status(400).json({ error: "Invalid URL encoded in LNURL" });
      return;
    }

    if (!isSafeDomain(parsedLnurlUrl.hostname)) {
      res.status(400).json({ error: "LNURL points to internal network" });
      return;
    }

    const { default: axios } = await import("axios");
    const metaResp = await axios.get(lnurlUrl, { timeout: 10000 });

    const rawCallback = metaResp.data?.callback;
    if (!rawCallback || typeof rawCallback !== "string") {
      res.status(400).json({ error: "Invalid LNURL-pay endpoint" });
      return;
    }

    let parsedCallback: URL;
    try {
      parsedCallback = new URL(rawCallback);
    } catch {
      res.status(400).json({ error: "Malformed callback URL from LNURL endpoint" });
      return;
    }
    if (!isSafeDomain(parsedCallback.hostname)) {
      res.status(400).json({ error: "LNURL callback redirects to internal network" });
      return;
    }

    const callbackResp = await axios.get(rawCallback, {
      params: { amount: amountSats * 1000 },
      timeout: 10000,
    });
    const bolt11 = callbackResp.data?.pr;

    if (!bolt11) {
      res.status(400).json({ error: "No invoice returned from LNURL callback" });
      return;
    }

    try {
      const result = await processExternalPayment(accountId, bolt11, amountSats, undefined, memo, nwcUrl);
      res.json({ paymentHash: result.paymentHash, amountSats, feeSats: result.feeSats, type: "external" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(msg.toLowerCase().includes("insufficient") ? 400 : 502).json({ error: msg });
    }
    return;
  }

  // Raw bolt11 invoice
  if (!destination.toLowerCase().startsWith("ln")) {
    res.status(400).json({ error: "Invalid destination: must be a Lightning address, LNURL, or bolt11 invoice" });
    return;
  }

  const effectiveSats = amountSats ?? decodeBolt11AmountSats(destination);
  if (!effectiveSats || effectiveSats < 1) {
    res.status(400).json({ error: "amountSats is required for zero-amount invoices" });
    return;
  }

  try {
    const result = await processExternalPayment(accountId, destination, effectiveSats, undefined, memo, nwcUrl);
    res.json({ paymentHash: result.paymentHash, amountSats: effectiveSats, feeSats: result.feeSats, type: "external" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(msg.toLowerCase().includes("insufficient") ? 400 : 502).json({ error: msg });
  }
});

// POST /accounts/:id/swap - Lightning to on-chain via Boltz reverse swap
router.post("/accounts/:id/swap", requireAccountAccess, async (req, res): Promise<void> => {
  const params = CreateSwapParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = CreateSwapBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { destinationAddress, amountSats } = parsed.data;
  const accountId = params.data.id;

  const { feeSats, totalDeducted } = calculateFee(amountSats);

  const [account] = await db
    .select({ balanceSats: accountsTable.balanceSats, albySubWalletNwcUrl: accountsTable.albySubWalletNwcUrl })
    .from(accountsTable)
    .where(eq(accountsTable.id, accountId));

  if (!account || account.balanceSats < totalDeducted) {
    res.status(400).json({ error: "Insufficient balance" });
    return;
  }

  // Create the Boltz reverse swap to get the Lightning invoice
  const swap = await createReverseSwap(amountSats, destinationAddress);
  const nwcUrl = resolveNwcUrl(account.albySubWalletNwcUrl);

  // Persist swap FIRST so the boltz monitor can detect and compensate on any crash
  // that occurs between debit and DB write. paymentHash is filled in after payment.
  const [swapRow] = await db.insert(swapsTable).values({
    accountId,
    swapId: swap.id,
    invoice: swap.invoice,
    onchainAmountSats: swap.onchainAmount,
    destinationAddress,
    paymentHash: null,
    feeSats,
    totalDeductedSats: totalDeducted,
    claimPrivateKeyHex: swap.claimPrivateKeyHex,
    preimageHex: swap.preimageHex,
    status: "pending",
  }).returning({ id: swapsTable.id });

  // Now debit + pay Lightning. On failure, processExternalPayment compensates the
  // user balance. We also mark the swap failed so monitor skips it.
  let payResult: { paymentHash: string; feeSats: number };
  try {
    payResult = await processExternalPayment(
      accountId,
      swap.invoice,
      amountSats,
      undefined,
      `Boltz swap to ${destinationAddress}`,
      nwcUrl,
    );
  } catch (err) {
    // Mark swap failed - processExternalPayment already restored user balance
    await db
      .update(swapsTable)
      .set({ status: "failed" })
      .where(eq(swapsTable.id, swapRow.id))
      .catch(() => {/* best-effort */});
    throw err;
  }

  // Record payment hash now that we know it
  await db
    .update(swapsTable)
    .set({ paymentHash: payResult.paymentHash })
    .where(eq(swapsTable.id, swapRow.id));

  req.log.info({ accountId, amountSats, swapId: swap.id, feeSats, totalDeducted }, "Swap initiated");

  res.status(201).json({
    swapId: swap.id,
    onchainAmount: swap.onchainAmount,
    destinationAddress,
    feeSats,
    status: "pending",
    paymentHash: payResult.paymentHash,
    txid: null,
  });
});

// GET /accounts/:id/swaps/:swapId - check Boltz swap status
router.get("/accounts/:id/swaps/:swapId", requireAccountAccess, async (req, res): Promise<void> => {
  const accountId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const swapId = Array.isArray(req.params.swapId) ? req.params.swapId[0] : req.params.swapId;

  const [swap] = await db
    .select()
    .from(swapsTable)
    .where(eq(swapsTable.swapId, swapId));

  if (!swap || swap.accountId !== accountId) {
    res.status(404).json({ error: "Swap not found" });
    return;
  }

  // Fetch live txid from Boltz (non-fatal if unreachable)
  let liveTxid = swap.txid;
  try {
    const liveStatus = await getSwapStatus(swapId);
    if (liveStatus.transaction?.id) liveTxid = liveStatus.transaction.id;
  } catch { /* return DB state */ }

  res.json({
    swapId: swap.swapId,
    status: swap.status,
    onchainAmount: swap.onchainAmountSats,
    destinationAddress: swap.destinationAddress,
    txid: liveTxid,
    paymentHash: swap.paymentHash,
    createdAt: swap.createdAt,
    claimedAt: swap.claimedAt,
  });
});

// POST /accounts/:id/business
router.post("/accounts/:id/business", requireAccountAccess, async (req, res): Promise<void> => {
  const params = ActivateBusinessParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = ActivateBusinessBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [account] = await db
    .update(accountsTable)
    .set({ businessName: parsed.data.businessName, businessActive: true })
    .where(eq(accountsTable.id, params.data.id))
    .returning();

  if (!account) { res.status(404).json({ error: "Account not found" }); return; }

  req.log.info({ accountId: params.data.id, businessName: account.businessName }, "Business profile activated");

  res.json({
    id: account.id,
    type: account.type,
    businessName: account.businessName,
    businessActive: account.businessActive,
    balanceSats: account.balanceSats,
  });
});

export default router;
