/**
 * LNURLw (LNURL-withdraw) routes for Bolt Card tap-to-pay.
 *
 * Flow:
 *  1. Card tapped at NFC reader/wallet  → GET /card/:cardId?p=<hex>&c=<hex>
 *     - Server decrypts stored AES keys, verifies AES SUN params
 *     - Atomically advances counter (row-level lock), issues k1 challenge
 *     - Returns LNURLw JSON with callback URL
 *
 *  2. Wallet fetches lightning invoice from merchant POS, calls:
 *     GET /card/:cardId/callback?k1=<challenge>&pr=<bolt11>
 *     - k1 consumed ATOMICALLY (conditional UPDATE) - prevents double-spend race
 *     - Validates amount limits and balance, then executes payment
 *
 * These routes live at root level (no /api prefix) because NFC wallets call
 * the URL embedded in the card's NDEF record directly.
 */
import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { cardsTable, transactionsTable } from "@workspace/db";
import { eq, and, gte, isNull, isNotNull, sql } from "drizzle-orm";
import { decryptSunP, verifySunC, parseBolt11AmountSats, generateK1 } from "../lib/boltcard";
import { processExternalPayment } from "../lib/feeEngine";
import { getBalance, getAccountNwcUrl } from "../lib/nwc";
import { settleInvoiceByPaymentHash } from "../lib/invoiceMonitor";
import { decrypt } from "../lib/encrypt";
import { logger } from "../lib/logger";
import { DOMAIN } from "../lib/domain";

const router: IRouter = Router();
const K1_TTL_MS = 5 * 60 * 1000; // k1 challenge expires after 5 minutes

function resolveKey(encrypted: string): string {
  return decrypt(encrypted);
}

