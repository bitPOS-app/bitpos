import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { accountsTable, pendingInvoicesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { makeInvoice, lookupInvoice } from "../lib/nwc";
import { encrypt, decrypt } from "../lib/encrypt";

const router: IRouter = Router();

// GET /pos/config — device fetches merchant config (currency) on boot.
// Auth via JWT or device token (requireAuth supports both).
router.get("/pos/config", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.auth!.accountId;

  const [account] = await db
    .select({ currency: accountsTable.currency })
    .from(accountsTable)
    .where(eq(accountsTable.id, accountId));

  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  res.json({ currency: account.currency });
});

function resolveNwcUrl(encrypted: string | null | undefined): string | undefined {
  if (!encrypted) return undefined;
  try { return decrypt(encrypted); } catch { return undefined; }
}

// POST /pos/invoice — create a Lightning invoice (used by posBOX device)
router.post("/pos/invoice", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.auth!.accountId;

  const amountSats = Number(req.body?.amountSats);
  if (!amountSats || !Number.isInteger(amountSats) || amountSats < 1) {
    res.status(400).json({ error: "amountSats must be a positive integer" });
    return;
  }

  const memo: string = typeof req.body?.memo === "string" ? req.body.memo.slice(0, 140) : "posBOX payment";

  const [account] = await db
    .select({ albySubWalletNwcUrl: accountsTable.albySubWalletNwcUrl })
    .from(accountsTable)
    .where(eq(accountsTable.id, accountId));

  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  const nwcUrl = resolveNwcUrl(account.albySubWalletNwcUrl);
  const invoiceResult = await makeInvoice(amountSats, memo, 3600, nwcUrl);
  const nwcUrlEncrypted = nwcUrl ? encrypt(nwcUrl) : null;

  await db.insert(pendingInvoicesTable).values({
    accountId,
    bolt11: invoiceResult.bolt11,
    paymentHash: invoiceResult.paymentHash,
    amountSats,
    memo,
    nwcUrlEncrypted,
    expiresAt: invoiceResult.expiresAt,
  });

  res.status(201).json({
    bolt11: invoiceResult.bolt11,
    paymentHash: invoiceResult.paymentHash,
    amountSats,
    expiresAt: invoiceResult.expiresAt,
  });
});

// GET /pos/invoice/:paymentHash/status — poll payment status
router.get("/pos/invoice/:paymentHash/status", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.auth!.accountId;
  const paymentHash = req.params.paymentHash as string;

  const [invoice] = await db
    .select({
      paidAt:          pendingInvoicesTable.paidAt,
      expiresAt:       pendingInvoicesTable.expiresAt,
      nwcUrlEncrypted: pendingInvoicesTable.nwcUrlEncrypted,
    })
    .from(pendingInvoicesTable)
    .where(and(
      eq(pendingInvoicesTable.paymentHash, paymentHash),
      eq(pendingInvoicesTable.accountId, accountId),
    ));

  if (!invoice) {
    res.json({ status: "expired" });
    return;
  }

  if (invoice.paidAt) {
    res.json({ status: "paid" });
    return;
  }

  if (invoice.expiresAt < new Date()) {
    res.json({ status: "expired" });
    return;
  }

  // Not yet marked paid in DB — ask NWC for the real settlement status
  try {
    const nwcUrl = resolveNwcUrl(invoice.nwcUrlEncrypted);
    const result = await lookupInvoice(paymentHash, nwcUrl);
    if (result.paid) {
      const paidAt = result.paidAt ?? new Date();
      await db
        .update(pendingInvoicesTable)
        .set({ paidAt })
        .where(eq(pendingInvoicesTable.paymentHash, paymentHash));
      res.json({ status: "paid" });
      return;
    }
  } catch {
    // NWC lookup failed — fall through to pending (device will retry)
  }

  res.json({ status: "pending" });
});

export default router;
