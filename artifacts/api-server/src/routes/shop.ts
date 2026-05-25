import { Router, type IRouter } from "express";
import { createHmac, timingSafeEqual, randomUUID } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";

import multer from "multer";
import { db } from "@workspace/db";
import {
  accountsTable,
  cardDesignsTable,
  cardOrdersTable,
  pendingInvoicesTable,
  transactionsTable,
} from "@workspace/db";
import { eq, desc, and, gte, sql, lt } from "drizzle-orm";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { getBtcPrice } from "../lib/price";
import {
  PLAIN_WHITE_EUR_CENTS,
  BITPOS_BRANDED_EUR_CENTS,
  CUSTOM_UPLOAD_EUR_CENTS,
  getShippingEurCents,
  eurCentsToSats,
} from "../lib/shopPricing";
import { getOrder, uploadFile, isConfigured } from "../lib/printags";
import { submitOrderToPrintags } from "../lib/shopOrderAutoSettle";
import { makeInvoice } from "../lib/nwc";
import { subscribeSubWalletInvoice } from "../lib/invoiceMonitor";
import { encrypt, decrypt } from "../lib/encrypt";
import { logger } from "../lib/logger";
import type { CardOrder } from "@workspace/db";

function shortId(uuid: string): string {
  const hex = uuid.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

const router: IRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/jpg"];
    cb(null, allowed.includes(file.mimetype));
  },
});

const WEBHOOK_SECRET = process.env.PRINTAGS_WEBHOOK_SECRET;

const STATUS_ORDER = [
  "awaiting_payment",
  "pending",
  "confirmed",
  "printing",
  "shipped",
  "delivered",
  "cancelled",
];

// Maps Printags-native status strings to our internal status values.
// Printags sends: created, processing, in_production, printing, shipped, delivered, cancelled
const PRINTAGS_STATUS_MAP: Record<string, string> = {
  created:       "confirmed",   // Printags accepted the order
  processing:    "confirmed",
  in_production: "printing",
  in_printing:   "printing",
  printing:      "printing",
  shipped:       "shipped",
  delivered:     "delivered",
  cancelled:     "cancelled",
  canceled:      "cancelled",   // American spelling variant
};

function normalizeStatus(raw: string): string {
  if (!raw) return "confirmed";
  const lower = raw.toLowerCase().trim();
  // If Printags sends a status we already use natively, pass it through
  if (STATUS_ORDER.includes(lower)) return lower;
  // Otherwise map via the Printags-specific table
  return PRINTAGS_STATUS_MAP[lower] ?? "confirmed";
}

/** Narrow Express param (which may be string | string[]) to a plain string. */
function paramStr(v: string | string[]): string {
  return Array.isArray(v) ? v[0]! : v;
}

type RequestWithRawBody = import("express").Request & { rawBody?: string };