// ── Tap endpoint: GET /card/:cardId?p=<hex>&c=<hex> ─────────────────────────
router.get("/card/:cardId", async (req, res): Promise<void> => {
  const cardId = Array.isArray(req.params.cardId) ? req.params.cardId[0] : req.params.cardId;
  const pHex = String(req.query.p ?? "").toLowerCase();
  const cHex = String(req.query.c ?? "").toLowerCase();

  const [card] = await db
    .select()
    .from(cardsTable)
    .where(eq(cardsTable.id, cardId));

  if (!card) {
    res.json({ status: "ERROR", reason: "Card not found" });
    return;
  }

  if (card.status === "cancelled") {
    res.json({ status: "ERROR", reason: "Card has been cancelled" });
    return;
  }

  // ── LUD-21: Block tap if card PIN is locked ───────────────────────────────
  if (card.pinLockedAt) {
    res.json({ status: "ERROR", reason: "Card PIN is locked after too many failed attempts. Unlock it in the app." });
    return;
  }

  // NOTE: frozen cards are NOT rejected at tap time - the freeze check happens
  // at the callback stage so wallets (e.g. WoS) see the error at payment time
  // rather than hanging on an unhandled ERROR response from the tap endpoint.

  // ── Provisioning verification test ────────────────────────────────────────
  // The Bolt Card NFC Creator app verifies the lnurlw endpoint is reachable
  // after programming by sending all-zero p and c values. We must respond with
  // a valid withdrawRequest - AES-SUN cannot be verified with zero inputs.
  const isProvisioningTest =
    /^0+$/.test(pHex) && /^0+$/.test(cHex) && pHex.length > 0 && cHex.length > 0;

  if (isProvisioningTest) {
    logger.info({ cardId }, "Bolt Card provisioning verification test received");
    const provTestResp: Record<string, unknown> = {
      tag: "withdrawRequest",
      callback: `https://${DOMAIN}/card/${cardId}/callback`,
      k1: "0000000000000000000000000000000000000000000000000000000000000000",
      defaultDescription: card.note ?? "bitPOS card payment",
      minWithdrawable: 1000,
      maxWithdrawable: card.perTapLimitSats * 1000,
    };
    // LUD-21: always include pinLimit when PIN is enabled; null threshold → 0 (always required)
    if (card.pinHash != null) provTestResp.pinLimit = card.pinLimitMsats ?? 0;
    res.json(provTestResp);
    return;
  }

  // Balance is NOT checked here - Veil is the source of truth and the live
  // balance check happens at the callback stage. Keeping the tap fast and
  // reliable matters more than an early balance error.
  if (!pHex || !cHex) {
    res.json({ status: "ERROR", reason: "Missing p or c parameter" });
    return;
  }

  // ── AES SUN verification - decrypt stored keys first ─────────────────────
  let key1Hex: string;
  let key2Hex: string;
  try {
    key1Hex = resolveKey(card.aesKey1);
    key2Hex = resolveKey(card.aesKey2);
  } catch {
    logger.error({ cardId }, "Failed to decrypt card AES keys");
    res.json({ status: "ERROR", reason: "Internal error" });
    return;
  }

  const sunData = decryptSunP(key1Hex, pHex);
  if (!sunData) {
    logger.warn({ cardId }, "Bolt Card p-parameter decryption failed - card keys likely out of sync with DB");
    res.json({ status: "ERROR", reason: "Card authentication failed. If you recently wiped this card, please re-provision it." });
    return;
  }

  if (!verifySunC(key2Hex, sunData.uid, sunData.counter, cHex)) {
    logger.warn({ cardId }, "Bolt Card CMAC verification failed");
    res.json({ status: "ERROR", reason: "Card authentication failed (CMAC mismatch). Please re-provision the card." });
    return;
  }

  // ── Counter replay protection ─────────────────────────────────────────────
  // Row-level lock ensures only one concurrent tap can advance the counter.
  const k1 = generateK1();
  const k1ExpiresAt = new Date(Date.now() + K1_TTL_MS);

  const advanced = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ counter: cardsTable.counter })
      .from(cardsTable)
      .where(eq(cardsTable.id, cardId))
      .for("update");

    if (!current) return false;
    if (sunData.counter <= current.counter) return false;

    await tx
      .update(cardsTable)
      .set({
        counter: sunData.counter,
        lastUsedAt: new Date(),
        pendingK1: k1,
        pendingK1ExpiresAt: k1ExpiresAt,
        // Bind UID to this physical chip on first tap; never overwrite once set
        ...(card.uid == null ? { uid: sunData.uid.toString("hex") } : {}),
      })
      .where(eq(cardsTable.id, cardId));

    return true;
  });

  if (!advanced) {
    logger.warn({ cardId, counter: sunData.counter }, "Counter replay rejected");
    res.json({ status: "ERROR", reason: "Counter replay detected" });
    return;
  }

  // ── Daily limit check ─────────────────────────────────────────────────────
  // Only count completed transactions - failed/pending don't represent real spend
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);

  const [spentRow] = await db
    .select({ totalSats: sql<number>`coalesce(sum(${transactionsTable.amountSats}), 0)` })
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.cardId, cardId),
        eq(transactionsTable.direction, "out"),
        eq(transactionsTable.status, "completed"),
        gte(transactionsTable.createdAt, todayUtc),
      ),
    );

  const spentToday = Number(spentRow?.totalSats ?? 0);
  const remainingDailySats = card.dailyLimitSats - spentToday;

  if (remainingDailySats <= 0) {
    res.json({ status: "ERROR", reason: "Daily spending limit reached" });
    return;
  }

  // maxWithdrawable is capped by the card's spending limits only - the account
  // balance is intentionally excluded so it is never exposed to the reading wallet.
  // All real enforcement (balance, per-tap, daily) happens at the callback stage.
  const maxWithdrawableSats = Math.min(card.perTapLimitSats, remainingDailySats);

  // ── Return LNURLw response ────────────────────────────────────────────────
  const tapResp: Record<string, unknown> = {
    tag: "withdrawRequest",
    callback: `https://${DOMAIN}/card/${cardId}/callback`,
    k1,
    defaultDescription: card.note ?? "bitPOS card payment",
    minWithdrawable: 1000,
    maxWithdrawable: maxWithdrawableSats * 1000,
  };
  // LUD-21: always include pinLimit when PIN is enabled so POS wallets know to prompt.
  // pinLimitMsats=null means "always required", represented as 0 on the wire.
  if (card.pinHash != null) tapResp.pinLimit = card.pinLimitMsats ?? 0;
  res.json(tapResp);
});

