/**
 * Public PIN session routes - no authentication required.
 * These are called by the hosted /pay/:sessionId page running on the POS device.
 *
 * GET  /api/pin-session/:id           - fetch session info (amount, status, expiry)
 * POST /api/pin-session/:id/authorize - submit PIN; executes payment on success
 */
import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { pinPaymentSessionsTable, cardsTable, transactionsTable } from "@workspace/db";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { processExternalPayment, AmbiguousPaymentError, resolveAmbiguousPayment } from "../lib/feeEngine";
import { getAccountNwcUrl } from "../lib/nwc";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── GET /api/pin-session/:id ──────────────────────────────────────────────────
router.get("/pin-session/:id", async (req, res): Promise<void> => {
  const id = String(req.params.id);

  const [session] = await db
    .select({
      id: pinPaymentSessionsTable.id,
      amountSats: pinPaymentSessionsTable.amountSats,
      status: pinPaymentSessionsTable.status,
      expiresAt: pinPaymentSessionsTable.expiresAt,
      cardLabel: pinPaymentSessionsTable.cardLabel,
    })
    .from(pinPaymentSessionsTable)
    .where(eq(pinPaymentSessionsTable.id, id));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  // Auto-expire in response if past deadline (pending or processing sessions can expire)
  const isExpired =
    (session.status === "pending" || session.status === "processing") &&
    new Date() > new Date(session.expiresAt);
  const effectiveStatus = isExpired ? "expired" : session.status;

  res.json({
    amountSats: session.amountSats,
    status: effectiveStatus,
    expiresAt: session.expiresAt,
    cardLabel: session.cardLabel ?? null,
  });
});

