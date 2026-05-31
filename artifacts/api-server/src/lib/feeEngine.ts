import { db } from "@workspace/db";
import {
  accountsTable,
  transactionsTable,
} from "@workspace/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { payInvoice } from "./nwc";
import { getBankAccountId } from "./bankAccount";
import { forwardPlatformRevenue } from "./platformRevenue";
import { logger } from "./logger";

const FEE_RATE = 0.03; // 3% outbound fee on external payments — all revenue goes to bank

export function calculateFee(amountSats: number): {
  feeSats: number;
  bankSats: number;
  totalDeducted: number;
} {
  const feeSats = Math.ceil(amountSats * FEE_RATE);
  return { feeSats, bankSats: feeSats, totalDeducted: amountSats + feeSats };
}

/**
 * Process an outbound Lightning payment with guaranteed ledger safety.
 *
 * Safety contract:
 * 1. Deduct funds atomically from the sender account BEFORE sending (using a
 *    conditional UPDATE that fails if the balance is insufficient).
 * 2. Record a "pending" transaction in the same DB transaction.
 * 3. Send the Lightning payment.
 * 4a. On success: finalize the transaction (status → completed, paymentHash stored).
 * 4b. On failure: compensate atomically (refund balance + mark transaction failed).
 *
 * This ensures the ledger is never left inconsistent even if the server crashes
 * between steps 3 and 4.
 */
/**
 * Payment architecture note:
 * All outbound Lightning payments go through the MAIN NWC node (no sub-wallet URL),
 * regardless of which account is sending. Virtual balances are DB-tracked.
 * Sub-wallet NWC URLs are only used for makeInvoice + lookupInvoice so that
 * received payments land in the correct Alby Hub sub-wallet bucket.
 *
 * @param _subWalletNwcUrl - unused; retained in signature for call-site clarity
 */
export async function processExternalPayment(
  accountId: string,
  bolt11: string,
  amountSats: number,
  counterpartLnAddress?: string,
  memo?: string,
  _subWalletNwcUrl?: string,
  cardId?: string,
): Promise<{ paymentHash: string; feeSats: number }> {
  const { feeSats, bankSats, totalDeducted } = calculateFee(amountSats);

  // ── Step 1 + 2: Debit & reserve in a single atomic transaction ───────────
  let pendingTxId: string;

  const reserved = await db.transaction(async (tx) => {
    // Conditional debit: only succeeds if balance is sufficient
    const [updated] = await tx
      .update(accountsTable)
      .set({ balanceSats: sql`${accountsTable.balanceSats} - ${totalDeducted}` })
      .where(
        and(
          eq(accountsTable.id, accountId),
          gte(accountsTable.balanceSats, totalDeducted),
        ),
      )
      .returning({ balanceSats: accountsTable.balanceSats });

    if (!updated) return null;

    const [pendingTx] = await tx
      .insert(transactionsTable)
      .values({
        accountId,
        direction: "out",
        amountSats,
        feeSats,
        type: "send",
        counterpartLnAddress,
        bolt11,
        status: "pending",
        memo,
        cardId: cardId ?? null,
      })
      .returning({ id: transactionsTable.id });

    return pendingTx;
  });

  if (!reserved) {
    throw new Error(
      `Insufficient balance or account not found (need ${totalDeducted} sats)`,
    );
  }

  pendingTxId = reserved.id;

  // ── Step 3: Send Lightning payment ───────────────────────────────────────
  let payResult: { paymentHash: string; preimage: string };
  try {
    // Always pay from the main NWC node - sub-wallet URLs are for receive only
    payResult = await payInvoice(bolt11);
  } catch (err) {
    // ── Step 4b: Compensate - refund the reserved amount ─────────────────
    await db.transaction(async (tx) => {
      await tx
        .update(accountsTable)
        .set({ balanceSats: sql`${accountsTable.balanceSats} + ${totalDeducted}` })
        .where(eq(accountsTable.id, accountId));

      const failureReason = err instanceof Error ? err.message : String(err);
      await tx
        .update(transactionsTable)
        .set({ status: "failed", failureReason })
        .where(eq(transactionsTable.id, pendingTxId));
    }).catch((compErr) =>
      logger.error({ compErr, pendingTxId }, "CRITICAL: compensation failed after payment error"),
    );

    throw err;
  }

  // ── Step 4a: Finalize - record payment hash + credit bank ────────────────
  const bankAccountId = await getBankAccountId();

  await db.transaction(async (tx) => {
    await tx
      .update(transactionsTable)
      .set({ status: "completed", paymentHash: payResult.paymentHash })
      .where(eq(transactionsTable.id, pendingTxId));

    await tx
      .update(accountsTable)
      .set({ balanceSats: sql`${accountsTable.balanceSats} + ${bankSats}` })
      .where(eq(accountsTable.id, bankAccountId));

    await tx.insert(transactionsTable).values({
      accountId: bankAccountId,
      direction: "in",
      amountSats: bankSats,
      feeSats: 0,
      type: "fee",
      status: "completed",
      memo: `Bank revenue from payment (tx ${pendingTxId})`,
    });
  });

  forwardPlatformRevenue(feeSats, pendingTxId).catch(() => { /* errors logged inside */ });

  logger.info(
    { accountId, amountSats, feeSats, bankSats, paymentHash: payResult.paymentHash },
    "External payment processed",
  );

  return { paymentHash: payResult.paymentHash, feeSats };
}

export async function processInternalPayment(
  senderAccountId: string,
  receiverAccountId: string,
  amountSats: number,
  senderHandle: string,
  receiverHandle: string,
  memo?: string,
): Promise<void> {
  const success = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(accountsTable)
      .set({ balanceSats: sql`${accountsTable.balanceSats} - ${amountSats}` })
      .where(
        and(
          eq(accountsTable.id, senderAccountId),
          gte(accountsTable.balanceSats, amountSats),
        ),
      )
      .returning({ id: accountsTable.id });

    if (!updated) return false;

    await tx
      .update(accountsTable)
      .set({ balanceSats: sql`${accountsTable.balanceSats} + ${amountSats}` })
      .where(eq(accountsTable.id, receiverAccountId));

    await tx.insert(transactionsTable).values({
      accountId: senderAccountId,
      direction: "out",
      amountSats,
      feeSats: 0,
      type: "internal_send",
      counterpartHandle: receiverHandle,
      status: "completed",
      memo,
    });

    await tx.insert(transactionsTable).values({
      accountId: receiverAccountId,
      direction: "in",
      amountSats,
      feeSats: 0,
      type: "internal_receive",
      counterpartHandle: senderHandle,
      status: "completed",
      memo,
    });

    return true;
  });

  if (!success) {
    throw new Error(`Insufficient balance for internal payment of ${amountSats} sats`);
  }

  logger.info({ senderAccountId, receiverAccountId, amountSats }, "Internal payment processed");
}

export async function creditAccount(
  accountId: string,
  amountSats: number,
  paymentHash?: string,
  bolt11?: string,
  memo?: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(accountsTable)
      .set({ balanceSats: sql`${accountsTable.balanceSats} + ${amountSats}` })
      .where(eq(accountsTable.id, accountId));

    await tx.insert(transactionsTable).values({
      accountId,
      direction: "in",
      amountSats,
      feeSats: 0,
      type: "receive",
      paymentHash,
      bolt11,
      status: "completed",
      memo,
    });
  });
}
