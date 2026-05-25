/**
 * Platform revenue forwarding.
 *
 * After every successful outbound Lightning payment the 3% platform fee is
 * credited to the bank account in the DB ledger.  This module also sends those
 * same sats out of the main NWC wallet to BITPOS_PLATFORM_REVENUE_ADDRESS so
 * the revenue is available on-chain / in an external wallet immediately.
 *
 * Fire-and-forget: errors are logged but never propagate to the caller —
 * outbound payment confirmation is never blocked by a revenue-routing issue.
 * No-op when BITPOS_PLATFORM_REVENUE_ADDRESS is not configured.
 */
import { payInvoice } from "./nwc";
import { resolveLnAddress } from "./lnurlPay";
import { logger } from "./logger";

const PLATFORM_REVENUE_ADDRESS = process.env.BITPOS_PLATFORM_REVENUE_ADDRESS;

/**
 * Forward `feeSats` to BITPOS_PLATFORM_REVENUE_ADDRESS.
 * Safe to call fire-and-forget — errors are logged, never thrown.
 *
 * @param feeSats   The 3% fee amount that was credited to the bank account.
 * @param sourceTxId The internal pending-transaction ID for log correlation.
 */
export async function forwardPlatformRevenue(feeSats: number, sourceTxId: string): Promise<void> {
  if (!PLATFORM_REVENUE_ADDRESS) {
    logger.debug(
      { sourceTxId },
      "BITPOS_PLATFORM_REVENUE_ADDRESS not set — platform revenue forwarding skipped",
    );
    return;
  }

  try {
    const amountMsats = feeSats * 1000;
    const bolt11 = await resolveLnAddress(PLATFORM_REVENUE_ADDRESS, amountMsats);
    const { paymentHash } = await payInvoice(bolt11);
    logger.info(
      { sourceTxId, feeSats, revenueAddress: PLATFORM_REVENUE_ADDRESS, paymentHash },
      "Platform fee forwarded to revenue address",
    );
  } catch (err) {
    logger.error(
      { err, sourceTxId, feeSats, revenueAddress: PLATFORM_REVENUE_ADDRESS },
      "PLATFORM REVENUE FORWARDING FAILED — fee was credited to bank account but sats not sent to revenue address. Manual reconciliation required.",
    );
  }
}
