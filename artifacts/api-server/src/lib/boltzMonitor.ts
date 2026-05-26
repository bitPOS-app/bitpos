import cron from "node-cron";
import { db } from "@workspace/db";
import { accountsTable, swapsTable, transactionsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { getSwapStatus } from "./boltz";
import { logger } from "./logger";

const TERMINAL_STATUSES = new Set(["claimed", "failed", "expired"]);

type SwapFinalStatus = "claimed" | "failed" | "expired";

/**
 * Refund a user's reserved swap funds atomically.
 * Called when Boltz reports a swap as failed or expired.
 */
async function refundSwap(swap: typeof swapsTable.$inferSelect, reason: SwapFinalStatus): Promise<void> {
  const refundAmount = swap.totalDeductedSats > 0 ? swap.totalDeductedSats : swap.onchainAmountSats;

  await db.transaction(async (tx) => {
    // Guard: only process if swap is still pending - prevents double-refund across
    // concurrent monitor workers or retries
    const [updated] = await tx
      .update(swapsTable)
      .set({ status: reason })
      .where(
        and(
          eq(swapsTable.id, swap.id),
          eq(swapsTable.status, "pending"),
        ),
      )
      .returning({ id: swapsTable.id });

    if (!updated) return; // Already processed by another worker

    // Credit back the full deducted amount to the user
    await tx
      .update(accountsTable)
      .set({ balanceSats: sql`${accountsTable.balanceSats} + ${refundAmount}` })
      .where(eq(accountsTable.id, swap.accountId));

    await tx.insert(transactionsTable).values({
      accountId: swap.accountId,
      direction: "in",
      amountSats: refundAmount,
      feeSats: 0,
      type: "swap_refund",
      status: "completed",
      memo: `Boltz swap ${swap.swapId} ${reason} - ${refundAmount} sats refunded`,
    });
  });

  logger.info(
    { swapId: swap.swapId, reason, refundAmount },
    "Boltz swap refunded",
  );
}

export function startBoltzMonitor(): void {
  cron.schedule("*/60 * * * * *", async () => {
    try {
      const pending = await db
        .select()
        .from(swapsTable)
        .where(eq(swapsTable.status, "pending"));

      for (const swap of pending) {
        try {
          const status = await getSwapStatus(swap.swapId);

          let newStatus: "pending" | "claimed" | "failed" | "expired" = "pending";

          if (status.status === "transaction.claimed") {
            newStatus = "claimed";
          } else if (
            status.status === "swap.expired" ||
            status.status === "invoice.expired"
          ) {
            newStatus = "expired";
          } else if (status.status === "transaction.failed") {
            newStatus = "failed";
          }

          if (newStatus === "claimed") {
            // Finalize: record txid + mark as claimed (funds already deducted at creation)
            await db
              .update(swapsTable)
              .set({
                status: "claimed",
                txid: status.transaction?.id ?? swap.txid,
                claimedAt: new Date(),
              })
              .where(eq(swapsTable.id, swap.id));

            logger.info(
              { swapId: swap.swapId, txid: status.transaction?.id },
              "Boltz swap claimed - on-chain TX confirmed",
            );
          } else if (newStatus === "failed" || newStatus === "expired") {
            // Compensate: refund the user's reserved funds atomically
            await refundSwap(swap, newStatus);
          } else if (status.transaction?.id && !swap.txid) {
            // Persist intermediate txid even if not yet final
            await db
              .update(swapsTable)
              .set({ txid: status.transaction.id })
              .where(eq(swapsTable.id, swap.id));
          }
        } catch (err) {
          logger.warn({ err, swapId: swap.swapId }, "Failed to poll Boltz swap status");
        }
      }
    } catch (err) {
      logger.error({ err }, "Boltz monitor error");
    }
  });

  logger.info("Boltz swap monitor started");
}
