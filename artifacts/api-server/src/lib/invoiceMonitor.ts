import cron from "node-cron";
import { db } from "@workspace/db";
import { accountsTable, pendingInvoicesTable, transactionsTable } from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { NWCClient } from "@getalby/sdk";
import type { Nip47Transaction } from "@getalby/sdk";
import { lookupInvoice } from "./nwc";
import { decrypt } from "./encrypt";
import { logger } from "./logger";
import { autoSettleShopOrders, directSettleShopOrder } from "./shopOrderAutoSettle";

const NWC_URL = process.env.ALBY_NWC_URL;

function resolveNwcUrl(encrypted: string | null | undefined): string | undefined {
  if (!encrypted) return undefined;
  try { return decrypt(encrypted); } catch { return undefined; }
}

// ── Shared settlement logic ───────────────────────────────────────────────────

type PendingInvoiceRow = {
  id: string;
  accountId: string;
  paymentHash: string;
  bolt11: string;
  amountSats: number;
  memo: string | null;
  cardOrderId: string | null;
  paidAt: Date | null;
  expiresAt: Date;
};

async function settleInvoiceByPaymentHash(paymentHash: string, paidAt: Date): Promise<boolean> {
  const [invoice] = await db
    .select()
    .from(pendingInvoicesTable)
    .where(
      and(
        eq(pendingInvoicesTable.paymentHash, paymentHash),
        isNull(pendingInvoicesTable.paidAt),
      ),
    );

  if (!invoice) return false;
  return settleInvoice(invoice as PendingInvoiceRow, paidAt);
}

async function settleInvoice(invoice: PendingInvoiceRow, paidAt: Date): Promise<boolean> {
  let settled = false;

  await db.transaction(async (tx) => {
    const [marked] = await tx
      .update(pendingInvoicesTable)
      .set({ paidAt })
      .where(
        and(
          eq(pendingInvoicesTable.id, invoice.id),
          isNull(pendingInvoicesTable.paidAt),
        ),
      )
      .returning({ id: pendingInvoicesTable.id });

    if (!marked) return;
    settled = true;

    if (invoice.cardOrderId) {
      // Shop-order invoice: bypass balance entirely - settle the order directly
      return;
    }

    // Regular invoice: credit the user's balance and record a receive transaction
    await tx
      .update(accountsTable)
      .set({ balanceSats: sql`${accountsTable.balanceSats} + ${invoice.amountSats}` })
      .where(eq(accountsTable.id, invoice.accountId));

    await tx.insert(transactionsTable).values({
      accountId: invoice.accountId,
      direction: "in",
      amountSats: invoice.amountSats,
      feeSats: 0,
      type: "receive",
      paymentHash: invoice.paymentHash,
      bolt11: invoice.bolt11,
      status: "completed",
      memo: invoice.memo ?? undefined,
    });
  });

  if (settled) {
    if (invoice.cardOrderId) {
      logger.info(
        { invoiceId: invoice.id, orderId: invoice.cardOrderId, amountSats: invoice.amountSats },
        "Shop order invoice settled - settling order directly (no balance change)",
      );
      directSettleShopOrder(invoice.cardOrderId, invoice.accountId).catch((err) =>
        logger.warn({ err, orderId: invoice.cardOrderId }, "directSettleShopOrder error"),
      );
    } else {
      logger.info(
        { invoiceId: invoice.id, accountId: invoice.accountId, amountSats: invoice.amountSats },
        "Invoice settled and account credited",
      );
      autoSettleShopOrders(invoice.accountId).catch((err) =>
        logger.warn({ err, accountId: invoice.accountId }, "shopOrderAutoSettle error"),
      );
    }
  }

  return settled;
}

// ── Per-invoice sub-wallet subscriptions ─────────────────────────────────────

const subWalletUnsubs = new Map<string, () => void>(); // paymentHash → cleanup fn

/**
 * Subscribe to payment_received notifications for a specific sub-wallet invoice.
 * Call this immediately after creating a pending invoice with a sub-wallet NWC URL.
 */
