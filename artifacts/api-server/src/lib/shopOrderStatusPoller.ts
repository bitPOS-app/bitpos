import { db, cardOrdersTable } from "@workspace/db";
import { and, inArray, isNotNull } from "drizzle-orm";
import { logger } from "./logger";
import { getOrder, isConfigured } from "./printags";
import { applyPrintagsStatus } from "./printagsStatus";

const POLL_MS = 2 * 60 * 1000; // every 2 minutes

// Coarse statuses still "in flight" - worth polling Printags for. Terminal
// states (delivered/cancelled/returned/refunded/failed) are left alone.
const ACTIVE_STATUSES = ["pending", "confirmed", "printing", "shipped", "on_hold"];

export async function pollActiveShopOrders(): Promise<void> {
  if (!isConfigured()) return;

  const orders = await db
    .select({ id: cardOrdersTable.id, printOrderId: cardOrdersTable.printOrderId })
    .from(cardOrdersTable)
    .where(and(isNotNull(cardOrdersTable.printOrderId), inArray(cardOrdersTable.status, ACTIVE_STATUSES)));

  if (orders.length === 0) return;

  logger.info({ count: orders.length }, "Shop order status poll: checking active orders against Printags");

  for (const order of orders) {
    if (!order.printOrderId) continue;
    try {
      const live = await getOrder(order.printOrderId);
      await applyPrintagsStatus(order.printOrderId, live.status, live.trackingNumber);
    } catch (err) {
      logger.warn(
        { err, orderId: order.id, printOrderId: order.printOrderId },
        "Shop order status poll: failed to refresh one order",
      );
    }
  }
}

export function startShopOrderStatusPoller(): void {
  setInterval(() => {
    pollActiveShopOrders().catch((err) =>
      logger.error({ err }, "Shop order status poller cron failed"),
    );
  }, POLL_MS);

  // Run once shortly after boot so restarts catch up quickly.
  pollActiveShopOrders().catch(() => {});
}
