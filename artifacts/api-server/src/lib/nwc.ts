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
import { extractPaymentHash } from "./lnAddress";
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

  // Lightning-address accounts have no NWC wallet - receive goes through
  // LNURL-pay, spend is unavailable. Unset accounts have not completed
  // wallet setup yet; never lazily create a Veil wallet for them.
  if (account.walletMode === "lnaddress" || account.walletMode === "unset") {
    return undefined;
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

// ── Custom-wallet encryption fallback ────────────────────────────────────────
// The SDK's _selectEncryptionType hard-fails with "no info event (kind 13194)
// returned from relay" when a wallet's relay does not return the info event.
// Per NIP-47, the absence of an info event means the wallet predates encryption
// negotiation and nip04 should be assumed. Production logs show exactly this
// failure for user-supplied custom NWC wallets. When it happens on a non-Veil
// URL, pin nip04 for that URL and retry - if the wallet then rejects nip04,
// the pin is cleared so the next attempt renegotiates.

const encryptionPins = new Map<string, string>(); // nwcUrl → pinned encryption type

function isNoInfoEventError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /no info event/i.test(msg);
}

/**
 * If `err` is the SDK's missing-info-event failure on a non-Veil wallet that
 * is not already pinned, pin nip04 for that URL and return true (caller should
 * retry with a fresh client). Otherwise return false.
 */
function maybePinNip04Fallback(nwcUrl: string | undefined, err: unknown): boolean {
  if (!nwcUrl || nwcUrl.includes(VEIL_PUBKEY)) return false;
  if (!isNoInfoEventError(err)) return false;
  if (encryptionPins.get(nwcUrl) === "nip04") return false;
  encryptionPins.set(nwcUrl, "nip04");
  logger.info({ wallet: nwcUrl.slice(0, 40) }, "NWC info event unavailable - falling back to nip04 encryption for custom wallet");
  return true;
}

/** Clear a nip04 pin after it also failed, so the next attempt renegotiates. */
function clearEncryptionPin(nwcUrl: string | undefined): void {
  if (nwcUrl) encryptionPins.delete(nwcUrl);
}

function getClient(nwcUrl: string | undefined): NWCClient {
  if (!nwcUrl) throw new Error("No NWC URL available - account wallet not configured");
  const cached = clientCache.get(nwcUrl);
  if (cached) {
    cached.lastUsed = Date.now();
    return cached.client;
  }
  const client = new NWCClient({ nostrWalletConnectUrl: nwcUrl });
  // Veil advertises its kind-13194 info event reliably, so the SDK negotiates
  // encryption per the NIP-47 standard on first use (amortized by client reuse).
  // Only custom wallets that returned no info event carry a nip04 pin here.
  const pinned = encryptionPins.get(nwcUrl);
  if (pinned) {
    try {
      (client as unknown as { _encryptionType?: string })._encryptionType = pinned;
    } catch { /* best-effort */ }
  }
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
  return /no info event|timeout|timed out|connection|closed|socket|failed to publish|promises were rejected|rate.?limit|slow down/i.test(msg);
}

/**
 * A publish failure means the request event never reached the relay - the
 * wallet never saw the request, so retrying cannot cause a duplicate action.
 */
function isPublishFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /failed to publish/i.test(msg);
}

/**
 * AMBIGUOUS pay outcome: the request may have reached the wallet even though
 * no reply arrived. "reply timeout" (Nip47ReplyTimeoutError) means the request
 * WAS published and the reply never came back - the payment may well have
 * executed. "publish timeout" means the relay never ACKed, but may still have
 * delivered the event. Neither is proof of failure - callers must resolve the
 * true outcome (lookup) instead of reporting failure, and must NEVER retry.
 */
export function isAmbiguousPayError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /reply timeout|publish timeout/i.test(msg);
}

/**
 * Wallet reports no record of the invoice/payment (lookup_invoice NOT_FOUND).
 * Prefers the NIP-47 error code carried on the SDK's Nip47Error; falls back to
 * message matching only when no code is present. Reconcilers treat this as
 * terminal, so a false positive here would falsely fail a real payment.
 */
export function isPaymentNotFoundError(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code;
  if (typeof code === "string" && code.length > 0) return code === "NOT_FOUND";
  const msg = err instanceof Error ? err.message : String(err);
  return /not.?found|no.?such/i.test(msg);
}