export async function subscribeSubWalletInvoice(paymentHash: string, nwcUrl: string): Promise<void> {
  try {
    const client = new NWCClient({ nostrWalletConnectUrl: nwcUrl });
    const unsubNotif = await client.subscribeNotifications(
      async (notif) => {
        if (
          notif.notification_type === "payment_received" &&
          notif.notification.payment_hash === paymentHash
        ) {
          const tx = notif.notification;
          const paidAt = tx.settled_at ? new Date(tx.settled_at * 1000) : new Date();
          await settleInvoiceByPaymentHash(paymentHash, paidAt).catch((err) =>
            logger.warn({ err, paymentHash }, "Sub-wallet invoice settlement error"),
          );
          cleanup();
        }
      },
      ["payment_received"],
    );

    const cleanup = () => {
      unsubNotif();
      client.close();
      subWalletUnsubs.delete(paymentHash);
    };

    subWalletUnsubs.set(paymentHash, cleanup);
    logger.info({ paymentHash }, "Sub-wallet NWC subscription active");
  } catch (err) {
    logger.warn({ err, paymentHash }, "Sub-wallet NWC subscription failed - cron will cover it");
  }
}

// ── Main wallet persistent subscription ──────────────────────────────────────

async function startMainWalletSubscription(): Promise<void> {
  if (!NWC_URL) return;

  try {
    const client = new NWCClient({ nostrWalletConnectUrl: NWC_URL });
    const unsub = await client.subscribeNotifications(
      async (notif) => {
        if (notif.notification_type !== "payment_received") return;
        const tx: Nip47Transaction = notif.notification;
        const paidAt = tx.settled_at ? new Date(tx.settled_at * 1000) : new Date();
        await settleInvoiceByPaymentHash(tx.payment_hash, paidAt).catch((err) =>
          logger.warn({ err, paymentHash: tx.payment_hash }, "Main wallet invoice settlement error"),
        );
      },
      ["payment_received"],
    );

    logger.info("Main wallet NWC push subscription active");

    // Reconnect on unexpected close
    // The SDK doesn't expose an onClose event, so we rely on the cron fallback
    // and re-calling this function from the fallback if needed.
    void unsub; // kept open for the lifetime of the process
  } catch (err) {
    logger.warn({ err }, "Main wallet NWC push subscription failed - retrying in 30s");
    setTimeout(() => { startMainWalletSubscription().catch(() => {}); }, 30_000);
  }
}

// ── Fallback cron (every 5 min) ───────────────────────────────────────────────
// Catches any invoices whose push notification was missed due to relay hiccups.

async function runFallbackSweep(): Promise<void> {
  const now = new Date();
  const unpaid = await db
    .select()
    .from(pendingInvoicesTable)
    .where(isNull(pendingInvoicesTable.paidAt));

  for (const invoice of unpaid) {
    if (invoice.expiresAt < now) continue;
    try {
      const nwcUrl = resolveNwcUrl(invoice.nwcUrlEncrypted);
      const status = await lookupInvoice(invoice.paymentHash, nwcUrl);
      if (!status.paid || !status.paidAt) continue;
      await settleInvoice(invoice as PendingInvoiceRow, status.paidAt);
    } catch (err) {
      logger.warn({ err, invoiceId: invoice.id }, "Fallback sweep: failed to check invoice");
    }
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function startInvoiceMonitor(): void {
  // 1. Instant push: main wallet subscription
  startMainWalletSubscription().catch(() => {});

  // 2. Safety net: 1-min fallback sweep for missed notifications
  cron.schedule("* * * * *", async () => {
    try {
      await runFallbackSweep();
    } catch (err) {
      logger.error({ err }, "Invoice fallback sweep error");
    }
  });

  // 3. Startup sweep - catch any invoices paid while the server was down
  runFallbackSweep().catch((err) => logger.warn({ err }, "Startup invoice sweep error"));

  logger.info("Invoice monitor started");
}
