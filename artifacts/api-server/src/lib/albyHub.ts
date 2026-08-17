/**
 * Alby Hub sub-wallet provisioning.
 *
 * Architecture notes:
 * ─────────────────────────────────────────────────────────────────────────────
 * Merchants connect their own NIP-47 wallet. bitPOS does not custody those
 * funds. ALBY_NWC_URL is the platform float used for inbound hold-wrap
 * (1% incoming fee). Outgoing platform fee is 0.
 *
 * Optional Alby Hub app connections can bucket receive invoices for
 * accounting. They are provisioned via the Alby Hub admin REST API
 * (ALBY_HUB_URL + ALBY_HUB_ACCESS_TOKEN) when those env vars are set.
 *
 * Those NWC URLs are ONLY used for:
 *   - makeInvoice()   - generate a receive invoice in the bucket
 *   - lookupInvoice() - poll payment status in the bucket
 *
 * Merchant outbound payments go through the merchant's connected NWC.
 * Platform outbound (wrap float) goes through ALBY_NWC_URL.
 *
 * Required environment variables (optional - gracefully falls back to main node):
 *   ALBY_HUB_URL            – base URL of your Alby Hub instance
 *   ALBY_HUB_ACCESS_TOKEN   – admin token from Alby Hub → Settings → Access Tokens
 *
 * Always required:
 *   ALBY_NWC_URL            – NWC URL for the main Lightning node
 *   SESSION_SECRET          – used to derive the AES-256-GCM encryption key for
 *                              stored NWC URLs
 * ─────────────────────────────────────────────────────────────────────────────
 */
import axios from "axios";
import { logger } from "./logger";

const ALBY_HUB_URL = process.env.ALBY_HUB_URL;
const ALBY_HUB_ACCESS_TOKEN = process.env.ALBY_HUB_ACCESS_TOKEN;

export interface SubWallet {
  nwcUrl: string;
  name: string;
}

export async function createSubWallet(handle: string): Promise<SubWallet | null> {
  if (!ALBY_HUB_URL || !ALBY_HUB_ACCESS_TOKEN) {
    logger.warn({ handle }, "Alby Hub admin credentials not set - skipping sub-wallet creation");
    return null;
  }

  const response = await axios.post(
    `${ALBY_HUB_URL}/api/apps`,
    {
      name: `bitpos-${handle}`,
      scopes: [
        "make_invoice",
        "lookup_invoice",
        "list_transactions",
        "get_balance",
        // Note: pay_invoice scope NOT granted - all outbound payments go via main node
      ],
      budgetAmount: null,
      budgetRenewal: "never",
    },
    {
      headers: {
        Authorization: `Bearer ${ALBY_HUB_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    },
  );

  const { pairingUri } = response.data;
  if (!pairingUri) {
    throw new Error("Alby Hub did not return a pairingUri");
  }

  logger.info({ handle }, "Alby sub-wallet created");
  return { nwcUrl: pairingUri, name: `bitpos-${handle}` };
}

export function isConfigured(): boolean {
  return Boolean(ALBY_HUB_URL && ALBY_HUB_ACCESS_TOKEN);
}
