import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { entitiesTable, accountsTable, pendingInvoicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { makeInvoice } from "../lib/nwc";
import { encrypt } from "../lib/encrypt";
import { DOMAIN } from "../lib/domain";
import { subscribeSubWalletInvoice } from "../lib/invoiceMonitor";
import { resolveWalletSource } from "../lib/walletSource";
import { requestLnurlInvoice } from "../lib/lnAddress";

const router: IRouter = Router();
const MIN_SENDABLE_MSATS = 1000;
const MAX_SENDABLE_MSATS = 100_000_000_000;

// LNURL-pay metadata - must be at root (no /api prefix) per LNURL-pay spec
router.get("/.well-known/lnurlp/:handle", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.handle) ? req.params.handle[0] : req.params.handle;
  const handle = raw.toLowerCase();

  const [entity] = await db
    .select({ id: entitiesTable.id, handle: entitiesTable.handle })
    .from(entitiesTable)
    .where(eq(entitiesTable.handle, handle));

  if (!entity) { res.status(404).json({ status: "ERROR", reason: "User not found" }); return; }

  res.json({
    tag: "payRequest",
    callback: `https://${DOMAIN}/lnurlp/${handle}/callback`,
    minSendable: MIN_SENDABLE_MSATS,
    maxSendable: MAX_SENDABLE_MSATS,
    metadata: JSON.stringify([
      ["text/plain", `Send sats to ${handle}@${DOMAIN}`],
      ["text/identifier", `${handle}@${DOMAIN}`],
    ]),
  });
});

// LNURL-pay callback
router.get("/lnurlp/:handle/callback", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.handle) ? req.params.handle[0] : req.params.handle;
  const handle = raw.toLowerCase();

  const amountMsats = Number(req.query.amount);
  if (!amountMsats || amountMsats < MIN_SENDABLE_MSATS || amountMsats > MAX_SENDABLE_MSATS) {
    res.status(400).json({ status: "ERROR", reason: "Invalid or missing amount" });
    return;
  }

  const amountSats = Math.ceil(amountMsats / 1000);

  const [entity] = await db
    .select({ id: entitiesTable.id })
    .from(entitiesTable)
    .where(eq(entitiesTable.handle, handle));

  if (!entity) { res.status(404).json({ status: "ERROR", reason: "User not found" }); return; }

  const [account] = await db
    .select({ id: accountsTable.id })
    .from(accountsTable)
    .where(eq(accountsTable.entityId, entity.id));

  if (!account) { res.status(500).json({ status: "ERROR", reason: "Account not found" }); return; }

  const source = await resolveWalletSource(account.id);
  const memo = `Payment to ${handle}@${DOMAIN}`;

  if (source.kind === "none") {
    res.status(400).json({ status: "ERROR", reason: "This user has not completed wallet setup" });
    return;
  }

  // Lightning-address account: proxy the invoice from the user's provider so
  // handle@DOMAIN keeps working. Settlement is detected via LUD-21 verify.
  if (source.kind === "lnaddress") {
    try {
      const lnurlInvoice = await requestLnurlInvoice(source.address, amountSats, memo);
      if (!lnurlInvoice.verifyUrl) {
        // Without LUD-21 verify there is no way to detect settlement - the
        // row would stay pending forever. Same requirement as pos/accounts.
        res.status(502).json({ status: "ERROR", reason: "Upstream provider does not support payment verification (LUD-21)" });
        return;
      }
      await db.insert(pendingInvoicesTable).values({
        accountId: account.id,
        bolt11: lnurlInvoice.bolt11,
        paymentHash: lnurlInvoice.paymentHash,
        amountSats,
        memo,
        lnurlVerifyUrl: lnurlInvoice.verifyUrl,
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });
      res.json({ pr: lnurlInvoice.bolt11, routes: [] });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      res.status(502).json({ status: "ERROR", reason: `Upstream provider error: ${reason}` });
    }
    return;
  }

  const nwcUrl = source.nwcUrl;
  const invoiceResult = await makeInvoice(amountSats, memo, 3600, nwcUrl);
  const nwcUrlEncrypted = encrypt(nwcUrl);

  await db.insert(pendingInvoicesTable).values({
    accountId: account.id,
    bolt11: invoiceResult.bolt11,
    paymentHash: invoiceResult.paymentHash,
    amountSats,
    memo,
    nwcUrlEncrypted,
    expiresAt: invoiceResult.expiresAt,
  });

  if (nwcUrl) {
    subscribeSubWalletInvoice(invoiceResult.paymentHash, nwcUrl).catch(() => {});
  }

  res.json({ pr: invoiceResult.bolt11, routes: [] });
});

export default router;