function verifyWebhookSignature(req: RequestWithRawBody): boolean {
  if (!WEBHOOK_SECRET) return true; // dev mode: no secret configured

  const signature = req.headers["x-printags-signature"] as string | undefined;
  if (!signature) return false;

  // Use the raw request bytes captured by express.json verify callback - not re-serialized JSON
  const body = req.rawBody ?? JSON.stringify(req.body);
  const expected = "sha256=" + createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");

  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function seedDefaultDesigns() {
  // bitPOS branded — cheapest (sort 0, shown first)
  await db
    .insert(cardDesignsTable)
    .values({
      id: "bitpos-branded",
      name: "bitPOS Branded",
      description:
        "Official bitPOS card with branded artwork. The cheapest option — spread the sats revolution.",
      priceEurCents: BITPOS_BRANDED_EUR_CENTS,
      previewUrl: "/bitpos-branded-card.png",
      active: true,
      sortOrder: 0,
    })
    .onConflictDoUpdate({
      target: cardDesignsTable.id,
      set: { priceEurCents: BITPOS_BRANDED_EUR_CENTS, previewUrl: "/bitpos-branded-card.png", sortOrder: 0 },
    });

  // Plain white — more expensive (sort 1, shown after branded)
  await db
    .insert(cardDesignsTable)
    .values({
      id: "plain-white",
      name: "Plain White",
      description: "A clean blank NTAG424 card ready to program with your Bolt Card keys.",
      priceEurCents: PLAIN_WHITE_EUR_CENTS,
      active: true,
      sortOrder: 1,
    })
    .onConflictDoUpdate({
      target: cardDesignsTable.id,
      set: { priceEurCents: PLAIN_WHITE_EUR_CENTS, sortOrder: 1 },
    });

  // Auto-upload branded artwork to Printags if not yet uploaded
  const [branded] = await db
    .select({ printafsFileId: cardDesignsTable.printafsFileId })
    .from(cardDesignsTable)
    .where(eq(cardDesignsTable.id, "bitpos-branded"));

  if (branded && !branded.printafsFileId) {
    try {
      const assetPath = join(__dirname, "../assets/bitpos-branded-front.png");
      const buffer = readFileSync(assetPath);
      const { fileId } = await uploadFile(buffer, "bitpos-branded-front.png", "image/png");
      await db
        .update(cardDesignsTable)
        .set({ printafsFileId: fileId })
        .where(eq(cardDesignsTable.id, "bitpos-branded"));
      logger.info({ fileId }, "Branded card artwork uploaded to Printags and stored");
    } catch (err) {
      logger.warn({ err }, "Could not auto-upload branded artwork to Printags — will retry on next restart");
    }
  }

  logger.info("Default card designs seeded/synced");
}

// Seed on startup (non-blocking)
seedDefaultDesigns().catch((err) => logger.error({ err }, "Failed to seed card designs"));

// Printags does not issue a webhook signing secret, so PRINTAGS_WEBHOOK_SECRET is intentionally
// unset. The webhook handler accepts all incoming events without signature verification.
// If Printags adds secret support in the future, set PRINTAGS_WEBHOOK_SECRET to enable it.
logger.info("Printags webhook endpoint ready at POST /api/shop/webhook (no secret verification — Printags does not issue webhook secrets)");

// ── GET /api/shop/designs ──────────────────────────────────────────────────────
router.get("/shop/designs", async (_req, res): Promise<void> => {
  const designs = await db
    .select()
    .from(cardDesignsTable)
    .where(eq(cardDesignsTable.active, true))
    .orderBy(cardDesignsTable.sortOrder);
  res.json(designs);
});

// ── POST /api/shop/upload ──────────────────────────────────────────────────────
router.post(
  "/shop/upload",
  requireAuth,
  upload.single("file"),
  async (req, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "No file provided. Please upload a PNG or JPG image." });
      return;
    }
    if (!["image/png", "image/jpeg", "image/jpg"].includes(req.file.mimetype)) {
      res.status(400).json({ error: "Only PNG and JPG files are accepted. PDF, BMP, GIF, and TIFF are not supported." });
      return;
    }
    if (!isConfigured()) {
      res.status(503).json({ error: "Custom card uploads are not available — print service is not configured." });
      return;
    }
    try {
      const { fileId } = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype);
      logger.info({ fileId, size: req.file.size, accountId: req.auth?.accountId }, "Custom card artwork uploaded to Printags");
      res.json({ fileId });
    } catch (err) {
      logger.error({ err }, "Failed to upload artwork to Printags");
      res.status(502).json({ error: "Could not upload artwork to the print service. Please try again." });
    }
  },
);

