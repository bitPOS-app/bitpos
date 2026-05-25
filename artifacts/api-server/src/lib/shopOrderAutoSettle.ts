import { db } from "@workspace/db";
import { accountsTable, cardDesignsTable, cardOrdersTable, transactionsTable } from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";
import { logger } from "./logger";
import { createOrder, isConfigured } from "./printags";
import type { CardOrder } from "@workspace/db";

function shortId(uuid: string): string {
  const hex = uuid.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

/**
 * Submit a confirmed order to Printags for physical fulfilment.
 * Fire-and-forget safe — errors are logged but never rethrown, so a Printags
 * failure never rolls back a payment that has already settled.
 *
 * Resolves printingVisuals automatically:
 *   1. Custom upload file (order.printFileId) — highest priority
 *   2. Design artwork file (cardDesignsTable.printafsFileId) — if design has one uploaded
 *   3. Omit — plain white card, no artwork
 */
export async function submitOrderToPrintags(order: CardOrder): Promise<void> {
  if (!isConfigured()) {
    logger.warn({ orderId: order.id }, "Printags not configured — skipping submission");
    return;
  }
  try {
    const printingVisuals: string[] = [];
    if (order.printFileId) {
      printingVisuals.push(order.printFileId);
      if (order.printFileIdBack) printingVisuals.push(order.printFileIdBack);
    } else if (order.designId) {
      const [design] = await db
        .select({ printafsFileId: cardDesignsTable.printafsFileId })
        .from(cardDesignsTable)
        .where(eq(cardDesignsTable.id, order.designId));
      if (design?.printafsFileId) printingVisuals.push(design.printafsFileId);
    }

    const result = await createOrder({
      reference: shortId(order.id),
      quantity: order.quantity,
      ...(printingVisuals.length ? { printingVisuals } : {}),
      shippingName: order.shippingName,
      shippingEmail: order.shippingEmail ?? "",
      shippingPhone: order.shippingPhone ?? undefined,
      shippingAddress1: order.shippingAddress1,
      shippingAddress2: order.shippingAddress2 ?? undefined,
      shippingCity: order.shippingCity,
      shippingPostalCode: order.shippingPostalCode,
      shippingCountry: order.shippingCountry,
      internalOrderId: order.id,
    });

    await db
      .update(cardOrdersTable)
      .set({ printOrderId: result.orderId })
      .where(eq(cardOrdersTable.id, order.id));

    logger.info({ orderId: order.id, printOrderId: result.orderId }, "Printags order submitted successfully");
  } catch (err) {
    logger.error({ err, orderId: order.id }, "Printags submission failed — order stays confirmed, status poll will retry");
  }
}

/**
 * Directly settle a shop order that was paid via its own Lightning invoice.
 * Does NOT touch the account balance - the payment bypasses the balance entirely.
 */
export async function directSettleShopOrder(orderId: string, accountId: string): Promise<void> {
  try {
    // Fetch the full order first — needed for Printags submission after settling
    const [order] = await db
      .select()
      .from(cardOrdersTable)
      .where(
        and(
          eq(cardOrdersTable.id, orderId),
          eq(cardOrdersTable.accountId, accountId),
          eq(cardOrdersTable.status, "awaiting_payment"),
        ),
      );

    if (!order) return; // already settled or not found

    await db
      .update(cardOrdersTable)
      .set({ status: "confirmed" })
      .where(eq(cardOrdersTable.id, orderId));

    logger.info({ orderId, accountId }, "Shop order directly settled via Lightning invoice (no balance change)");

    submitOrderToPrintags(order).catch(() => { /* errors already logged inside */ });
  } catch (err) {
    logger.error({ err, orderId, accountId }, "Error in directSettleShopOrder");
  }
}

/**
 * After a Lightning invoice settles and the account is credited, check whether
 * any card orders are still in `awaiting_payment` for this account and, if the
 * balance now covers them, deduct the balance and submit to Printags automatically.
 *
 * This prevents orders from being stuck if the user closes the browser before
 * the frontend polling loop can trigger /shop/orders/:id/pay.
 */
export async function autoSettleShopOrders(accountId: string): Promise<void> {
  const orders = await db
    .select()
    .from(cardOrdersTable)
    .where(
      and(
        eq(cardOrdersTable.accountId, accountId),
        eq(cardOrdersTable.status, "awaiting_payment"),
      ),
    );

  for (const order of orders) {
    try {
      const result = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(accountsTable)
          .set({ balanceSats: sql`${accountsTable.balanceSats} - ${order.amountSats}` })
          .where(
            and(
              eq(accountsTable.id, accountId),
              gte(accountsTable.balanceSats, order.amountSats),
            ),
          )
          .returning({ balanceSats: accountsTable.balanceSats });

        if (!updated) return null;

        await tx.insert(transactionsTable).values({
          accountId,
          direction: "out",
          amountSats: order.amountSats,
          feeSats: 0,
          type: "internal_send",
          memo: "Card shop order",
          status: "completed",
        });

        const [updatedOrder] = await tx
          .update(cardOrdersTable)
          .set({ status: "pending" })
          .where(eq(cardOrdersTable.id, order.id))
          .returning();

        return updatedOrder;
      });

      if (!result) {
        logger.info({ orderId: order.id, accountId }, "Balance still insufficient for shop order auto-settle");
        continue;
      }

      await db
        .update(cardOrdersTable)
        .set({ status: "confirmed" })
        .where(eq(cardOrdersTable.id, result.id));

      logger.info(
        { internalOrderId: result.id, accountId },
        "Shop order auto-settled after Lightning invoice payment",
      );

      submitOrderToPrintags(result).catch(() => { /* errors already logged inside */ });
    } catch (err) {
      logger.error({ err, orderId: order.id }, "Error in shop order auto-settle");
    }
  }
}