/**
 * Rate-limit pushback from the relay. Veil now signals overload the NIP-01 way
 * (OK:false / CLOSED carrying a "rate-limited:" reason, or a "slow down"
 * NOTICE) and asks clients to treat it as a soft, retryable backoff signal
 * rather than a hard failure. A rate-limited publish is rejected (OK:false), so
 * the request event is NOT delivered to the wallet - retrying after a brief
 * backoff cannot double-act.
 */
function isRateLimitedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /rate.?limit|slow down/i.test(msg);
}

/**
 * Errors that provably occur BEFORE the pay request reaches the wallet, so a
 * single retry cannot cause a duplicate payment:
 *  - publish failure → relay rejected / never stored the request event
 *  - no info event   → encryption negotiation fails before the request is built
 *  - rate-limited    → relay rejected the publish (OK:false), event not delivered
 * Reply/publish timeouts are the AMBIGUOUS case (see isAmbiguousPayError) and
 * must NEVER be retried.
 */
function isPreSendPayRetryable(err: unknown): boolean {
  return isPublishFailure(err) || isNoInfoEventError(err) || isRateLimitedError(err);
}

/**
 * Whether to pause briefly before the single retry. Relay pushback
 * (rate-limited, or a publish rejected by the relay - which includes a stale
 * socket that fails to publish) recovers if we back off instead of instantly
 * re-hammering. Pure connection or negotiation errors (a closed socket surfaced
 * as a connection error, or a missing info event) are not pushback and retry
 * immediately to keep latency low - the Bolt Card tap budget is tight.
 */
function shouldBackoffBeforeRetry(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /rate.?limit|slow down|failed to publish|promises were rejected/i.test(msg);
}

const RETRY_BACKOFF_BASE_MS = 250;
const RETRY_BACKOFF_JITTER_MS = 250;
function retryBackoffMs(): number {
  return RETRY_BACKOFF_BASE_MS + Math.floor(Math.random() * RETRY_BACKOFF_JITTER_MS);
}
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    // Custom wallet whose relay has no info event: pin nip04 and retry.
    const pinnedNow = maybePinNip04Fallback(nwcUrl, err);
    if (!pinnedNow && !isTransientRelayError(err)) throw err;
    if (!pinnedNow) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, "NWC transient relay error - retrying with fresh connection");
    }
    // Back off briefly on relay pushback (rate-limited / publish rejected) so we
    // let the relay recover instead of instantly re-hammering it; connection and
    // negotiation errors are not pushback and retry immediately.
    if (shouldBackoffBeforeRetry(err)) await delay(retryBackoffMs());
    try {
      return await op(getClient(nwcUrl));
    } catch (retryErr) {
      // A FRESH connection also failed - that is a relay-side problem, not a
      // stale socket. Start the cooldown so background traffic backs off.
      evictClient(nwcUrl);
      if (pinnedNow) clearEncryptionPin(nwcUrl);
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
  /** Actual network/routing fee the wallet paid, in sats (from NIP-47 fees_paid, msats rounded up). */
  feesPaidSats: number;
}

export interface LookupInvoiceResult {
  paid: boolean;
  /** Raw NWC invoice state: "settled", "pending", "accepted", "failed", or undefined if not reported. */
  state?: string;
  /** Transaction direction as reported by the wallet: "incoming" or "outgoing". */
  type?: string;
  paidAt?: Date;
  amountMsats?: number;
  /** Payment preimage, present once the invoice is settled (wallet-dependent). */
  preimage?: string;
  /** Payment hash as reported by the wallet. */
  paymentHash?: string;
  /** Routing fees paid in msats (outgoing payments, wallet-dependent). */
  feesPaidMsats?: number;
}

export interface GetBalanceResult {
  balanceSats: number;
}

export interface NwcTransaction {
  type: "incoming" | "outgoing";
  paymentHash: string;
  /** Raw NWC state when reported: "settled", "pending", "accepted", "failed", "expired". */
  state?: string;
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
    const feesPaidSats = Math.ceil((result.fees_paid ?? 0) / 1000);
    return { preimage, paymentHash, feesPaidSats };
  };

  try {
    return await attempt();
  } catch (err) {
    evictClient(nwcUrl);
    // "No info event" fails during encryption negotiation - BEFORE the pay
    // request is ever sent - so retrying with a nip04 pin cannot double-pay.
    const pinnedNow = maybePinNip04Fallback(nwcUrl, err);
    // Only retry when the request provably never reached the wallet (pre-send:
    // publish rejected / rate-limited / info-event negotiation failed). Reply
    // and publish timeouts are AMBIGUOUS and must fall through to the caller,
    // which resolves the true outcome by lookup - retrying an ambiguous pay is
    // exactly what caused the triple-charge incident.
    if (!pinnedNow && !isPreSendPayRetryable(err)) throw err;
    if (!pinnedNow) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, "payInvoice pre-send failure - request never delivered, retrying with fresh connection");
    }
    // Relay pushback (rate-limited / publish rejected) gets a brief backoff so
    // the retry does not instantly re-hit a relay that is asking us to slow down.
    if (shouldBackoffBeforeRetry(err)) await delay(retryBackoffMs());
    try {
      return await attempt();
    } catch (retryErr) {
      evictClient(nwcUrl);
      if (pinnedNow) clearEncryptionPin(nwcUrl);
      noteRelayOverload(retryErr);
      throw retryErr;
    }
  }
}