// ── GET /api/shop/quote ────────────────────────────────────────────────────────
// Accepts both authenticated (bitpos.app users) and unauthenticated callers
// (OSS self-hosted instances using X-BitPOS-Instance proxy auth).
// Unauthenticated callers receive userBalanceSats: 0 / shortfallSats: totalSats.
router.get("/shop/quote", optionalAuth, async (req, res): Promise<void> => {
  const country = typeof req.query.country === "string" ? req.query.country.toUpperCase() : "US";
  const hasCustomFile = req.query.hasCustomFile === "true";
  const designId = typeof req.query.designId === "string" ? req.query.designId : null;
  const quantity = Math.min(10, Math.max(1, parseInt(typeof req.query.quantity === "string" ? req.query.quantity : "1", 10) || 1));

  let baseEurCents = PLAIN_WHITE_EUR_CENTS;
  if (hasCustomFile) {
    baseEurCents = CUSTOM_UPLOAD_EUR_CENTS;
  } else if (designId) {
    const [design] = await db
      .select({ priceEurCents: cardDesignsTable.priceEurCents })
      .from(cardDesignsTable)
      .where(eq(cardDesignsTable.id, designId));
    if (design) baseEurCents = design.priceEurCents;
  }

  const shippingEurCents = getShippingEurCents(country, quantity);
  const shippingEurCentsPerUnit = Math.round(shippingEurCents / quantity);
  const totalEurCents = baseEurCents * quantity + shippingEurCents;

  const price = await getBtcPrice();
  const totalSats = eurCentsToSats(totalEurCents, price.eur);

  let userBalanceSats = 0;
  if (req.auth?.accountId) {
    const [account] = await db
      .select({ balanceSats: accountsTable.balanceSats })
      .from(accountsTable)
      .where(eq(accountsTable.id, req.auth.accountId));
    userBalanceSats = account?.balanceSats ?? 0;
  }

  const shortfallSats = Math.max(0, totalSats - userBalanceSats);

  res.json({
    quantity,
    cardEurCentsPerUnit: baseEurCents,
    shippingEurCentsPerUnit,
    baseEurCents: baseEurCents * quantity,
    shippingEurCents,
    totalEurCents,
    totalSats,
    btcEurRate: price.eur,
    btcUsdRate: price.usd,
    priceUpdatedAt: Date.now(),
    userBalanceSats,
    shortfallSats,
  });
});

