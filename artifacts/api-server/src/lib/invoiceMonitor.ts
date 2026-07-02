import cron from "node-cron";
import { db } from "@workspace/db";
import { pendingInvoicesTable, transactionsTable } from "@workspace/db";
import { and, asc, desc, eq, gt, isNull, or } from "drizzle-orm";
import { NWCClient } from "@getalby/sdk";
import { lookupInvoice, listTransactions, resolveNwcUrl, relayInCooldown, noteRelayOverload } from "./nwc";
import { logger } from "./logger";
import { autoSettleShopOrders, directSettleShopOrder } from "./shopOrderAutoSettle";

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
  createdAt: Date;
  nwcUrlEncrypted: string | null;
};

export async function settleInvoiceByPaymentHash(paymentHash: string, paidAt: Date): Promise<boolean> {
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

    // Record a receive transaction for local history display.
    // Balance is tracked by Veil - no DB balance_sats update needed.
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
        "Shop order invoice settled - settling order directly",
      );
      directSettleShopOrder(invoice.cardOrderId, invoice.accountId).catch((err) =>
        logger.warn({ err, orderId: invoice.cardOrderId }, "directSettleShopOrder error"),
      );
    } else {
      logger.info(
        { invoiceId: invoice.id, accountId: invoice.accountId, amountSats: invoice.amountSats },
        "Invoice settled - transaction recorded",
      );
      autoSettleShopOrders(invoice.accountId).catch((err) =>
        logger.warn({ err, accountId: invoice.accountId }, "shopOrderAutoSettle error"),
      );
    }
  }

  return settled;
}

// ── On-demand per-account reconciliation ─────────────────────────────────────
// Autoscale deployments idle between requests, so the long-lived relay push
// subscription is unreliable in production. This request-driven sweep settles
// an account's unpaid invoices at the moment the client fetches history or
// balance - by definition the instance is awake when the user is looking.

const lastReconcileAt = new Map<string, number>(); // accountId → epoch ms
const inflightReconciles = new Map<string, Promise<void>>(); // accountId → running sweep
const RECONCILE_DEBOUNCE_MS = 5_000;
const RECONCILE_MAX_INVOICES = 10;
const RECONCILE_TIMEOUT_MS = 3_000;
// Keep checking invoices for a while after expiry - a paid invoice can only
// have been paid before it expired, so late settlement is always safe. This
// covers payments that landed while no instance was awake to settle them.
const EXPIRY_GRACE_MS = 24 * 60 * 60 * 1000;
const SWEEP_MAX_INVOICES = 25;

// ── Batch invoice checking via list_transactions ─────────────────────────────
// One list_transactions request per wallet covers ALL of its pending invoices,
// instead of one lookup_invoice per invoice. This is the single biggest lever
// against relay rate limiting ("rate-limited: slow down" NOTICEs in prod).
// If a wallet does not support list_transactions, fall back to bounded
// per-invoice lookups for that wallet only.

const walletsWithoutListTx = new Set<string>(); // nwcUrl → list_transactions unsupported

function isUnsupportedMethodError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /not.?implemented|not.?supported|not.?found|unknown method|restricted|unauthorized/i.test(msg);
}

/**
 * Check a batch of pending invoices for settlement, grouped by wallet.
 * Makes at most one relay request per wallet (plus a bounded lookup fallback).
 */