type RawLookupResult = {
  state?: string | null;
  type?: string | null;
  settled_at?: number | null;
  amount?: number;
  preimage?: string | null;
  payment_hash?: string;
  fees_paid?: number | null;
};

function mapLookupResult(result: RawLookupResult): LookupInvoiceResult {
  // Settled state, a settlement timestamp, or a revealed preimage each prove
  // payment. Some wallets (e.g. Primal) omit settled_at - never require it.
  const paid = result.state === "settled" || result.settled_at != null || !!result.preimage;
  return {
    paid,
    state: result.state ?? undefined,
    type: result.type ?? undefined,
    paidAt: paid && result.settled_at ? new Date(result.settled_at * 1000) : undefined,
    amountMsats: result.amount,
    preimage: result.preimage || undefined,
    paymentHash: result.payment_hash || undefined,
    feesPaidMsats: result.fees_paid ?? undefined,
  };
}

export async function lookupInvoice(paymentHash: string, nwcUrl?: string): Promise<LookupInvoiceResult> {
  return withClient(nwcUrl, async (client) => {
    const result = await client.lookupInvoice({ payment_hash: paymentHash });
    return mapLookupResult(result as RawLookupResult);
  });
}

/**
 * Look up an outgoing payment by the payment hash of the bolt11 it paid. Used
 * to resolve AMBIGUOUS pay_invoice outcomes: after a reply timeout the payer's
 * wallet is asked whether the invoice was actually paid. The wallet reports
 * its own outgoing payment record - state "settled" (or a preimage) proves the
 * payment went through.
 *
 * IMPORTANT: Veil answers lookup_invoice ONLY by payment_hash. Querying by
 * the invoice string returns NOT_FOUND even for settled payments (verified by
 * live probe against a real settled payment) - which caused the reconciler to
 * falsely fail settled Bolt Card payments. Never query by invoice string.
 */
export async function lookupOutgoingPayment(bolt11: string, nwcUrl?: string): Promise<LookupInvoiceResult> {
  const paymentHash = extractPaymentHash(bolt11);
  return withClient(nwcUrl, async (client) => {
    const result = await client.lookupInvoice({ payment_hash: paymentHash });
    return mapLookupResult(result as RawLookupResult);
  });
}

// ── Hold invoice operations (platform fee wallet) ────────────────────────────
// Used by the incoming-fee wrap engine: the platform wallet mints a hold
// invoice with the SAME payment hash as the merchant's real invoice. The
// customer's payment is held (never in bitPOS custody) until bitPOS forwards
// the merchant invoice and settles with the returned preimage.

/** The platform fee wallet (Alby) - the only wallet with hold-invoice support. */
export const PLATFORM_NWC_URL = process.env.ALBY_NWC_URL;

export async function makeHoldInvoice(
  amountSats: number,
  description: string,
  paymentHash: string,
  expirySeconds: number,
  nwcUrl: string,
): Promise<MakeInvoiceResult> {
  return withClient(nwcUrl, async (client) => {
    const result = await client.makeHoldInvoice({
      amount: amountSats * 1000,
      description,
      expiry: expirySeconds,
      payment_hash: paymentHash,
    });
    return {
      bolt11: result.invoice,
      paymentHash: result.payment_hash,
      expiresAt: new Date(Date.now() + expirySeconds * 1000),
    };
  });
}

export async function settleHoldInvoice(preimage: string, nwcUrl: string): Promise<void> {
  await withClient(nwcUrl, (client) => client.settleHoldInvoice({ preimage }));
}

export async function cancelHoldInvoice(paymentHash: string, nwcUrl: string): Promise<void> {
  await withClient(nwcUrl, (client) => client.cancelHoldInvoice({ payment_hash: paymentHash }));
}

export { paymentHashFromPreimage };

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
      state: (tx as { state?: string }).state ?? undefined,
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
