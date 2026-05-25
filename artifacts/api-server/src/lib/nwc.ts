/**
 * NWC (Nostr Wallet Connect) service layer.
 *
 * This module is the single integration point for all Lightning wallet operations,
 * including sub-wallet provisioning via Alby Hub admin API.
 */
import { NWCClient } from "@getalby/sdk";
import { createHash } from "crypto";
import { createSubWallet as _createSubWallet, type SubWallet } from "./albyHub";
import { logger } from "./logger";

const NWC_URL = process.env.ALBY_NWC_URL;

function getClient(nwcUrl?: string): NWCClient {
  const url = nwcUrl ?? NWC_URL;
  if (!url) throw new Error("No NWC URL available - set ALBY_NWC_URL");
  return new NWCClient({ nostrWalletConnectUrl: url });
}

function paymentHashFromPreimage(preimageHex: string): string {
  return createHash("sha256")
    .update(Buffer.from(preimageHex, "hex"))
    .digest("hex");
}

// ── Sub-wallet provisioning (Alby Hub admin API) ──────────────────────────────

export type { SubWallet };

/**
 * Provision an Alby Hub sub-wallet for a new user account.
 * Returns null and logs a warning if Alby Hub credentials are not configured.
 */
export async function createSubWallet(handle: string): Promise<SubWallet | null> {
  return _createSubWallet(handle);
}

// ── Invoice & payment operations ─────────────────────────────────────────────

export interface MakeInvoiceResult {
  bolt11: string;
  paymentHash: string;
  expiresAt: Date;
}

export interface PayInvoiceResult {
  preimage: string;
  paymentHash: string;
}

export interface LookupInvoiceResult {
  paid: boolean;
  paidAt?: Date;
  amountMsats?: number;
}

export interface GetBalanceResult {
  balanceSats: number;
}

export interface NwcTransaction {
  type: "incoming" | "outgoing";
  paymentHash: string;
  preimage?: string;
  amountMsats: number;
  feesMsats?: number;
  createdAt: Date;
  settledAt?: Date;
  description?: string;
}

export async function makeInvoice(
  amountSats: number,
  description: string,
  expirySeconds = 3600,
  nwcUrl?: string,
): Promise<MakeInvoiceResult> {
  const client = getClient(nwcUrl);
  try {
    const result = await client.makeInvoice({
      amount: amountSats * 1000,
      description,
      expiry: expirySeconds,
    });
    return {
      bolt11: result.invoice,
      paymentHash: result.payment_hash,
      expiresAt: new Date(Date.now() + expirySeconds * 1000),
    };
  } finally {
    client.close();
  }
}

export async function payInvoice(bolt11: string, nwcUrl?: string): Promise<PayInvoiceResult> {
  const client = getClient(nwcUrl);
  try {
    const result = await client.payInvoice({ invoice: bolt11 });
    const preimage = result.preimage;
    const paymentHash = paymentHashFromPreimage(preimage);
    return { preimage, paymentHash };
  } finally {
    client.close();
  }
}

export async function lookupInvoice(paymentHash: string, nwcUrl?: string): Promise<LookupInvoiceResult> {
  const client = getClient(nwcUrl);
  try {
    const result = await client.lookupInvoice({ payment_hash: paymentHash });
    const paid = result.state === "settled" || result.settled_at != null;
    return {
      paid,
      paidAt: paid && result.settled_at ? new Date(result.settled_at * 1000) : undefined,
      amountMsats: result.amount,
    };
  } finally {
    client.close();
  }
}

export async function getBalance(nwcUrl?: string): Promise<GetBalanceResult> {
  const client = getClient(nwcUrl);
  try {
    const result = await client.getBalance();
    return { balanceSats: Math.floor(result.balance / 1000) };
  } finally {
    client.close();
  }
}

export async function listTransactions(nwcUrl?: string): Promise<NwcTransaction[]> {
  const client = getClient(nwcUrl);
  try {
    const result = await client.listTransactions({});
    return (result.transactions ?? []).map((tx) => ({
      type: tx.type === "incoming" ? "incoming" : "outgoing",
      paymentHash: tx.payment_hash,
      preimage: tx.preimage ?? undefined,
      amountMsats: tx.amount,
      feesMsats: tx.fees_paid ?? undefined,
      createdAt: new Date(tx.created_at * 1000),
      settledAt: tx.settled_at ? new Date(tx.settled_at * 1000) : undefined,
      description: tx.description ?? undefined,
    }));
  } finally {
    client.close();
  }
}

export function isConfigured(): boolean {
  return Boolean(NWC_URL);
}

logger.info({ configured: isConfigured() }, "NWC service initialized");