// ── POST /api/shop/orders ──────────────────────────────────────────────────────
router.post("/shop/orders", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.auth!.accountId;
  const {
    designId,
    printFileId,
    printFileIdBack,
    shippingName,
    shippingEmail,
    shippingPhone,
    shippingAddress1,
    shippingAddress2,
    shippingCity,
    shippingPostalCode,
    shippingCountry,
  } = req.body;
  const quantity = Math.min(10, Math.max(1, parseInt(req.body.quantity ?? "1", 10) || 1));

  if (!shippingName || !shippingAddress1 || !shippingCity || !shippingPostalCode || !shippingCountry) {
    res.status(400).json({ error: "Missing required shipping fields" });
    return;
  }

  if (!shippingEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shippingEmail)) {
    res.status(400).json({ error: "A valid email address is required" });
    return;
  }

  let baseEurCents = PLAIN_WHITE_EUR_CENTS;
  if (printFileId) {
    baseEurCents = CUSTOM_UPLOAD_EUR_CENTS;
  } else if (designId) {
    const [design] = await db
      .select({ priceEurCents: cardDesignsTable.priceEurCents })
      .from(cardDesignsTable)
      .where(and(eq(cardDesignsTable.id, designId), eq(cardDesignsTable.active, true)));
    if (!design) {
      res.status(404).json({ error: "Design not found" });
      return;
    }
    baseEurCents = design.priceEurCents;
  }

  const shippingEurCents = getShippingEurCents(shippingCountry, quantity);
  const totalEurCents = baseEurCents * quantity + shippingEurCents;

  const price = await getBtcPrice();
  const amountSats = eurCentsToSats(totalEurCents, price.eur);

  const [account] = await db
    .select({ balanceSats: accountsTable.balanceSats, albySubWalletNwcUrl: accountsTable.albySubWalletNwcUrl })
    .from(accountsTable)
    .where(eq(accountsTable.id, accountId));

  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  // ── Path A: Sufficient balance ─────────────────────────────────────────────
  if (account.balanceSats >= amountSats) {
    // Step 1: Deduct balance + create pending order in a single transaction
    const order = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(accountsTable)
        .set({ balanceSats: sql`${accountsTable.balanceSats} - ${amountSats}` })
        .where(
          and(
            eq(accountsTable.id, accountId),
            gte(accountsTable.balanceSats, amountSats),
          ),
        )
        .returning({ balanceSats: accountsTable.balanceSats });

      if (!updated) return null;

      await tx.insert(transactionsTable).values({
        accountId,
        direction: "out",
        amountSats,
        feeSats: 0,
        type: "internal_send",
        memo: "Card shop order",
        status: "completed",
      });

      const [o] = await tx
        .insert(cardOrdersTable)
        .values({
          accountId,
          designId: designId ?? null,
          printFileId: printFileId ?? null,
          printFileIdBack: printFileIdBack ?? null,
          status: "pending",
          quantity,
          shippingName,
          shippingEmail: shippingEmail ?? null,
          shippingPhone: shippingPhone ?? null,
          shippingAddress1,
          shippingAddress2: shippingAddress2 ?? null,
          shippingCity,
          shippingPostalCode,
          shippingCountry,
          amountSats,
        })
        .returning();

      return o;
    });

    if (!order) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }

    await db
      .update(cardOrdersTable)
      .set({ status: "confirmed" })
      .where(eq(cardOrdersTable.id, order.id));

    submitOrderToPrintags(order).catch(() => { /* errors logged inside */ });

    res.status(201).json({ orderId: order.id, paid: true, status: "confirmed" });
    return;
  }

  // ── Path B: Insufficient balance - issue invoice for shortfall ─────────────
  const shortfallSats = amountSats - account.balanceSats;
  let nwcUrl: string | undefined;
  if (account.albySubWalletNwcUrl) {
    try {
      nwcUrl = decrypt(account.albySubWalletNwcUrl);
    } catch { /* ignore */ }
  }

  // Generate order ID upfront so the invoice memo can reference it.
  // Create invoice FIRST - no DB writes yet, so a failure here leaves no orphaned order.
  const orderId = randomUUID();
  const invoiceResult = await makeInvoice(
    shortfallSats,
    `bitPOS Card Shop - ${shortId(orderId)}`,
    3600,
    nwcUrl,
  );

  // Atomically insert order + pending invoice and link them in one transaction
  const { order, pendingInvoice } = await db.transaction(async (tx) => {
    const [o] = await tx
      .insert(cardOrdersTable)
      .values({
        id: orderId,
        accountId,
        designId: designId ?? null,
        printFileId: printFileId ?? null,
        printFileIdBack: printFileIdBack ?? null,
        status: "awaiting_payment",
        quantity,
        shippingName,
        shippingEmail: shippingEmail ?? null,
        shippingPhone: shippingPhone ?? null,
        shippingAddress1,
        shippingAddress2: shippingAddress2 ?? null,
        shippingCity,
        shippingPostalCode,
        shippingCountry,
        amountSats,
      })
      .returning();

    const [pi] = await tx
      .insert(pendingInvoicesTable)
      .values({
        accountId,
        bolt11: invoiceResult.bolt11,
        paymentHash: invoiceResult.paymentHash,
        amountSats: shortfallSats,
        memo: `bitPOS Card Shop - ${shortId(orderId)}`,
        nwcUrlEncrypted: nwcUrl ? encrypt(nwcUrl) : null,
        cardOrderId: orderId,
        expiresAt: invoiceResult.expiresAt,
      })
      .returning();

    await tx
      .update(cardOrdersTable)
      .set({ pendingInvoiceId: pi.id })
      .where(eq(cardOrdersTable.id, orderId));

    return { order: o, pendingInvoice: pi };
  });

  // Subscribe for instant push notification if using a sub-wallet
  if (nwcUrl) {
    subscribeSubWalletInvoice(pendingInvoice.paymentHash, nwcUrl).catch((err) =>
      logger.warn({ err, orderId: order.id }, "Sub-wallet subscription failed - cron fallback active"),
    );
  }

  res.status(201).json({
    orderId: order.id,
    paid: false,
    status: order.status,
    invoice: {
      bolt11: invoiceResult.bolt11,
      paymentHash: invoiceResult.paymentHash,
      amountSats: shortfallSats,
      totalSats: amountSats,
      userBalanceSats: account.balanceSats,
      expiresAt: invoiceResult.expiresAt,
    },
  });
});