// ── Callback: GET /card/:cardId/callback?k1=<challenge>&pr=<bolt11> ──────────
router.get("/card/:cardId/callback", async (req, res): Promise<void> => {
  const cardId = Array.isArray(req.params.cardId) ? req.params.cardId[0] : req.params.cardId;
  const k1 = String(req.query.k1 ?? "");
  const pr = String(req.query.pr ?? "");
  const pinParam = req.query.pin ? String(req.query.pin) : undefined;

  if (!k1 || !pr) {
    res.json({ status: "ERROR", reason: "Missing k1 or pr parameter" });
    return;
  }

  // ── Pre-check frozen status (non-atomic, safe - k1 consumption below is still atomic) ──
  const [cardRow] = await db
    .select({ status: cardsTable.status, name: cardsTable.name, note: cardsTable.note })
    .from(cardsTable)
    .where(eq(cardsTable.id, cardId));

  if (cardRow?.status === "frozen") {
    res.json({ status: "ERROR", reason: "Card is frozen - unfreeze it in the bitPOS app to pay" });
    return;
  }

  // ── Atomic k1 consumption ─────────────────────────────────────────────────
  // Single conditional UPDATE: only succeeds if k1 matches and hasn't expired.
  // This prevents any two concurrent callbacks from both passing validation -
  // only one will see a non-null return, the other gets null → rejected.
  const now = new Date();
  const [consumed] = await db
    .update(cardsTable)
    .set({ pendingK1: null, pendingK1ExpiresAt: null })
    .where(
      and(
        eq(cardsTable.id, cardId),
        eq(cardsTable.status, "active"),
        eq(cardsTable.pendingK1, k1),
        isNotNull(cardsTable.pendingK1ExpiresAt),
        gte(cardsTable.pendingK1ExpiresAt, now),
        // LUD-21: reject callback if card PIN is locked (defence-in-depth; tap endpoint also blocks)
        isNull(cardsTable.pinLockedAt),
      ),
    )
    .returning({
      accountId: cardsTable.accountId,
      perTapLimitSats: cardsTable.perTapLimitSats,
      dailyLimitSats: cardsTable.dailyLimitSats,
      pinHash: cardsTable.pinHash,
      pinLimitMsats: cardsTable.pinLimitMsats,
      pinFailCount: cardsTable.pinFailCount,
    });

  if (!consumed) {
    res.json({ status: "ERROR", reason: "Invalid or expired k1" });
    return;
  }

  const { accountId: cardAccountId, perTapLimitSats, dailyLimitSats, pinHash, pinLimitMsats, pinFailCount } = consumed;
  const cardShortId = cardId.replace(/-/g, "").slice(-8).replace(/(.{4})(.{4})/, "$1 $2");
  const cardLabel = cardRow?.name ?? cardShortId;

  // ── Decode bolt11 amount ──────────────────────────────────────────────────
  const amountSats = parseBolt11AmountSats(pr);
  if (amountSats === null || amountSats <= 0) {
    res.json({ status: "ERROR", reason: "Invalid or zero-amount invoice" });
    return;
  }

  // ── Per-tap limit check ───────────────────────────────────────────────────
  if (amountSats > perTapLimitSats) {
    res.json({
      status: "ERROR",
      reason: `Amount ${amountSats} sats exceeds per-tap limit of ${perTapLimitSats} sats`,
    });
    return;
  }

  // ── Daily limit check ─────────────────────────────────────────────────────
  // Only count completed transactions - pending/failed do not count as real spend
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);

  const [spentRow] = await db
    .select({ totalSats: sql<number>`coalesce(sum(${transactionsTable.amountSats}), 0)` })
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.cardId, cardId),
        eq(transactionsTable.direction, "out"),
        eq(transactionsTable.status, "completed"),
        gte(transactionsTable.createdAt, todayUtc),
      ),
    );

  const spentToday = Number(spentRow?.totalSats ?? 0);
  if (spentToday + amountSats > dailyLimitSats) {
    res.json({ status: "ERROR", reason: "Daily spending limit would be exceeded" });
    return;
  }

  // ── LUD-21 PIN verification ───────────────────────────────────────────────
  if (pinHash) {
    const amountMsats = amountSats * 1000;
    // null threshold = always required (wire value 0 means all amounts qualify)
    const pinRequired = amountMsats >= (pinLimitMsats ?? 0);

    if (pinRequired) {
      if (!pinParam) {
        res.json({ status: "ERROR", reason: "PIN required" });
        return;
      }

      const pinMatch = await bcrypt.compare(pinParam, pinHash);
      if (!pinMatch) {
        const newFailCount = pinFailCount + 1;
        if (newFailCount >= 3) {
          await db
            .update(cardsTable)
            .set({ pinFailCount: newFailCount, pinLockedAt: new Date() })
            .where(eq(cardsTable.id, cardId));
          logger.warn({ cardId }, "Card PIN locked after 3 failed attempts");
          res.json({ status: "ERROR", reason: "Incorrect PIN. Card is now locked - unlock it in the app." });
        } else {
          await db
            .update(cardsTable)
            .set({ pinFailCount: newFailCount })
            .where(eq(cardsTable.id, cardId));
          logger.warn({ cardId, failCount: newFailCount }, "Card PIN mismatch");
          res.json({ status: "ERROR", reason: `Incorrect PIN. ${3 - newFailCount} attempt(s) remaining.` });
        }
        return;
      }

      // PIN matched - reset fail counter
      await db
        .update(cardsTable)
        .set({ pinFailCount: 0 })
        .where(eq(cardsTable.id, cardId));
    }
  }

  // ── Live balance check against the account's Veil wallet ─────────────────
  // Veil is the source of truth for balances - the legacy DB balance column is
  // no longer used. Veil charges 1% on outgoing payments, so require that
  // headroom up front for a clear error; Veil still enforces authoritatively.
  const nwcUrl = await getAccountNwcUrl(cardAccountId);
  if (!nwcUrl) {
    res.json({ status: "ERROR", reason: "No wallet configured for this account" });
    return;
  }

  // The balance pre-check is advisory only - Veil enforces the real limit on
  // pay_invoice. If the relay is flaky, proceed to payment rather than failing
  // the tap on a read we do not strictly need.
  try {
    const { balanceSats: liveBalanceSats } = await getBalance(nwcUrl);
    if (liveBalanceSats < Math.ceil(amountSats * 1.01)) {
      res.json({ status: "ERROR", reason: "Insufficient balance" });
      return;
    }
  } catch (err) {
    logger.warn({ cardId, accountId: cardAccountId, err }, "Balance pre-check unavailable - proceeding, Veil enforces limits");
  }

  // ── Execute payment via the account's Veil wallet ─────────────────────────
  // Both in-network and external invoices are paid the same way - the invoice
  // is a real Lightning invoice (bitPOS merchant invoices live on the
  // merchant's Veil wallet), and the invoice monitor settles the receiver side.
  try {
    const { paymentHash, feeSats } = await processExternalPayment(
      cardAccountId,
      pr,
      amountSats,
      undefined,
      `Bolt Card payment (${cardLabel})`,
      nwcUrl,
      cardId,
    );
    logger.info({ cardId, accountId: cardAccountId, amountSats, feeSats, paymentHash }, "Bolt Card payment completed via Veil");

    // Fast-path settlement for in-network invoices: if this bolt11 belongs to a
    // bitPOS merchant, mark it paid immediately so the POS confirms in real time
    // instead of waiting for the push subscription or fallback sweep. The settle
    // is idempotent (conditional on paidAt IS NULL), so a concurrent monitor
    // notification cannot double-settle.
    try {
      await settleInvoiceByPaymentHash(paymentHash, new Date());
    } catch (settleErr) {
      logger.warn({ cardId, paymentHash, settleErr }, "Fast-path invoice settlement failed - invoice monitor will settle");
    }

    res.json({ status: "OK" });
  } catch (err: unknown) {
    logger.error({ cardId, accountId: cardAccountId, amountSats, err }, "Bolt Card payment failed");
    res.json({ status: "ERROR", reason: "Payment failed. Please try again." });
  }
});

export default router;
