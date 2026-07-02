import { db } from "@workspace/db";
import { accountsTable, cardDesignsTable, cardOrdersTable, transactionsTable } from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";
import type { CardOrder } from "@workspace/db";
import { logger } from "./logger";
import { createOrder, isConfigured } from "./printags";
import { decrypt } from "./encrypt";
import { forwardCardRevenue } from "./shopRevenue";
import { creditStickerRoyalties } from "../routes/stickers";

/** Decrypt a single shipping field, returning the original value if decryption
 *  fails (for any rows inserted before encryption was enabled). */
function tryDecrypt(value: string | null | undefined): string | null {
  if (value == null) return null;
  try { return decrypt(value); } catch { return value; }
}

function shortId(uuid: string): string {
  const hex = uuid.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

/**
 * Credits royalty to designer and returns the sats credited (0 if skipped).
 * Never throws — errors are logged and 0 is returned so callers can safely
 * subtract the royalty from the amount forwarded as platform revenue.
 */
export async function creditDesignRoyalty(order: CardOrder): Promise<number> {
  if (!order.designId) return 0;
  try {
    const [design] = await db
      .select({
        isCommunity: cardDesignsTable.isCommunity,
        royaltySatsPerUnit: cardDesignsTable.royaltySatsPerUnit,
        submittedByAccountId: cardDesignsTable.submittedByAccountId,
        name: cardDesignsTable.name,
        usedStickerIds: cardDesignsTable.usedStickerIds,
      })
      .from(cardDesignsTable)
      .where(eq(cardDesignsTable.id, order.designId));

    // Credit sticker royalties for any community stickers embedded in the design.
    // Fire-and-forget relative to design royalty — errors are swallowed inside.
    if (design?.usedStickerIds) {
      try {
        const ids = JSON.parse(design.usedStickerIds) as string[];
        if (Array.isArray(ids) && ids.length > 0) {
          creditStickerRoyalties(design.submittedByAccountId ?? null, ids).catch(() => {});
        }
      } catch { /* malformed JSON - skip */ }
    }

    if (!design?.isCommunity || !design.royaltySatsPerUnit || !design.submittedByAccountId) return 0;
    if (design.submittedByAccountId === order.accountId) return 0;

    const royaltySats = design.royaltySatsPerUnit * order.quantity;

    const [updated] = await db.transaction(async (tx) => {
      const rows = await tx
        .update(accountsTable)
        .set({ balanceSats: sql`${accountsTable.balanceSats} + ${royaltySats}` })
        .where(eq(accountsTable.id, design.submittedByAccountId!))
        .returning({ id: accountsTable.id });

      if (!rows.length) return [];

      await tx.insert(transactionsTable).values({
        accountId: design.submittedByAccountId!,
        direction: "in",
        amountSats: royaltySats,
        feeSats: 0,
        type: "internal_receive",
        memo: `Design royalty: ${design.name}`,
        status: "completed",
      });

      return rows;
    });

    if (!updated) {
      logger.warn({ orderId: order.id }, "Design royalty credit skipped - designer account not found");
      return 0;
    }

    logger.info(
      { orderId: order.id, designId: order.designId, royaltySats, designerAccountId: design.submittedByAccountId },
      "Design royalty credited",
    );
    return royaltySats;
  } catch (err) {
    logger.warn({ err, orderId: order.id }, "Design royalty credit failed - order unaffected");
    return 0;
  }
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
// Orders currently being submitted to Printags in this process. Guards against
// the frontend status poll (every ~5s) firing overlapping resubmissions for the
// same order while a createOrder call is still in flight.
const inFlightSubmissions = new Set<string>();

export async function submitOrderToPrintags(order: CardOrder): Promise<void> {
  if (!isConfigured()) {
    logger.warn({ orderId: order.id }, "Printags not configured — skipping submission");
    return;
  }
  // Idempotency: never submit an order that already has a Printags order id, and
  // never submit the same order concurrently.
  if (order.printOrderId) return;
  if (inFlightSubmissions.has(order.id)) return;
  inFlightSubmissions.add(order.id);
  try {
    // Re-read the latest row after acquiring the lock. The caller may be working
    // from a stale snapshot (e.g. an overlapping status poll that read the order
    // before a prior submission completed); without this check two near-
    // simultaneous polls could each create a duplicate (and billable) Printags
    // order. The lock serialises them; this guard catches the stale-snapshot case.
    const [fresh] = await db
      .select({ printOrderId: cardOrdersTable.printOrderId })
      .from(cardOrdersTable)
      .where(eq(cardOrdersTable.id, order.id));
    if (fresh?.printOrderId) return;

    const printingVisuals: string[] = [];
    if (order.printFileId) {
      printingVisuals.push(order.printFileId);
      if (order.printFileIdBack) printingVisuals.push(order.printFileIdBack);
    } else if (order.designId) {
      const [design] = await db
        .select({ printafsFileId: cardDesignsTable.printafsFileId, printafsFileIdBack: cardDesignsTable.printafsFileIdBack })
        .from(cardDesignsTable)
        .where(eq(cardDesignsTable.id, order.designId));
      if (design?.printafsFileId) {
        printingVisuals.push(design.printafsFileId);
        if (design.printafsFileIdBack) printingVisuals.push(design.printafsFileIdBack);
      }
    }

    // Printags model ID for all bitPOS card orders: ntag424_pvccard_white.
    //
    // The Printags ProductGroup schema enumerates all valid model IDs:
    //   pvccard_white | mifare1k_pvccard_white | ntag213_pvccard_white
    //   | ntag424_pvccard_white | ntag424_woodcard
    //
    // There is NO distinct "printed card" model — the same ntag424_pvccard_white
    // is used for both plain white and custom-printed cards. Print production is
    // triggered by including printingVisuals (file UUIDs); the modelId never changes.
    // (Source: https://docs.printags.com/productgroup-13997215d0)
    const MODEL_ID = "ntag424_pvccard_white";

    const result = await createOrder({
      reference: shortId(order.id),
      quantity: order.quantity,
      modelId: MODEL_ID,
      ...(order.carrierServiceId ? { carrierServiceId: order.carrierServiceId } : {}),
      ...(printingVisuals.length ? { printingVisuals } : {}),
      shippingName:     tryDecrypt(order.shippingName)     ?? order.shippingName,
      shippingEmail:    tryDecrypt(order.shippingEmail)    ?? "",
      shippingPhone:    tryDecrypt(order.shippingPhone)    ?? undefined,
      shippingAddress1: tryDecrypt(order.shippingAddress1) ?? order.shippingAddress1,
      shippingAddress2: tryDecrypt(order.shippingAddress2) ?? undefined,
      shippingCity:     tryDecrypt(order.shippingCity)     ?? order.shippingCity,
      shippingPostalCode: tryDecrypt(order.shippingPostalCode) ?? order.shippingPostalCode,
      shippingCountry:  tryDecrypt(order.shippingCountry)  ?? order.shippingCountry,
      internalOrderId: order.id,
    });

    await db
      .update(cardOrdersTable)
      .set({ printOrderId: result.orderId })
      .where(eq(cardOrdersTable.id, order.id));

    logger.info({ orderId: order.id, printOrderId: result.orderId }, "Printags order submitted successfully");
  } catch (err) {
    logger.error({ err, orderId: order.id }, "Printags submission failed — order stays confirmed, will retry on next status poll");
  } finally {
    inFlightSubmissions.delete(order.id);
  }
}

/**
 * Directly settle a shop order that was paid via its own Lightning invoice.
 * Does NOT touch the account balance - the payment bypasses the balance entirely.
 *
 * Idempotency: the UPDATE is guarded by `status = 'awaiting_payment'` in the WHERE
 * clause. If the order was already confirmed by a concurrent path (e.g. the frontend
 * polling /pay while the invoice monitor fires), the UPDATE returns zero rows and we
 * exit immediately without double-crediting royalties or revenue.
 */
export async function directSettleShopOrder(orderId: string, accountId: string): Promise<void> {
  try {
    const [settled] = await db
      .update(cardOrdersTable)
      .set({ status: "confirmed" })
      .where(
        and(
          eq(cardOrdersTable.id, orderId),
          eq(cardOrdersTable.accountId, accountId),
          eq(cardOrdersTable.status, "awaiting_payment"),
        ),
      )
      .returning();

    if (!settled) return; // already settled by another path - side effects must not repeat

    logger.info({ orderId, accountId }, "Shop order directly settled via Lightning invoice (no balance change)");

    submitOrderToPrintags(settled).catch(() => { /* errors already logged inside */ });
    const royaltySats = await creditDesignRoyalty(settled);
    forwardCardRevenue(settled.amountSats - royaltySats, settled.id).catch(() => { /* errors already logged inside */ });
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
      const royaltySats = await creditDesignRoyalty(result);
      forwardCardRevenue(result.amountSats - royaltySats, result.id).catch(() => { /* errors already logged inside */ });
    } catch (err) {
      logger.error({ err, orderId: order.id }, "Error in shop order auto-settle");
    }
  }
}
