import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { accountsTable, pendingInvoicesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { makeInvoice, lookupInvoice, resolveNwcUrl } from "../lib/nwc";
import { encrypt } from "../lib/encrypt";
import { subscribeSubWalletInvoice, settleInvoiceByPaymentHash } from "../lib/invoiceMonitor";
import { createWrappedInvoice, advanceWrap, type WrapRow } from "../lib/holdWrap";
import { resolveWalletSource } from "../lib/walletSource";
import { requestLnurlInvoice, checkLnurlVerify } from "../lib/lnAddress";

const router: IRouter = Router();

// GET /pos/config — device fetches merchant config (currency) on boot.
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

// POST /pos/invoice — create a Lightning invoice (used by posBOX device)
router.post("/pos/invoice", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.auth!.accountId;

  const amountSats = Number(req.body?.amountSats);
  if (!amountSats || !Number.isInteger(amountSats) || amountSats < 1) {
    res.status(400).json({ error: "amountSats must be a positive integer" });
    return;
  }

  const memo: string = typeof req.body?.memo === "string" ? req.body.memo.slice(0, 140) : "posBOX payment";

  const source = await resolveWalletSource(accountId);

  if (source.kind === "none") {
    res.status(400).json({ error: "Wallet not configured - complete wallet setup in the bitPOS app before taking payments" });
    return;
  }

  // Lightning-address merchant: fetch the invoice from their provider via
  // LNURL-pay; settlement is detected by polling the LUD-21 verify URL.
  // No hold-wrap - the payment goes straight to the provider.
  if (source.kind === "lnaddress") {
    let lnurlInvoice;
    try {
      lnurlInvoice = await requestLnurlInvoice(source.address, amountSats, memo);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: `Could not get an invoice from ${source.address}: ${message}` });
      return;
    }
    if (!lnurlInvoice.verifyUrl) {
      res.status(502).json({
        error: "Your lightning address provider stopped supporting payment verification - reconnect your wallet in settings",
      });
      return;
    }

    const expiresAt = new Date(Date.now() + 3600 * 1000);
    await db.insert(pendingInvoicesTable).values({
      accountId,
      bolt11: lnurlInvoice.bolt11,
      paymentHash: lnurlInvoice.paymentHash,
      amountSats,
      memo,
      lnurlVerifyUrl: lnurlInvoice.verifyUrl,
      expiresAt,
    });

    res.status(201).json({
      bolt11: lnurlInvoice.bolt11,
      paymentHash: lnurlInvoice.paymentHash,
      amountSats,
      expiresAt,
    });
    return;
  }

  const nwcUrl = source.nwcUrl;
  const nwcUrlEncrypted = encrypt(nwcUrl);

  // 1% incoming fee via wrapped hold invoice on the platform fee wallet.
  // Falls back to a direct (fee-free) invoice if wrapping is unavailable -
  // a sale is never blocked by the fee engine.
  const wrap = await createWrappedInvoice(amountSats, memo, nwcUrl);

  if (wrap) {
    await db.insert(pendingInvoicesTable).values({
      accountId,
      bolt11: wrap.bolt11,
      paymentHash: wrap.paymentHash,
      amountSats,
      memo,
      nwcUrlEncrypted,
      merchantBolt11: wrap.merchantBolt11,
      merchantPaymentHash: wrap.merchantPaymentHash,
      holdPreimage: wrap.holdPreimage,
      feeSats: wrap.feeSats,
      wrapStatus: "created",
      wrapUpdatedAt: new Date(),
      expiresAt: wrap.expiresAt,
    });

    res.status(201).json({
      bolt11: wrap.bolt11,
      paymentHash: wrap.paymentHash,
      amountSats,
      expiresAt: wrap.expiresAt,
    });
    return;
  }

  const invoiceResult = await makeInvoice(amountSats, memo, 3600, nwcUrl);

  await db.insert(pendingInvoicesTable).values({
    accountId,
    bolt11: invoiceResult.bolt11,
    paymentHash: invoiceResult.paymentHash,
    amountSats,
    memo,
    nwcUrlEncrypted,
    expiresAt: invoiceResult.expiresAt,
  });

  // Subscribe for instant push notification when paid
  if (nwcUrl) {
    subscribeSubWalletInvoice(invoiceResult.paymentHash, nwcUrl).catch(() => {});
  }

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
    .select()
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

  // Wrapped invoice: every poll drives the hold-wrap state machine forward
  // (accepted -> forward -> settle). Settlement is request-driven because
  // production runs on autoscale.
  if (invoice.wrapStatus) {
    try {
      const status = await advanceWrap(invoice as WrapRow);
      if (status === "settled") {
        res.json({ status: "paid" });
        return;
      }
      if (status === "cancelled") {
        // Forward failed - the customer's held sats refund automatically.
        // Reported as "expired" because the posBOX firmware only understands
        // paid/expired/error.
        res.json({ status: "expired", detail: "cancelled" });
        return;
      }
    } catch {
      // fall through to pending/expired below
    }

    if (invoice.expiresAt < new Date()) {
      res.json({ status: "expired" });
      return;
    }
    res.json({ status: "pending" });
    return;
  }

  // Lightning-address invoice: settlement is detected by polling the
  // provider's LUD-21 verify URL - no NWC involved.
  if (invoice.lnurlVerifyUrl) {
    try {
      const verify = await checkLnurlVerify(invoice.lnurlVerifyUrl);
      if (verify.settled) {
        await settleInvoiceByPaymentHash(paymentHash, new Date());
        res.json({ status: "paid" });
        return;
      }
    } catch {
      // verify endpoint unreachable - fall through to pending/expired
    }
    if (invoice.expiresAt < new Date()) {
      res.json({ status: "expired" });
      return;
    }
    res.json({ status: "pending" });
    return;
  }

  if (invoice.expiresAt < new Date()) {
    res.json({ status: "expired" });
    return;
  }

  try {
    const nwcUrl = resolveNwcUrl(invoice.nwcUrlEncrypted);
    const result = await lookupInvoice(paymentHash, nwcUrl);
    if (result.paid) {
      // Full settlement (marks paidAt AND records the receive transaction).
      await settleInvoiceByPaymentHash(paymentHash, result.paidAt ?? new Date());
      res.json({ status: "paid" });
      return;
    }
  } catch {
    // NWC lookup failed — fall through to pending
  }

  res.json({ status: "pending" });
});

export default router;
