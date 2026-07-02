/**
 * NWC (Nostr Wallet Connect) service layer.
 *
 * Each bitPOS account connects to Veil (nstrpsp.xyz) via a personal nostr keypair.
 * The NWC URL is computed on-the-fly from the user's stored private key:
 *   nostr+walletconnect://<VEIL_PUBKEY>?relay=<VEIL_RELAY>&secret=<user-privkey-hex>
 *
 * Users may override this with their own NIP-47 wallet URL (walletMode = 'custom').
 * If a user has no keypair yet (pre-migration accounts), one is generated and stored
 * lazily on first use.
 *
 * The main ALBY_NWC_URL is still used as:
 *   - The outbound payment node for processExternalPayment (fee engine)
 *   - The operator-level fallback in the invoice monitor main subscription
 */
import { NWCClient } from "@getalby/sdk";
import { createHash } from "crypto";
import { db } from "@workspace/db";
import { accountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { encrypt, decrypt } from "./encrypt";
import { generateKeypair } from "./nostrKeys";
import { logger } from "./logger";

export const VEIL_PUBKEY = process.env.VEIL_PUBKEY ?? "699eb080dfbd2cb1e09a5d72e35779f07340414b005ec98e839ca3f8542a2e05";
export const VEIL_RELAY  = process.env.VEIL_RELAY  ?? "wss://nstrpsp.xyz/nostr";

/** Build a Veil NWC URL from a user's hex private key. */
export function buildVeilNwcUrl(privKeyHex: string): string {
  return `nostr+walletconnect://${VEIL_PUBKEY}?relay=${encodeURIComponent(VEIL_RELAY)}&secret=${privKeyHex}`;
}

/** Decrypt a stored encrypted NWC URL. Returns undefined on failure. */
export function resolveNwcUrl(encrypted: string | null | undefined): string | undefined {
  if (!encrypted) return undefined;
  try { return decrypt(encrypted); } catch { return undefined; }
}

/**
 * Look up the active NWC URL for an account.
 * - walletMode='custom': returns the stored customNwcUrl (plaintext)
 * - walletMode='veil' (default): decrypts stored private key and builds Veil URL
 * - If no keypair exists yet: generates one, persists it, returns the Veil URL
 * Returns undefined if nothing can be resolved (use main node fallback).
 */
export async function getAccountNwcUrl(accountId: string): Promise<string | undefined> {
  const [account] = await db
    .select({
      nostrPrivKeyEncrypted: accountsTable.nostrPrivKeyEncrypted,
      nostrPubKey: accountsTable.nostrPubKey,
      walletMode: accountsTable.walletMode,
      customNwcUrl: accountsTable.customNwcUrl,
    })
    .from(accountsTable)
    .where(eq(accountsTable.id, accountId));

  if (!account) return undefined;

  if (account.walletMode === "custom" && account.customNwcUrl) {
    return account.customNwcUrl;
  }

  return resolveVeilUrlForAccount(accountId, account.nostrPrivKeyEncrypted);
}

/**
 * Resolve the account's Veil wallet URL, ignoring any custom wallet override.
 * Used by the balance migration sweep, which must always target Veil.
 */
export async function getAccountVeilNwcUrl(accountId: string): Promise<string | undefined> {
  const [account] = await db
    .select({ nostrPrivKeyEncrypted: accountsTable.nostrPrivKeyEncrypted })
    .from(accountsTable)
    .where(eq(accountsTable.id, accountId));

  if (!account) return undefined;
  return resolveVeilUrlForAccount(accountId, account.nostrPrivKeyEncrypted);
}

async function resolveVeilUrlForAccount(
  accountId: string,
  nostrPrivKeyEncrypted: string | null,
): Promise<string | undefined> {
  if (nostrPrivKeyEncrypted) {
    const privKeyHex = resolveNwcUrl(nostrPrivKeyEncrypted);
    if (privKeyHex) return buildVeilNwcUrl(privKeyHex);
  }

  // No keypair yet - generate lazily
  try {
    const keypair = await generateKeypair();
    await db
      .update(accountsTable)
      .set({
        nostrPrivKeyEncrypted: encrypt(keypair.privKeyHex),
        nostrPubKey: keypair.pubKeyHex,
        walletMode: "veil",
      })
      .where(eq(accountsTable.id, accountId));
    logger.info({ accountId, pubKey: keypair.pubKeyHex }, "Nostr keypair generated lazily for existing account");
    return buildVeilNwcUrl(keypair.privKeyHex);
  } catch (err) {
    logger.warn({ err, accountId }, "Lazy keypair generation failed");
    return undefined;
  }
}

// ── Client cache ─────────────────────────────────────────────────────────────
// Reuse one NWCClient per wallet URL. The client caches the wallet info event
// (kind 13194) after its first request, so reuse avoids re-fetching it on
// every call - the relay rate-limits those fetches under load, which surfaces
// as "no info event (kind 13194) returned from relay" on real requests.

const CLIENT_IDLE_TTL_MS = 5 * 60 * 1000;
const clientCache = new Map<string, { client: NWCClient; lastUsed: number }>();

function getClient(nwcUrl: string | undefined): NWCClient {
  if (!nwcUrl) throw new Error("No NWC URL available - account wallet not configured");
  const cached = clientCache.get(nwcUrl);
  if (cached) {
    cached.lastUsed = Date.now();
    return cached.client;
  }
  const client = new NWCClient({ nostrWalletConnectUrl: nwcUrl });
  clientCache.set(nwcUrl, { client, lastUsed: Date.now() });
  return client;
}

/** Drop a cached client after a failure so the next call reconnects fresh. */
function evictClient(nwcUrl: string | undefined): void {
  if (!nwcUrl) return;
  const cached = clientCache.get(nwcUrl);
  if (!cached) return;
  clientCache.delete(nwcUrl);
  try { cached.client.close(); } catch { /* ignore */ }
}

// Periodically close idle connections
setInterval(() => {
  const cutoff = Date.now() - CLIENT_IDLE_TTL_MS;
  for (const [url, entry] of clientCache) {
    if (entry.lastUsed < cutoff) {
      clientCache.delete(url);
      try { entry.client.close(); } catch { /* ignore */ }
    }
  }
}, 60 * 1000).unref();

function isTransientRelayError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /no info event|timeout|timed out|connection|closed|socket|failed to publish|promises were rejected/i.test(msg);
}

