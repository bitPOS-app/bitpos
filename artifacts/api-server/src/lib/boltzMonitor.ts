import cron from "node-cron";
import { db } from "@workspace/db";
import { swapsTable, transactionsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { getSwapStatus } from "./boltz";
import { logger } from "./logger";
import { recordPaymentEvent } from "./paymentLog";

/**
 * Poll Boltz reverse swaps.
 * Users pay from NWC — NOT accounts.balance_sats.
 * Never credit legacy DB balance on fail (that minted phantom sats).
 */
export function startBoltzMonitor(): void {
  cron.schedule("*/30 * * * * *", async () => {
    try {
      const pending = await db.select().from(swapsTable).where(eq(swapsTable.status, "pending"));

      for (const swap of pending) {
        try {
          const status = await getSwapStatus(swap.swapId);

          if (status.status === "transaction.claimed" || status.status === "invoice.settled") {
            const [updated] = await db
              .update(swapsTable)
              .set({
                status: "claimed",
                txid: status.transaction?.id ?? swap.txid,
                claimedAt: new Date(),
              })
              .where(and(eq(swapsTable.id, swap.id), eq(swapsTable.status, "pending")))
              .returning({ id: swapsTable.id });

            if (updated) {
              await db
                .insert(transactionsTable)
                .values({
                  accountId: swap.accountId,
                  direction: "out",
                  amountSats: swap.totalDeductedSats || swap.onchainAmountSats,
                  feeSats: swap.feeSats ?? 0,
                  type: "swap",
                  status: "completed",
                  paymentHash: swap.paymentHash,
                  memo: `Boltz LN->on-chain claimed ${swap.onchainAmountSats} sats -> ${swap.destinationAddress}`,
                })
                .catch(() => {});

              recordPaymentEvent({
                paymentId: swap.swapId,
                accountId: swap.accountId,
                kind: "system",
                event: "boltz.claimed",
                status: "success",
                message: `On-chain claim confirmed ${status.transaction?.id ?? ""}`,
                paymentHash: swap.paymentHash,
                amountSats: swap.onchainAmountSats,
                detail: { boltzStatus: status.status, txid: status.transaction?.id },
              });

              logger.info(
                { swapId: swap.swapId, txid: status.transaction?.id },
                "Boltz swap claimed - on-chain TX confirmed",
              );
            }
            continue;
          }

          const failed =
            status.status === "swap.expired" ||
            status.status === "invoice.expired" ||
            status.status === "transaction.failed" ||
            status.status === "transaction.refunded" ||
            status.status === "invoice.failedToPay";

          if (failed) {
            const reason = status.status.includes("expired") ? "expired" : "failed";
            const [updated] = await db
              .update(swapsTable)
              .set({ status: reason })
              .where(and(eq(swapsTable.id, swap.id), eq(swapsTable.status, "pending")))
              .returning({ id: swapsTable.id });

            if (updated) {
              await db
                .insert(transactionsTable)
                .values({
                  accountId: swap.accountId,
                  direction: "in",
                  amountSats: 0,
                  feeSats: 0,
                  type: "swap_refund",
                  status: "failed",
                  paymentHash: swap.paymentHash,
                  failureReason: `Boltz reverse swap ${reason}: ${status.status}`,
                  memo: `Swap ${swap.swapId} ${reason}. Check Lightning wallet / Boltz for any LN refund - bitPOS does not hold escrow balance.`,
                })
                .catch(() => {});

              recordPaymentEvent({
                paymentId: swap.swapId,
                accountId: swap.accountId,
                kind: "system",
                event: `boltz.${reason}`,
                status: "fail",
                message: `Boltz swap ${reason}: ${status.status}`,
                paymentHash: swap.paymentHash,
                amountSats: swap.totalDeductedSats,
                detail: { boltzStatus: status.status },
              });

              logger.warn(
                { swapId: swap.swapId, boltzStatus: status.status },
                "Boltz swap terminal without on-chain claim - no DB fake-refund",
              );
            }
            continue;
          }

          if (status.transaction?.id && !swap.txid) {
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
