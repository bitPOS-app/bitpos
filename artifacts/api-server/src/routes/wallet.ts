/**
 * Wallet management routes.
 *
 * GET  /user/keypair           — return the user's nostr keypair (for PDF download)
 * PATCH /user/wallet-settings  — switch between Veil and custom NWC wallet
 * POST /admin/migrate-keypairs — generate keypairs for all accounts that lack one (admin only)
 * POST /admin/sweep-to-veil    — move legacy balance_sats to each user's Veil wallet (admin only)
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { accountsTable, entitiesTable, transactionsTable } from "@workspace/db";
import { and, eq, gt, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { encrypt, decrypt } from "../lib/encrypt";
import { generateKeypair, decodeKeypair } from "../lib/nostrKeys";
import { buildVeilNwcUrl, getAccountVeilNwcUrl, makeInvoice, payInvoice, lookupInvoice, getBalance, VEIL_PUBKEY, VEIL_RELAY } from "../lib/nwc";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// GET /user/keypair — return decrypted keypair for PDF download
router.get("/user/keypair", requireAuth, async (req, res): Promise<void> => {
  const { accountId } = req.auth!;

  const [account] = await db
    .select({
      nostrPrivKeyEncrypted: accountsTable.nostrPrivKeyEncrypted,
      nostrPubKey: accountsTable.nostrPubKey,
      walletMode: accountsTable.walletMode,
    })
    .from(accountsTable)
    .where(eq(accountsTable.id, accountId));

  if (!account) { res.status(404).json({ error: "Account not found" }); return; }

  let privKeyHex: string;
  let pubKeyHex: string;

  if (account.nostrPrivKeyEncrypted && account.nostrPubKey) {
    try {
      privKeyHex = decrypt(account.nostrPrivKeyEncrypted);
      pubKeyHex  = account.nostrPubKey;
    } catch {
      res.status(500).json({ error: "Failed to decrypt keypair" });
      return;
    }
  } else {
    // Generate and persist on first access
    const keypair = await generateKeypair();
    await db
      .update(accountsTable)
      .set({
        nostrPrivKeyEncrypted: encrypt(keypair.privKeyHex),
        nostrPubKey: keypair.pubKeyHex,
        walletMode: "veil",
      })
      .where(eq(accountsTable.id, accountId));
    privKeyHex = keypair.privKeyHex;
    pubKeyHex  = keypair.pubKeyHex;
    logger.info({ accountId }, "Keypair generated on first keypair request");
  }

  const keypair = await decodeKeypair(privKeyHex, pubKeyHex);

  res.json({
    npub:      keypair.npub,
    nsec:      keypair.nsec,
    pubKeyHex: keypair.pubKeyHex,
    privKeyHex: keypair.privKeyHex,
    veilPubkey: VEIL_PUBKEY,
    veilRelay:  VEIL_RELAY,
    nwcUrl:     buildVeilNwcUrl(privKeyHex),
  });
});

// PATCH /user/wallet-settings — switch wallet mode
router.patch("/user/wallet-settings", requireAuth, async (req, res): Promise<void> => {
  const { accountId } = req.auth!;
  const { walletMode, customNwcUrl } = req.body as { walletMode?: string; customNwcUrl?: string };

  if (!walletMode || !["veil", "custom"].includes(walletMode)) {
    res.status(400).json({ error: "walletMode must be 'veil' or 'custom'" });
    return;
  }

  if (walletMode === "custom") {
    if (!customNwcUrl || typeof customNwcUrl !== "string") {
      res.status(400).json({ error: "customNwcUrl is required when walletMode is 'custom'" });
      return;
    }
    if (!customNwcUrl.startsWith("nostr+walletconnect://")) {
      res.status(400).json({ error: "customNwcUrl must be a valid NWC connection string (nostr+walletconnect://...)" });
      return;
    }
  }

  await db
    .update(accountsTable)
    .set({
      walletMode,
      customNwcUrl: walletMode === "custom" ? customNwcUrl : null,
    })
    .where(eq(accountsTable.id, accountId));

  logger.info({ accountId, walletMode }, "Wallet settings updated");
  res.json({ ok: true, walletMode });
});

// GET /user/wallet-info — return wallet mode and npub (for settings page)
router.get("/user/wallet-info", requireAuth, async (req, res): Promise<void> => {
  const { accountId } = req.auth!;

  const [account] = await db
    .select({
      nostrPubKey: accountsTable.nostrPubKey,
      walletMode: accountsTable.walletMode,
      customNwcUrl: accountsTable.customNwcUrl,
    })
    .from(accountsTable)
    .where(eq(accountsTable.id, accountId));

  if (!account) { res.status(404).json({ error: "Account not found" }); return; }

  res.json({
    walletMode: account.walletMode ?? "veil",
    npub: account.nostrPubKey
      ? `npub1${account.nostrPubKey.slice(0, 8)}...${account.nostrPubKey.slice(-4)}`
      : null,
    hasKeypair: Boolean(account.nostrPubKey),
    customNwcUrl: account.customNwcUrl ?? null,
  });
});

// POST /admin/migrate-keypairs — generate keypairs for all accounts, return funding list
// Protected by ADMIN_SECRET header.
router.post("/admin/migrate-keypairs", async (req, res): Promise<void> => {
  const secret = req.headers["x-admin-secret"];
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Fetch all accounts with their entity handles and balances
  const accounts = await db
    .select({
      id: accountsTable.id,
      balanceSats: accountsTable.balanceSats,
      nostrPubKey: accountsTable.nostrPubKey,
      nostrPrivKeyEncrypted: accountsTable.nostrPrivKeyEncrypted,
      handle: entitiesTable.handle,
    })
    .from(accountsTable)
    .leftJoin(entitiesTable, eq(entitiesTable.id, accountsTable.entityId));

  const results = [];
  let generated = 0;
  let skipped = 0;

  for (const account of accounts) {
    let pubKeyHex = account.nostrPubKey;
    let privKeyHex: string | null = null;

    if (!pubKeyHex) {
      // Generate a fresh keypair
      const keypair = await generateKeypair();
      await db
        .update(accountsTable)
        .set({
          nostrPrivKeyEncrypted: encrypt(keypair.privKeyHex),
          nostrPubKey: keypair.pubKeyHex,
          walletMode: "veil",
        })
        .where(eq(accountsTable.id, account.id));
      pubKeyHex = keypair.pubKeyHex;
      privKeyHex = keypair.privKeyHex;
      generated++;
      logger.info({ accountId: account.id, handle: account.handle }, "Keypair generated via admin migration");
    } else {
      if (account.nostrPrivKeyEncrypted) {
        try { privKeyHex = decrypt(account.nostrPrivKeyEncrypted); } catch { /* ignore */ }
      }
      skipped++;
    }

    const { decodeKeypair: decode } = await import("../lib/nostrKeys");
    const kp = privKeyHex ? await decode(privKeyHex, pubKeyHex) : null;

    results.push({
      handle: account.handle ?? "(unknown)",
      accountId: account.id,
      balanceSats: account.balanceSats,
      npub: kp?.npub ?? null,
      pubKeyHex,
      nwcUrl: privKeyHex ? buildVeilNwcUrl(privKeyHex) : null,
    });
  }

  logger.info({ generated, skipped, total: accounts.length }, "Admin keypair migration complete");

  res.json({
    generated,
    skipped,
    total: accounts.length,
    accounts: results,
  });
});