// ── POST /api/shop/orders/:id/pay ──────────────────────────────────────────────
// Called by the frontend after the user tops up their balance via Lightning invoice.
router.post("/shop/orders/:id/pay", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.auth!.accountId;
  const orderId = paramStr(req.params.id);

  const [order] = await db
    .select()
    .from(cardOrdersTable)
    .where(and(eq(cardOrdersTable.id, orderId), eq(cardOrdersTable.accountId, accountId)));

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  if (order.status !== "awaiting_payment") {
    // Idempotent: already paid
    if (["pending", "confirmed", "printing", "shipped", "delivered"].includes(order.status)) {
      res.json({ orderId, paid: true, status: order.status });
      return;
    }
    res.status(400).json({ error: `Order cannot be paid (status: ${order.status})` });
    return;
  }

  // Step 1: Deduct balance atomically
  const result = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(accountsTable)
      .set({ balanceSats: sql`${accountsTable.balanceSats} - ${order.amountSats}` })
      .where(
        and(
          eq(accountsTable.id, accountId),
          gte(accountsTable.balanceSats, order.amountSats),
        ),
      )
      .returning({ balanceSats: accountsTable.balanceSats });

    if (!updated) return null;

    await tx.insert(transactionsTable).values({
      accountId,
      direction: "out",
      amountSats: order.amountSats,
      feeSats: 0,
      type: "internal_send",
      memo: "Card shop order",
      status: "completed",
    });

    const [updatedOrder] = await tx
      .update(cardOrdersTable)
      .set({ status: "pending" })
      .where(eq(cardOrdersTable.id, orderId))
      .returning();

    return updatedOrder;
  });

  if (!result) {
    const [acc] = await db
      .select({ balanceSats: accountsTable.balanceSats })
      .from(accountsTable)
      .where(eq(accountsTable.id, accountId));
    res.status(400).json({
      error: "Insufficient balance",
      userBalanceSats: acc?.balanceSats ?? 0,
      amountSats: order.amountSats,
    });
    return;
  }

  await db
    .update(cardOrdersTable)
    .set({ status: "confirmed" })
    .where(eq(cardOrdersTable.id, orderId));

  submitOrderToPrintags(result).catch(() => { /* errors logged inside */ });

  res.json({ orderId, paid: true, status: "confirmed" });
});

// ── GET /api/shop/orders ───────────────────────────────────────────────────────
router.get("/shop/orders", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.auth!.accountId;

  const orders = await db
    .select()
    .from(cardOrdersTable)
    .where(eq(cardOrdersTable.accountId, accountId))
    .orderBy(desc(cardOrdersTable.createdAt));

  res.json(orders);
});

// ── GET /api/shop/orders/:id ───────────────────────────────────────────────────
router.get("/shop/orders/:id", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.auth!.accountId;
  const orderId = paramStr(req.params.id);

  const [order] = await db
    .select()
    .from(cardOrdersTable)
    .where(and(eq(cardOrdersTable.id, orderId), eq(cardOrdersTable.accountId, accountId)));

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  // Enrich with live printags status if available
  if (order.printOrderId) {
    try {
      const live = await getOrder(order.printOrderId);
      const liveStatus = normalizeStatus(live.status);
      const trackingChanged = live.trackingNumber && live.trackingNumber !== order.trackingNumber;
      if (liveStatus !== order.status || trackingChanged) {
        if (live.trackingNumber) {
          await db.update(cardOrdersTable)
            .set({ status: liveStatus, trackingNumber: live.trackingNumber })
            .where(eq(cardOrdersTable.id, orderId));
          res.json({ ...order, status: liveStatus, trackingNumber: live.trackingNumber });
        } else {
          await db.update(cardOrdersTable)
            .set({ status: liveStatus })
            .where(eq(cardOrdersTable.id, orderId));
          res.json({ ...order, status: liveStatus });
        }
        return;
      }
    } catch { /* use DB state */ }
  }

  // For awaiting_payment orders, include the invoice bolt11 so frontend can show payment UI
  if (order.status === "awaiting_payment" && order.pendingInvoiceId) {
    const [inv] = await db
      .select({ bolt11: pendingInvoicesTable.bolt11, amountSats: pendingInvoicesTable.amountSats, expiresAt: pendingInvoicesTable.expiresAt })
      .from(pendingInvoicesTable)
      .where(eq(pendingInvoicesTable.id, order.pendingInvoiceId));
    if (inv) {
      res.json({ ...order, invoice: inv });
      return;
    }
  }

  res.json(order);
});

