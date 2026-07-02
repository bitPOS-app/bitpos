import { db } from "@workspace/db";
import { transactionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { payInvoice, makeInvoice, getAccountNwcUrl } from "./nwc";
import { logger } from "./logger";

// Veil collects its own fee on every outgoing payment.
// bitPOS reports 0 platform fee - all custody and fee handling is Veil's responsibility.
export function calculateFee(amountSats: number): {
  feeSats: number;
  bankSats: number;
  totalDeducted: number;
} {
  return { feeSats: 0, bankSats: 0, totalDeducted: amountSats };
}

/**
 * Process an outbound Lightning payment via the user's personal Veil wallet.
 *
 * Veil payments are atomic - they either succeed or fail with an error.
 * No DB balance manipulation is performed; Veil is the source of truth for balances.
 * A local transaction record is kept for UI history display only.
 */
export async function processExternalPayment(
  accountId: string,
  bolt11: string,
  amountSats: number,
  counterpartLnAddress?: string,
  memo?: string,
  nwcUrl?: string,
  cardId?: string,
): Promise<{ paymentHash: string; feeSats: number }> {
  const walletUrl = nwcUrl ?? await getAccountNwcUrl(accountId);
  if (!walletUrl) throw new Error("No wallet configured for this account");

  const [pendingTx] = await db
    .insert(transactionsTable)
    .values({
      accountId,
      direction: "out",
      amountSats,
      feeSats: 0,
      type: "send",
      counterpartLnAddress,
      bolt11,
      status: "pending",
      memo,
      cardId: cardId ?? null,
    })
    .returning({ id: transactionsTable.id });

  try {
    const payResult = await payInvoice(bolt11, walletUrl);

    await db
      .update(transactionsTable)
      .set({ status: "completed", paymentHash: payResult.paymentHash })
      .where(eq(transactionsTable.id, pendingTx.id));

    logger.info(
      { accountId, amountSats, paymentHash: payResult.paymentHash },
      "External payment processed via Veil",
    );

    return { paymentHash: payResult.paymentHash, feeSats: 0 };
  } catch (err) {
    const failureReason = err instanceof Error ? err.message : String(err);
    await db
      .update(transactionsTable)
      .set({ status: "failed", failureReason })
      .where(eq(transactionsTable.id, pendingTx.id))
      .catch((dbErr) =>
        logger.error({ dbErr, pendingTxId: pendingTx.id }, "Failed to mark transaction as failed"),
      );
    throw err;
  }
}

/**
 * Process an in-network payment between two bitPOS accounts via Veil.
 *
 * Creates a real Lightning invoice on the receiver's Veil wallet and pays it
 * from the sender's Veil wallet. Both sides get local transaction records.
 */
export async function processInternalPayment(
  senderAccountId: string,
  receiverAccountId: string,
  amountSats: number,
  senderHandle: string,
  receiverHandle: string,
  memo?: string,
): Promise<void> {
  const senderNwcUrl = await getAccountNwcUrl(senderAccountId);
  if (!senderNwcUrl) throw new Error("No wallet configured for sender");

  const receiverNwcUrl = await getAccountNwcUrl(receiverAccountId);
  if (!receiverNwcUrl) throw new Error("No wallet configured for receiver");

  const invoiceDesc = memo ?? `From ${senderHandle}`;
  const invoiceResult = await makeInvoice(amountSats, invoiceDesc, 300, receiverNwcUrl);

  const [sendTx] = await db
    .insert(transactionsTable)
    .values({
      accountId: senderAccountId,
      direction: "out",
      amountSats,
      feeSats: 0,
      type: "internal_send",
      counterpartHandle: receiverHandle,
      status: "pending",
      memo,
    })
    .returning({ id: transactionsTable.id });

  try {
    const payResult = await payInvoice(invoiceResult.bolt11, senderNwcUrl);

    await db
      .update(transactionsTable)
      .set({ status: "completed", paymentHash: payResult.paymentHash })
      .where(eq(transactionsTable.id, sendTx.id));

    await db.insert(transactionsTable).values({
      accountId: receiverAccountId,
      direction: "in",
      amountSats,
      feeSats: 0,
      type: "internal_receive",
      counterpartHandle: senderHandle,
      status: "completed",
      paymentHash: payResult.paymentHash,
      bolt11: invoiceResult.bolt11,
      memo,
    });

    logger.info({ senderAccountId, receiverAccountId, amountSats }, "Internal payment settled via Veil");
  } catch (err) {
    const failureReason = err instanceof Error ? err.message : String(err);
    await db
      .update(transactionsTable)
      .set({ status: "failed", failureReason })
      .where(eq(transactionsTable.id, sendTx.id))
      .catch(() => {});
    throw new Error(`Payment failed: ${failureReason}`);
  }
}
