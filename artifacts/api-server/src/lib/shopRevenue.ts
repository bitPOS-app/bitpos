/**
 * Card shop revenue forwarding.
 *
 * After a card order is confirmed (all payment paths), forward the order amount
 * from the main NWC wallet to the Lightning address configured in
 * BITPOS_CARD_REVENUE_ADDRESS.  This is fire-and-forget — a failure is logged
 * but never propagates to the caller, ensuring order confirmation is never
 * blocked by a revenue-routing problem.
 *
 * Flow (LNURL-pay over Lightning Address):
 *   1. Resolve user@domain → https://domain/.well-known/lnurlp/user
 *   2. Fetch LNURL-pay metadata (minSendable / maxSendable / callback)
 *   3. Fetch bolt11 invoice from callback?amount=<msats>
 *   4. Pay via the main NWC node (no account balance deduction — the user's
 *      balance was already deducted when the order was confirmed)
 */
import { payInvoice } from "./nwc";
import { resolveLnAddress } from "./lnurlPay";
import { logger } from "./logger";

const REVENUE_LN_ADDRESS = process.env.BITPOS_CARD_REVENUE_ADDRESS;

/**
 * Forward card shop revenue to BITPOS_CARD_REVENUE_ADDRESS.
 * Safe to call fire-and-forget — errors are logged, never thrown.
 * No-ops silently when BITPOS_CARD_REVENUE_ADDRESS is not configured.
 */
export async function forwardCardRevenue(amountSats: number, orderId: string): Promise<void> {
  if (!REVENUE_LN_ADDRESS) {
    logger.debug({ orderId }, "BITPOS_CARD_REVENUE_ADDRESS not set — revenue forwarding skipped");
    return;
  }

  try {
    const amountMsats = amountSats * 1000;
    const bolt11 = await resolveLnAddress(REVENUE_LN_ADDRESS, amountMsats);
    const { paymentHash } = await payInvoice(bolt11);
    logger.info(
      { orderId, amountSats, revenueAddress: REVENUE_LN_ADDRESS, paymentHash },
      "Card shop revenue forwarded to revenue address",
    );
  } catch (err) {
    // Log but never rethrow — order confirmation must not be blocked by a
    // revenue-routing failure.  Monitor these logs for manual reconciliation.
    logger.error(
      { err, orderId, amountSats, revenueAddress: REVENUE_LN_ADDRESS },
      "REVENUE FORWARDING FAILED — order confirmed but sats not yet sent to revenue address. Manual reconciliation required.",
    );
  }
}