// ── POST /api/shop/orders/:id/cancel ──────────────────────────────────────────
router.post("/shop/orders/:id/cancel", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.auth!.accountId;
  const orderId = paramStr(req.params.id);

  const [order] = await db
    .select()
    .from(cardOrdersTable)
    .where(and(eq(cardOrdersTable.id, orderId), eq(cardOrdersTable.accountId, accountId)));

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  if (order.status !== "awaiting_payment") {
    res.status(400).json({ error: `Cannot cancel order in status: ${order.status}` });
    return;
  }

  await db
    .update(cardOrdersTable)
    .set({ status: "cancelled" })
    .where(eq(cardOrdersTable.id, orderId));

  res.json({ orderId, cancelled: true });
});

// ── POST /api/shop/webhook ─────────────────────────────────────────────────────
// Printags does not issue webhook signing secrets, so all incoming events are accepted.
// HMAC verification is available if PRINTAGS_WEBHOOK_SECRET is ever set in future.
router.post("/shop/webhook", async (req: RequestWithRawBody, res): Promise<void> => {
  // Always acknowledge immediately so Printags doesn't retry while we process
  res.json({ ok: true });

  if (!verifyWebhookSignature(req)) {
    logger.warn({ headers: req.headers }, "Printags webhook signature verification failed — ignoring event");
    return;
  }

  const raw = req.body as Record<string, unknown>;

  // Log the complete payload so we can see exactly what Printags sends for real orders
  logger.info({ webhookPayload: raw }, "Printags webhook received — full payload");

  // Printags may nest the order under data/order, or send fields at root level.
  // We try each nesting to find the fields we need.
  const nested = (raw?.data ?? raw?.order ?? {}) as Record<string, unknown>;

  const orderId: string | undefined = (
    (nested?.id as string | undefined) ??
    (nested?.orderId as string | undefined) ??
    (raw?.orderId as string | undefined) ??
    (raw?.id as string | undefined)
  );

  const rawStatus: string | undefined = (
    (nested?.status as string | undefined) ??
    (raw?.status as string | undefined)
  );

  const trackingNumber: string | undefined = (
    (nested?.trackingNumber as string | undefined) ??
    (nested?.trackingCode as string | undefined) ??
    (nested?.tracking_number as string | undefined) ??
    (raw?.trackingNumber as string | undefined) ??
    (raw?.trackingCode as string | undefined)
  );

  const eventType: string = (raw?.event ?? raw?.type ?? raw?.eventType ?? "unknown") as string;

  if (!orderId || !rawStatus) {
    logger.warn(
      { eventType, orderId, rawStatus, webhookPayload: raw },
      "Printags webhook missing orderId or status — cannot update order. Check payload shape above.",
    );
    return;
  }

  const normalizedStatus = normalizeStatus(rawStatus);

  logger.info(
    { eventType, printOrderId: orderId, rawStatus, normalizedStatus, trackingNumber },
    "Printags webhook — updating order status",
  );

  const result = trackingNumber
    ? await db
        .update(cardOrdersTable)
        .set({ status: normalizedStatus, trackingNumber })
        .where(eq(cardOrdersTable.printOrderId, orderId))
        .returning({ id: cardOrdersTable.id, status: cardOrdersTable.status })
    : await db
        .update(cardOrdersTable)
        .set({ status: normalizedStatus })
        .where(eq(cardOrdersTable.printOrderId, orderId))
        .returning({ id: cardOrdersTable.id, status: cardOrdersTable.status });

  if (result.length === 0) {
    logger.warn(
      { eventType, printOrderId: orderId, normalizedStatus },
      "Printags webhook: no matching order found for printOrderId — order may not have been submitted yet",
    );
  } else {
    logger.info(
      { eventType, printOrderId: orderId, internalOrderId: result[0]?.id, normalizedStatus, trackingNumber },
      "Printags webhook processed — order status updated",
    );
  }
});

export default router;