// ── POST /api/pin-session/:id/authorize ───────────────────────────────────────
router.post("/pin-session/:id/authorize", async (req, res): Promise<void> => {
  const id = String(req.params.id);
  const pin = typeof req.body?.pin === "string" ? req.body.pin : null;

  if (!pin || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ status: "ERROR", reason: "PIN must be exactly 4 digits" });
    return;
  }

  // ── Load session ────────────────────────────────────────────────────────────
  const [session] = await db
    .select()
    .from(pinPaymentSessionsTable)
    .where(eq(pinPaymentSessionsTable.id, id));

  if (!session) {
    res.status(404).json({ status: "ERROR", reason: "Session not found" });
    return;
  }

  if (session.status === "authorized") {
    res.json({ status: "OK", reason: "Already authorized" });
    return;
  }

  // Processing = another concurrent request already claimed the session and is
  // executing the payment right now - tell the frontend to keep polling.
  if (session.status === "processing") {
    res.status(409).json({ status: "PENDING", reason: "Payment already in progress - please wait" });
    return;
  }

  if (session.status === "expired" || new Date() > new Date(session.expiresAt)) {
    await db
      .update(pinPaymentSessionsTable)
      .set({ status: "expired" })
      .where(eq(pinPaymentSessionsTable.id, id));
    res.status(410).json({ status: "ERROR", reason: "Session expired - please tap your card again" });
    return;
  }

  if (session.status === "failed") {
    res.status(403).json({ status: "ERROR", reason: "Card is locked - unlock it in the bitPOS app" });
    return;
  }

  // ── Load card (status + PIN + limits) ─────────────────────────────────────
  const [card] = await db
    .select({
      status: cardsTable.status,
      pinHash: cardsTable.pinHash,
      pinFailCount: cardsTable.pinFailCount,
      pinLockedAt: cardsTable.pinLockedAt,
      dailyLimitSats: cardsTable.dailyLimitSats,
    })
    .from(cardsTable)
    .where(eq(cardsTable.id, session.cardId));

  if (!card?.pinHash) {
    res.status(409).json({ status: "ERROR", reason: "Card PIN not configured" });
    return;
  }

  // Re-check card status at authorization time (may have been frozen/cancelled since tap)
  if (card.status !== "active") {
    res.status(403).json({ status: "ERROR", reason: `Card is ${card.status} - check the bitPOS app` });
    return;
  }

  if (card.pinLockedAt) {
    await db
      .update(pinPaymentSessionsTable)
      .set({ status: "failed" })
      .where(eq(pinPaymentSessionsTable.id, id));
    res.status(403).json({ status: "ERROR", reason: "Card is locked - unlock it in the bitPOS app" });
    return;
  }

  // ── Re-check daily spending limit at authorization time ────────────────────
  // The tap-time check may be stale - other transactions may have occurred in
  // the session window (up to 5 min), so we re-query before executing payment.
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  const [spentRow] = await db
    .select({ totalSats: sql<number>`coalesce(sum(${transactionsTable.amountSats}), 0)` })
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.cardId, session.cardId),
        eq(transactionsTable.direction, "out"),
        eq(transactionsTable.status, "completed"),
        gte(transactionsTable.createdAt, todayUtc),
      ),
    );

  const spentToday = Number(spentRow?.totalSats ?? 0);
  if (spentToday + session.amountSats > card.dailyLimitSats) {
    res.status(403).json({ status: "ERROR", reason: "Daily spending limit would be exceeded" });
    return;
  }

  // ── Verify PIN ─────────────────────────────────────────────────────────────
  const pinMatch = await bcrypt.compare(pin, card.pinHash);

  if (!pinMatch) {
    const newCardFailCount = card.pinFailCount + 1;
    const newSessionFailCount = session.pinFailCount + 1;

    if (newCardFailCount >= 3) {
      await db
        .update(cardsTable)
        .set({ pinFailCount: newCardFailCount, pinLockedAt: new Date() })
        .where(eq(cardsTable.id, session.cardId));
      await db
        .update(pinPaymentSessionsTable)
        .set({ status: "failed", pinFailCount: newSessionFailCount })
        .where(eq(pinPaymentSessionsTable.id, id));
      logger.warn({ sessionId: id, cardId: session.cardId }, "Card PIN locked via hosted session after 3 failures");
      res.status(403).json({ status: "ERROR", reason: "Card is now locked - unlock it in the bitPOS app." });
    } else {
      await db
        .update(cardsTable)
        .set({ pinFailCount: newCardFailCount })
        .where(eq(cardsTable.id, session.cardId));
      await db
        .update(pinPaymentSessionsTable)
        .set({ pinFailCount: newSessionFailCount })
        .where(eq(pinPaymentSessionsTable.id, id));
      const attemptsLeft = 3 - newCardFailCount;
      logger.warn({ sessionId: id, cardId: session.cardId, newCardFailCount }, "Wrong PIN in hosted session");
      res.status(401).json({
        status: "ERROR",
        reason: `Incorrect PIN. ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} remaining.`,
        attemptsLeft,
      });
    }
    return;
  }

  // ── Atomic claim: flip status pending → processing ────────────────────────
  // Single conditional UPDATE prevents concurrent submissions from both
  // executing the payment. `processing` is the in-flight state; `authorized`
  // is written only after the Lightning payment settles successfully.
  const [claimed] = await db
    .update(pinPaymentSessionsTable)
    .set({ status: "processing" })
    .where(and(eq(pinPaymentSessionsTable.id, id), eq(pinPaymentSessionsTable.status, "pending")))
    .returning({ id: pinPaymentSessionsTable.id });

  if (!claimed) {
    // Another concurrent request is already processing this session
    res.status(409).json({ status: "PENDING", reason: "Payment already in progress - please wait" });
    return;
  }

  // ── Execute payment ────────────────────────────────────────────────────────
  try {
    const { paymentHash, feeSats } = await processExternalPayment(
      session.accountId,
      session.pr,
      session.amountSats,
      undefined,
      `Bolt Card payment (${session.cardLabel ?? session.cardId.slice(-8)})`,
      undefined,
      session.cardId,
    );

    // Payment settled - mark authorized (final success state)
    await db
      .update(pinPaymentSessionsTable)
      .set({ status: "authorized" })
      .where(eq(pinPaymentSessionsTable.id, id));

    // Reset card fail counter (fire and forget - payment is already complete)
    db.update(cardsTable).set({ pinFailCount: 0 }).where(eq(cardsTable.id, session.cardId)).catch(
      (err) => logger.error({ err, cardId: session.cardId }, "Failed to reset card PIN fail count"),
    );

    logger.info(
      { sessionId: id, cardId: session.cardId, amountSats: session.amountSats, feeSats, paymentHash },
      "Hosted PIN session payment authorized and completed",
    );
    res.json({ status: "OK" });
  } catch (err: unknown) {
    // AMBIGUOUS outcome (relay reply timeout): the payment may have succeeded.
    // Do NOT reset to pending - a retry could double-pay. Resolve first.
    if (err instanceof AmbiguousPaymentError) {
      logger.warn({ sessionId: id, cardId: session.cardId, err: err.message }, "PIN session payment outcome ambiguous - resolving");
      const nwcUrl = await getAccountNwcUrl(session.accountId).catch(() => undefined);
      const outcome = await resolveAmbiguousPayment(err, nwcUrl);
      if (outcome.status === "completed") {
        await db
          .update(pinPaymentSessionsTable)
          .set({ status: "authorized" })
          .where(eq(pinPaymentSessionsTable.id, id));
        db.update(cardsTable).set({ pinFailCount: 0 }).where(eq(cardsTable.id, session.cardId)).catch(
          (resetErr) => logger.error({ resetErr, cardId: session.cardId }, "Failed to reset card PIN fail count"),
        );
        logger.info({ sessionId: id, cardId: session.cardId }, "PIN session ambiguous payment resolved: settled");
        res.json({ status: "OK" });
        return;
      }
      if (outcome.status === "pending") {
        // Keep the session in `processing` so it cannot be re-submitted; the
        // background reconciler finalizes the transaction and expiry cleanup
        // eventually closes the session.
        res.status(202).json({ status: "PENDING", reason: "Payment is still processing - do not retry. Check the bitPOS app." });
        return;
      }
      // definitive failure - fall through to the normal failure handling
    }
    // Payment failed - reset to pending so the cardholder can retry
    await db
      .update(pinPaymentSessionsTable)
      .set({ status: "pending" })
      .where(eq(pinPaymentSessionsTable.id, id))
      .catch((resetErr) =>
        logger.error({ resetErr, sessionId: id }, "CRITICAL: failed to reset PIN session status after payment failure"),
      );
    const msg = err instanceof Error ? err.message : "Payment failed";
    logger.error({ sessionId: id, cardId: session.cardId, err: msg }, "Payment failed in hosted PIN session");
    res.status(500).json({ status: "ERROR", reason: msg });
  }
});

// ── Expiry cleanup (called by cron in index.ts) ───────────────────────────────
export async function expireStalePinSessions(): Promise<void> {
  const now = new Date();
  const result = await db
    .update(pinPaymentSessionsTable)
    .set({ status: "expired" })
    .where(
      and(
        sql`${pinPaymentSessionsTable.status} IN ('pending', 'processing')`,
        lt(pinPaymentSessionsTable.expiresAt, now),
      ),
    )
    .returning({ id: pinPaymentSessionsTable.id });

  if (result.length > 0) {
    logger.info({ count: result.length }, "Expired stale PIN payment sessions");
  }
}

export default router;