async function checkInvoiceBatch(invoices: PendingInvoiceRow[], context: string): Promise<void> {
  const byWallet = new Map<string, PendingInvoiceRow[]>();
  for (const inv of invoices) {
    const nwcUrl = resolveNwcUrl(inv.nwcUrlEncrypted);
    if (!nwcUrl) continue; // no wallet URL stored - nothing to check against
    const group = byWallet.get(nwcUrl);
    if (group) group.push(inv);
    else byWallet.set(nwcUrl, [inv]);
  }

  for (const [nwcUrl, group] of byWallet) {
    if (relayInCooldown()) return;

    // Invoices still needing a check after the batch pass. A truncated
    // list_transactions page (busy wallet) must NOT leave paid invoices
    // unsettled, so unmatched invoices always get a targeted lookup.
    let remaining: PendingInvoiceRow[] = group;

    if (!walletsWithoutListTx.has(nwcUrl)) {
      try {
        const oldestSec = Math.floor(Math.min(...group.map((i) => i.createdAt.getTime())) / 1000) - 60;
        const txs = await listTransactions(nwcUrl, { from: oldestSec, limit: 100 });
        const settledByHash = new Map(
          txs
            .filter((tx) => tx.type === "incoming" && tx.settledAt)
            .map((tx) => [tx.paymentHash, tx.settledAt as Date]),
        );
        const unmatched: PendingInvoiceRow[] = [];
        for (const inv of group) {
          const settledAt = settledByHash.get(inv.paymentHash);
          if (settledAt) {
            await settleInvoice(inv, settledAt).catch((err) =>
              logger.warn({ err, invoiceId: inv.id }, `${context}: settle error`),
            );
          } else {
            unmatched.push(inv);
          }
        }
        // If the page was truncated, a paid tx may be beyond it - the
        // unmatched invoices below are verified individually. If the page
        // covered everything, the targeted lookups still cost at most one
        // request per genuinely-unpaid invoice.
        if (txs.length < 100) {
          // Full window returned - anything unmatched is genuinely unpaid.
          continue;
        }
        remaining = unmatched;
      } catch (err) {
        if (noteRelayOverload(err)) return;
        if (isUnsupportedMethodError(err)) {
          walletsWithoutListTx.add(nwcUrl);
          logger.info(`${context}: wallet does not support list_transactions - using per-invoice lookups`);
        } else {
          logger.warn({ err }, `${context}: list_transactions failed`);
          continue;
        }
      }
    }

    // Bounded per-invoice lookups: fallback for unsupported wallets, and
    // completeness pass for invoices unmatched on a truncated page.
    for (const inv of remaining) {
      if (relayInCooldown()) return;
      try {
        const status = await lookupInvoice(inv.paymentHash, nwcUrl);
        if (status.paid && status.paidAt) {
          await settleInvoice(inv, status.paidAt);
        }
      } catch (err) {
        if (noteRelayOverload(err)) return;
        logger.warn({ err, invoiceId: inv.id }, `${context}: failed to check invoice`);
      }
    }
  }
}

export function reconcileAccountInvoices(accountId: string): Promise<void> {
  // If a sweep for this account is already running, join it so parallel
  // balance + transactions requests both see its result.
  const inflight = inflightReconciles.get(accountId);
  if (inflight) return inflight;

  const now = Date.now();
  const last = lastReconcileAt.get(accountId) ?? 0;
  if (now - last < RECONCILE_DEBOUNCE_MS) return Promise.resolve();
  lastReconcileAt.set(accountId, now);

  // Bound map growth
  if (lastReconcileAt.size > 1_000) {
    for (const [key, ts] of lastReconcileAt) {
      if (now - ts > RECONCILE_DEBOUNCE_MS) lastReconcileAt.delete(key);
    }
  }

  const run = doReconcile(accountId).finally(() => {
    inflightReconciles.delete(accountId);
  });
  inflightReconciles.set(accountId, run);
  return run;
}

async function doReconcile(accountId: string): Promise<void> {
  if (relayInCooldown()) return;

  const unpaid = await db
    .select()
    .from(pendingInvoicesTable)
    .where(
      and(
        eq(pendingInvoicesTable.accountId, accountId),
        isNull(pendingInvoicesTable.paidAt),
        gt(pendingInvoicesTable.expiresAt, new Date(Date.now() - EXPIRY_GRACE_MS)),
      ),
    )
    .orderBy(desc(pendingInvoicesTable.createdAt))
    .limit(RECONCILE_MAX_INVOICES);

  if (unpaid.length === 0) return;
  await checkInvoiceBatch(unpaid as PendingInvoiceRow[], "On-demand reconcile");
}

/**
 * Reconcile with a hard time bound so read endpoints never hang on Veil.
 * Resolves after RECONCILE_TIMEOUT_MS even if lookups are still in flight -
 * any late settlements still complete in the background.
 */
export function reconcileAccountInvoicesBounded(accountId: string): Promise<void> {
  const work = reconcileAccountInvoices(accountId).catch((err) =>
    logger.warn({ err, accountId }, "On-demand reconcile error"),
  );
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, RECONCILE_TIMEOUT_MS);
    timer.unref?.();
    work.then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

// ── Per-invoice sub-wallet subscriptions ─────────────────────────────────────

const subWalletUnsubs = new Map<string, () => void>(); // paymentHash → cleanup fn
const MAX_INVOICE_SUBSCRIPTIONS = 50;
const SUBSCRIPTION_TTL_MS = 60 * 60 * 1000; // default invoice expiry (1h)

/**
 * Subscribe to payment_received notifications for a specific Veil invoice.
 * Call this immediately after creating a pending invoice.
 * Each subscription auto-cleans at the TTL (invoice expiry) and the total
 * number of concurrent subscriptions is capped - the on-demand reconcile and
 * fallback cron cover anything skipped.
 */