/**
 * A publish failure means the request event never reached the relay - the
 * wallet never saw the request, so retrying cannot cause a duplicate action.
 */
function isPublishFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /failed to publish/i.test(msg);
}

// ── Relay overload cooldown ──────────────────────────────────────────────────
// When the relay refuses fresh connections or rate-limits us, ALL background
// work (reconcile, sweeps, subscriptions) must back off so the limited request
// budget goes to user-facing calls. User-facing ops still attempt (with one
// retry) - the cooldown only silences background traffic.

const RELAY_COOLDOWN_MS = 2 * 60 * 1000;
let relayCooldownUntil = 0;

export function relayInCooldown(): boolean {
  return Date.now() < relayCooldownUntil;
}

/**
 * Record a relay-side failure. Returns true if the error indicates the relay
 * is overloaded / refusing us, in which case a cooldown window starts.
 */
export function noteRelayOverload(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (/no info event|failed to publish|promises were rejected|failed to connect|rate.?limit|slow down/i.test(msg)) {
    relayCooldownUntil = Date.now() + RELAY_COOLDOWN_MS;
    logger.warn({ err: msg }, "Relay overload detected - pausing background NWC traffic for cooldown");
    return true;
  }
  return false;
}

/**
 * Run an NWC operation with the cached client; on transient relay failure,
 * evict the cached client and retry once with a fresh connection.
 */
async function withClient<T>(nwcUrl: string | undefined, op: (client: NWCClient) => Promise<T>): Promise<T> {
  try {
    return await op(getClient(nwcUrl));
  } catch (err) {
    evictClient(nwcUrl);
    if (!isTransientRelayError(err)) throw err;
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "NWC transient relay error - retrying with fresh connection");
    try {
      return await op(getClient(nwcUrl));
    } catch (retryErr) {
      // A FRESH connection also failed - that is a relay-side problem, not a
      // stale socket. Start the cooldown so background traffic backs off.
      evictClient(nwcUrl);
      noteRelayOverload(retryErr);
      throw retryErr;
    }
  }
}

function paymentHashFromPreimage(preimageHex: string): string {
  return createHash("sha256")
    .update(Buffer.from(preimageHex, "hex"))
    .digest("hex");
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
  /** Raw NWC invoice state: "settled", "pending", "failed", or undefined if not reported. */
  state?: string;
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
  return withClient(nwcUrl, async (client) => {
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
  });
}

export async function payInvoice(bolt11: string, nwcUrl?: string): Promise<PayInvoiceResult> {
  // NEVER auto-retry a payment after the request may have been sent - that
  // could trigger a duplicate payment. The ONLY safe retry is a publish
  // failure (the request event never reached the relay, so the wallet never
  // saw it) - typically a stale cached websocket. Evict on any failure so the
  // next attempt reconnects fresh.
  const attempt = async (): Promise<PayInvoiceResult> => {
    const client = getClient(nwcUrl);
    const result = await client.payInvoice({ invoice: bolt11 });
    const preimage = result.preimage;
    const paymentHash = paymentHashFromPreimage(preimage);
    return { preimage, paymentHash };
  };

  try {
    return await attempt();
  } catch (err) {
    evictClient(nwcUrl);
    if (!isPublishFailure(err)) throw err;
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "payInvoice publish failure - request never sent, retrying with fresh connection");
    try {
      return await attempt();
    } catch (retryErr) {
      evictClient(nwcUrl);
      noteRelayOverload(retryErr);
      throw retryErr;
    }
  }
}

export async function lookupInvoice(paymentHash: string, nwcUrl?: string): Promise<LookupInvoiceResult> {
  return withClient(nwcUrl, async (client) => {
    const result = await client.lookupInvoice({ payment_hash: paymentHash });
    const paid = result.state === "settled" || result.settled_at != null;
    return {
      paid,
      state: result.state ?? undefined,
      paidAt: paid && result.settled_at ? new Date(result.settled_at * 1000) : undefined,
      amountMsats: result.amount,
    };
  });
}

export async function getBalance(nwcUrl?: string): Promise<GetBalanceResult> {
  return withClient(nwcUrl, async (client) => {
    const result = await client.getBalance();
    return { balanceSats: Math.floor(result.balance / 1000) };
  });
}

export interface ListTransactionsOpts {
  /** Unix seconds - only transactions created at/after this time. */
  from?: number;
  limit?: number;
}

export async function listTransactions(nwcUrl?: string, opts: ListTransactionsOpts = {}): Promise<NwcTransaction[]> {
  return withClient(nwcUrl, async (client) => {
    const result = await client.listTransactions({
      ...(opts.from !== undefined ? { from: opts.from } : {}),
      ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
    });
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
  });
}

logger.info({ veilPubkey: VEIL_PUBKEY, veilRelay: VEIL_RELAY }, "NWC service initialized (Veil)");