// POST /admin/sweep-to-veil — move legacy balance_sats from the platform treasury
// to each user's personal Veil wallet over Lightning. Protected by ADMIN_SECRET header.
//
// Source wallet (the treasury that actually holds the funds) is resolved from:
//   1. request body sourceNwcUrl
//   2. X-Source-Nwc-Url header
//   3. PLATFORM_NWC_URL env var
//
// Body options:
//   { "dryRun": true }        — report what would be swept without moving sats
//   { "accountId": "<uuid>" } — sweep a single account only
//
// Flow per account with balance_sats > 0:
//   1. getAccountNwcUrl(accountId)  — ensures Veil keypair exists
//   2. makeInvoice on the user's Veil wallet for balance_sats
//   3. payInvoice from the source treasury wallet
//   4. insert local transaction record (history display)
//   5. set balance_sats = 0 (Veil is now the source of truth)
//
// Safety model:
// - In-process lock: only one sweep can run at a time (409 if already running).
// - Per-account reservation: balance_sats is atomically zeroed BEFORE paying
//   (conditional UPDATE ... WHERE balance_sats = <expected>). A concurrent call
//   or replica cannot double-pay because the reservation succeeds exactly once.
// - Definitive failure before payment: reservation is rolled back (balance restored).
// - Ambiguous payment failure: the invoice is checked via lookupInvoice on the
//   user's Veil wallet. Settled -> counted as swept. Not settled -> balance
//   restored. Lookup failed -> balance stays zeroed and the payment hash is
//   returned as needs_reconciliation for manual verification (never auto-retried).
// - Fee headroom: treasury must hold totalSats plus 2% for routing/Veil fees.
// - Destination is always the user's Veil wallet - customNwcUrl is ignored.
let sweepInProgress = false;

