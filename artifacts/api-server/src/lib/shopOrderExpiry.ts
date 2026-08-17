import { db } from "@workspace/db";
import { cardOrdersTable, pendingInvoicesTable } from "@workspace/db";
import { eq, and, lt, isNotNull } from "drizzle-orm";
import { logger } from "./logger";
import { autoSettleShopOrders, directSettleShopOrder } from "./shopOrderAutoSettle";

const EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export async function cancelExpiredShopOrders(): Promise<void> {
  const cutoff = new Date(Date.now() - EXPIRY_MS);

  const expired = await db
    .select({
      id: cardOrdersTable.id,
      accountId: cardOrdersTable.accountId,
      pendingInvoiceId: cardOrdersTable.pendingInvoiceId,
    })
    .from(cardOrdersTable)
    .where(
      and(
        eq(cardOrdersTable.status, "awaiting_payment"),
        lt(cardOrdersTable.createdAt, cutoff),
      ),
    );

  for (const order of expired) {
    try {
      if (order.pendingInvoiceId) {
        // Check whether the invoice was already paid before cancelling
        const [invoice] = await db
          .select({ paidAt: pendingInvoicesTable.paidAt, cardOrderId: pendingInvoicesTable.cardOrderId })
          .from(pendingInvoicesTable)
          .where(
            and(
              eq(pendingInvoicesTable.id, order.pendingInvoiceId),
              isNotNull(pendingInvoicesTable.paidAt),
            ),
          );

        if (invoice) {
          // Invoice was paid but order wasn't settled - rescue it
          logger.warn({ orderId: order.id }, "Expiry: invoice paid but order still awaiting - auto-settling");
          if (invoice.cardOrderId) {
            await directSettleShopOrder(invoice.cardOrderId, order.accountId);
          } else {
            await autoSettleShopOrders(order.accountId);
          }
          continue;
        }
      }

      // Invoice is unpaid (or no invoice) - safe to cancel
      await db
        .update(cardOrdersTable)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(cardOrdersTable.id, order.id),
            eq(cardOrdersTable.status, "awaiting_payment"),
          ),
        );

      logger.info({ orderId: order.id }, "Auto-cancelled expired awaiting_payment shop order");
    } catch (err) {
      logger.error({ err, orderId: order.id }, "Error processing expired shop order");
    }
  }
}

export function startShopOrderExpiryJob(): void {
  setInterval(() => {
    cancelExpiredShopOrders().catch((err) =>
      logger.error({ err }, "Shop order expiry cron failed"),
    );
  }, 60_000);

  cancelExpiredShopOrders().catch(() => {});
}
