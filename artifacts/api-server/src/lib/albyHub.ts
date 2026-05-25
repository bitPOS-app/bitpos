/**
 * Alby Hub sub-wallet provisioning.
 *
 * Architecture notes:
 * ─────────────────────────────────────────────────────────────────────────────
 * bitPOS uses a CUSTODIAL virtual-balance model with ONE main NWC node
 * (configured via ALBY_NWC_URL) for all outbound Lightning payments.
 *
 * Sub-wallets (one per user) are optional Alby Hub app connections that
 * allow received funds to be credited inside the correct Alby Hub bucket for
 * accounting purposes.  They are provisioned via the Alby Hub admin REST API
 * (ALBY_HUB_URL + ALBY_HUB_ACCESS_TOKEN).
 *
 * Sub-wallet NWC URLs are ONLY used for:
 *   - makeInvoice()   - generate a receive invoice in the user's bucket
 *   - lookupInvoice() - poll payment status in the user's bucket
 *
 * All OUTBOUND payments (pay, swap, internal transfer) go through the main
 * NWC node.  Virtual balances are authoritative; sub-wallet buckets are
 * informational.
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