router.post("/admin/sweep-to-veil", async (req, res): Promise<void> => {
  const secret = req.headers["x-admin-secret"];
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = (req.body ?? {}) as { sourceNwcUrl?: string; dryRun?: boolean; accountId?: string };
  const dryRun = body.dryRun === true;

  const headerSource = req.headers["x-source-nwc-url"];
  const sourceNwcUrl =
    body.sourceNwcUrl ??
    (typeof headerSource === "string" ? headerSource : undefined) ??
    process.env.PLATFORM_NWC_URL;

  if (!dryRun && !sourceNwcUrl) {
    res.status(400).json({
      error: "No source wallet configured - provide sourceNwcUrl in body, X-Source-Nwc-Url header, or set PLATFORM_NWC_URL",
    });
    return;
  }
  if (!dryRun && sourceNwcUrl && !sourceNwcUrl.startsWith("nostr+walletconnect://")) {
    res.status(400).json({ error: "Source wallet URL must be a valid NWC connection string (nostr+walletconnect://...)" });
    return;
  }

  // Fetch accounts that still have a legacy balance
  const candidates = await db
    .select({
      id: accountsTable.id,
      balanceSats: accountsTable.balanceSats,
      handle: entitiesTable.handle,
    })
    .from(accountsTable)
    .leftJoin(entitiesTable, eq(entitiesTable.id, accountsTable.entityId))
    .where(gt(accountsTable.balanceSats, 0));

  const targets = body.accountId
    ? candidates.filter((a) => a.id === body.accountId)
    : candidates;

  const totalSats = targets.reduce((sum, a) => sum + (a.balanceSats ?? 0), 0);
  // Require 2% headroom on top of the sweep total for routing and Veil fees
  const requiredSats = Math.ceil(totalSats * 1.02);

  if (dryRun) {
    res.json({
      dryRun: true,
      accountCount: targets.length,
      totalSats,
      requiredSourceSats: requiredSats,
      sourceConfigured: Boolean(sourceNwcUrl),
      accounts: targets.map((a) => ({
        handle: a.handle ?? "(unknown)",
        accountId: a.id,
        balanceSats: a.balanceSats,
      })),
    });
    return;
  }

  if (sweepInProgress) {
    res.status(409).json({ error: "A sweep is already in progress - wait for it to finish" });
    return;
  }
  sweepInProgress = true;

  try {
    // Verify the source wallet has enough funds (including fee headroom)
    let sourceBalanceSats: number;
    try {
      const bal = await getBalance(sourceNwcUrl);
      sourceBalanceSats = bal.balanceSats;
    } catch (err) {
      logger.error({ err }, "Sweep aborted - could not read source wallet balance");
      res.status(502).json({ error: "Could not read source wallet balance - check the NWC URL" });
      return;
    }
    if (sourceBalanceSats < requiredSats) {
      res.status(400).json({
        error: "Source wallet balance is insufficient for the full sweep (2% fee headroom required)",
        sourceBalanceSats,
        totalSats,
        requiredSats,
      });
      return;
    }

    const results: Array<{
      handle: string;
      accountId: string;
      balanceSats: number;
      status: "swept" | "failed" | "skipped_concurrent" | "needs_reconciliation";
      paymentHash?: string;
      error?: string;
    }> = [];
    let sweptCount = 0;
    let sweptSats = 0;

    const restoreBalance = async (accountId: string, sats: number): Promise<boolean> => {
      try {
        await db
          .update(accountsTable)
          .set({ balanceSats: sql`${accountsTable.balanceSats} + ${sats}` })
          .where(eq(accountsTable.id, accountId));
        return true;
      } catch (err) {
        logger.error({ err, accountId, sats }, "CRITICAL - failed to restore reserved balance after aborted sweep payment");
        return false;
      }
    };

    const recordSweptTransaction = async (accountId: string, sats: number, paymentHash: string): Promise<void> => {
      try {
        await db.insert(transactionsTable).values({
          accountId,
          direction: "in",
          amountSats: sats,
          feeSats: 0,
          type: "receive",
          memo: "Balance migration to Veil wallet",
          status: "completed",
          paymentHash,
        });
      } catch (err) {
        // History record is cosmetic - funds are already correct
        logger.warn({ err, accountId, sats, paymentHash }, "Sweep succeeded but history record insert failed");
      }
    };

    for (const account of targets) {
      const sats = account.balanceSats ?? 0;
      const handle = account.handle ?? "(unknown)";
      if (sats <= 0) continue;

      // 1. Resolve (or lazily create) the user's Veil wallet - never a custom wallet
      let userNwcUrl: string | undefined;
      try {
        userNwcUrl = await getAccountVeilNwcUrl(account.id);
      } catch { /* handled below */ }
      if (!userNwcUrl) {
        results.push({ handle, accountId: account.id, balanceSats: sats, status: "failed", error: "Could not resolve Veil wallet URL for account" });
        continue;
      }

      // 2. Reserve the balance atomically - succeeds exactly once even under
      //    concurrent runs. If another process already swept, this is a no-op.
      const reserved = await db
        .update(accountsTable)
        .set({ balanceSats: 0 })
        .where(and(eq(accountsTable.id, account.id), eq(accountsTable.balanceSats, sats)))
        .returning({ id: accountsTable.id });
      if (reserved.length === 0) {
        results.push({ handle, accountId: account.id, balanceSats: sats, status: "skipped_concurrent", error: "Balance changed since sweep started - re-run to pick up the new amount" });
        continue;
      }

      // 3. Create an invoice on the user's Veil wallet (no money moved yet -
      //    safe to restore the reservation on failure)
      let invoice: { bolt11: string; paymentHash: string };
      try {
        invoice = await makeInvoice(sats, `bitPOS balance migration - ${handle}`, 3600, userNwcUrl);
      } catch (err) {
        await restoreBalance(account.id, sats);
        const message = err instanceof Error ? err.message : String(err);
        results.push({ handle, accountId: account.id, balanceSats: sats, status: "failed", error: `Invoice creation failed: ${message}` });
        continue;
      }

      // 4. Pay from the treasury. A thrown error here is AMBIGUOUS - the
      //    payment may still have settled. Reconcile via the invoice state
      //    on the user's wallet before deciding to restore.
      try {
        const payment = await payInvoice(invoice.bolt11, sourceNwcUrl);
        await recordSweptTransaction(account.id, sats, payment.paymentHash);
        logger.info({ accountId: account.id, handle, sats, paymentHash: payment.paymentHash }, "Legacy balance swept to Veil wallet");
        results.push({ handle, accountId: account.id, balanceSats: sats, status: "swept", paymentHash: payment.paymentHash });
        sweptCount++;
        sweptSats += sats;
      } catch (payErr) {
        const payMessage = payErr instanceof Error ? payErr.message : String(payErr);

        // Reconcile with bounded retries - in-flight payments can settle
        // seconds after the pay call errors out. Outcomes:
        //   settled          -> swept
        //   terminal failed  -> restore reservation
        //   pending/unknown  -> keep reserved, persist pending record, report
        let outcome: "settled" | "terminal_failed" | "unknown" = "unknown";
        let lookupDetail = "";
        for (let attempt = 1; attempt <= 4; attempt++) {
          try {
            const check = await lookupInvoice(invoice.paymentHash, userNwcUrl);
            if (check.paid) { outcome = "settled"; break; }
            if (check.state === "failed" || check.state === "expired" || check.state === "canceled") {
              outcome = "terminal_failed";
              lookupDetail = `invoice state: ${check.state}`;
              break;
            }
            lookupDetail = `invoice state: ${check.state ?? "unknown"} (not terminal)`;
          } catch (lookupErr) {
            lookupDetail = `lookup error: ${lookupErr instanceof Error ? lookupErr.message : String(lookupErr)}`;
          }
          if (attempt < 4) await new Promise((r) => setTimeout(r, 5000));
        }

        if (outcome === "settled") {
          await recordSweptTransaction(account.id, sats, invoice.paymentHash);
          logger.info({ accountId: account.id, handle, sats, paymentHash: invoice.paymentHash }, "Sweep payment settled (reconciled after ambiguous error)");
          results.push({ handle, accountId: account.id, balanceSats: sats, status: "swept", paymentHash: invoice.paymentHash });
          sweptCount++;
          sweptSats += sats;
        } else if (outcome === "terminal_failed") {
          await restoreBalance(account.id, sats);
          logger.error({ accountId: account.id, handle, sats, payError: payMessage, lookupDetail }, "Sweep payment terminally failed - balance restored");
          results.push({ handle, accountId: account.id, balanceSats: sats, status: "failed", error: `Payment failed (${lookupDetail}): ${payMessage}` });
        } else {
          // Pending or undeterminable - keep the balance reserved so a re-run
          // cannot double-pay. Persist a pending transaction record so the
          // ambiguous state survives restarts and is auditable.
          try {
            await db.insert(transactionsTable).values({
              accountId: account.id,
              direction: "in",
              amountSats: sats,
              feeSats: 0,
              type: "receive",
              memo: "Balance migration to Veil wallet - outcome unverified, reconcile via payment hash",
              status: "pending",
              paymentHash: invoice.paymentHash,
            });
          } catch (recErr) {
            logger.error({ err: recErr, accountId: account.id }, "Failed to persist pending reconciliation record");
          }
          logger.error(
            { accountId: account.id, handle, sats, paymentHash: invoice.paymentHash, payError: payMessage, lookupDetail },
            "Sweep payment outcome UNKNOWN after retries - balance kept at zero, verify via payment hash",
          );
          results.push({
            handle,
            accountId: account.id,
            balanceSats: sats,
            status: "needs_reconciliation",
            paymentHash: invoice.paymentHash,
            error: `Payment outcome unknown (pay: ${payMessage}; ${lookupDetail}) - balance kept at zero; if the invoice never settles, restore balance_sats to ${sats} manually`,
          });
        }
      }
    }

    const failedCount = results.filter((r) => r.status === "failed").length;
    const needsReconciliationCount = results.filter((r) => r.status === "needs_reconciliation").length;
    logger.info({ sweptCount, sweptSats, failedCount, needsReconciliationCount, totalSats }, "Sweep to Veil complete");

    res.json({
      sweptCount,
      sweptSats,
      failedCount,
      needsReconciliationCount,
      skippedConcurrentCount: results.filter((r) => r.status === "skipped_concurrent").length,
      totalCandidates: targets.length,
      totalSats,
      results,
    });
  } finally {
    sweepInProgress = false;
  }
});

export default router;