export async function subscribeSubWalletInvoice(
  paymentHash: string,
  nwcUrl: string,
  ttlMs = SUBSCRIPTION_TTL_MS,
): Promise<void> {
  if (subWalletUnsubs.has(paymentHash)) return;
  if (subWalletUnsubs.size >= MAX_INVOICE_SUBSCRIPTIONS) {
    logger.warn({ paymentHash, active: subWalletUnsubs.size }, "Invoice subscription budget reached - relying on reconcile/cron");
    return;
  }
  if (relayInCooldown()) return;

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
            logger.warn({ err, paymentHash }, "Invoice settlement error"),
          );
          cleanup();
        }
      },
      ["payment_received"],
    );

    // Auto-unsubscribe once the invoice can no longer be paid
    const expiryTimer = setTimeout(() => cleanup(), ttlMs + 60_000);
    expiryTimer.unref?.();

    const cleanup = () => {
      clearTimeout(expiryTimer);
      try { unsubNotif(); } catch { /* ignore */ }
      try { client.close(); } catch { /* ignore */ }
      subWalletUnsubs.delete(paymentHash);
    };

    subWalletUnsubs.set(paymentHash, cleanup);
    logger.info({ paymentHash, active: subWalletUnsubs.size }, "Veil invoice subscription active");
  } catch (err) {
    if (!noteRelayOverload(err)) {
      logger.warn({ err, paymentHash }, "Veil invoice subscription failed - cron will cover it");
    }
  }
}

// ── Fallback cron (every minute) ─────────────────────────────────────────────
// Catches any invoices whose push notification was missed due to relay hiccups.

// Progressing composite cursor (createdAt, id) so every unpaid invoice within
// the grace window is eventually visited regardless of backlog size. The id
// tie-break makes pagination stable when invoices share a createdAt timestamp.
// Each run picks the next SWEEP_MAX_INVOICES oldest-first after the cursor;
// when the window is exhausted the cursor wraps to the start.
let sweepCursor: { createdAt: Date; id: string } | null = null;

async function runFallbackSweep(): Promise<void> {
  if (relayInCooldown()) return;

  const graceCutoff = new Date(Date.now() - EXPIRY_GRACE_MS);
  const baseWhere = and(
    isNull(pendingInvoicesTable.paidAt),
    gt(pendingInvoicesTable.expiresAt, graceCutoff),
  );

  const afterCursor = sweepCursor
    ? or(
        gt(pendingInvoicesTable.createdAt, sweepCursor.createdAt),
        and(
          eq(pendingInvoicesTable.createdAt, sweepCursor.createdAt),
          gt(pendingInvoicesTable.id, sweepCursor.id),
        ),
      )
    : undefined;

  let unpaid = await db
    .select()
    .from(pendingInvoicesTable)
    .where(afterCursor ? and(baseWhere, afterCursor) : baseWhere)
    .orderBy(asc(pendingInvoicesTable.createdAt), asc(pendingInvoicesTable.id))
    .limit(SWEEP_MAX_INVOICES);

  // Window exhausted - wrap to the start
  if (unpaid.length < SWEEP_MAX_INVOICES) {
    sweepCursor = null;
    if (unpaid.length === 0) {
      unpaid = await db
        .select()
        .from(pendingInvoicesTable)
        .where(baseWhere)
        .orderBy(asc(pendingInvoicesTable.createdAt), asc(pendingInvoicesTable.id))
        .limit(SWEEP_MAX_INVOICES);
    }
  }

  if (unpaid.length === 0) return;
  if (unpaid.length === SWEEP_MAX_INVOICES) {
    const last = unpaid[unpaid.length - 1];
    sweepCursor = { createdAt: last.createdAt, id: last.id };
  }
  await checkInvoiceBatch(unpaid as PendingInvoiceRow[], "Fallback sweep");
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function startInvoiceMonitor(): void {
  // Per-invoice Veil subscriptions handle instant settlement.
  // Cron is the safety net for missed push notifications.
  cron.schedule("*/2 * * * *", async () => {
    try {
      await runFallbackSweep();
    } catch (err) {
      logger.error({ err }, "Invoice fallback sweep error");
    }
  });

  // Startup sweep - catch any invoices paid while the server was down
  runFallbackSweep().catch((err) => logger.warn({ err }, "Startup invoice sweep error"));

  logger.info("Invoice monitor started");
}
