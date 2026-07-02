import { Router, type IRouter } from "express";
import { createHmac, timingSafeEqual, randomUUID } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";

import multer from "multer";
import { db } from "@workspace/db";
import {
  accountsTable,
  entitiesTable,
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
  eurCentsToSats,
} from "../lib/shopPricing";
import { getOrder, uploadFile, getFile, isConfigured, getShippingRates } from "../lib/printags";
import { applyPrintagsStatus } from "../lib/printagsStatus";
import { submitOrderToPrintags, creditDesignRoyalty } from "../lib/shopOrderAutoSettle";
import { forwardCardRevenue } from "../lib/shopRevenue";
import { makeInvoice, lookupInvoice, getAccountNwcUrl } from "../lib/nwc";
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

// ── Shipping PII encryption helpers ──────────────────────────────────────────
// Personally-identifiable shipping fields (name, email, address…) are encrypted
// at rest using the same AES key used for card keys.  Only the country field is
// left in plaintext because it is needed for pricing/shipping-rate lookups.
// The try/catch in decryptField provides a soft migration path for any rows
// inserted before this change was deployed.

function encryptField(value: string): string {
  return encrypt(value);
}

function decryptField(value: string | null | undefined): string | null {
  if (value == null) return null;
  try {
    return decrypt(value);
  } catch {
    return value; // graceful fallback for pre-encryption rows
  }
}

type ShippingFields = {
  shippingName: string;
  shippingEmail: string | null;
  shippingPhone: string | null;
  shippingAddress1: string;
  shippingAddress2: string | null;
  shippingCity: string;
  shippingPostalCode: string;
  shippingCountry: string;
};

function encryptShippingFields(f: ShippingFields): ShippingFields {
  return {
    shippingName:     encryptField(f.shippingName),
    shippingEmail:    f.shippingEmail    != null ? encryptField(f.shippingEmail)    : null,
    shippingPhone:    f.shippingPhone    != null ? encryptField(f.shippingPhone)    : null,
    shippingAddress1: encryptField(f.shippingAddress1),
    shippingAddress2: f.shippingAddress2 != null ? encryptField(f.shippingAddress2) : null,
    shippingCity:     encryptField(f.shippingCity),
    shippingPostalCode: encryptField(f.shippingPostalCode),
    shippingCountry:  encryptField(f.shippingCountry),
  };
}

export function decryptOrderShipping<T extends ShippingFields>(order: T): T {
  return {
    ...order,
    shippingName:       decryptField(order.shippingName)       ?? order.shippingName,
    shippingEmail:      decryptField(order.shippingEmail),
    shippingPhone:      decryptField(order.shippingPhone),
    shippingAddress1:   decryptField(order.shippingAddress1)   ?? order.shippingAddress1,
    shippingAddress2:   decryptField(order.shippingAddress2),
    shippingCity:       decryptField(order.shippingCity)       ?? order.shippingCity,
    shippingPostalCode: decryptField(order.shippingPostalCode) ?? order.shippingPostalCode,
    shippingCountry:    decryptField(order.shippingCountry)    ?? order.shippingCountry,
  };
}

// Printags status mapping + forward-only update logic lives in ../lib/printagsStatus
// so the webhook, the page-load enrich, and the background poller all share it.

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
  // bitPOS branded - cheapest (sort 0, shown first)
  await db
    .insert(cardDesignsTable)
    .values({
      id: "bitpos-branded",
      name: "bitPOS Branded",
      description:
        "Official bitPOS card with branded artwork. The cheapest option - spread the sats revolution.",
      priceEurCents: BITPOS_BRANDED_EUR_CENTS,
      previewUrl: "/bitpos-branded-front.png",
      active: true,
      sortOrder: 0,
    })
    .onConflictDoUpdate({
      target: cardDesignsTable.id,
      set: { priceEurCents: BITPOS_BRANDED_EUR_CENTS, previewUrl: "/bitpos-branded-front.png", sortOrder: 0 },
    });

  // Plain white - more expensive (sort 1, shown after branded)
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
      logger.warn({ err }, "Could not auto-upload branded artwork to Printags - will retry on next restart");
    }
  }

  logger.info("Default card designs seeded/synced");
}

// Seed on startup (non-blocking)
seedDefaultDesigns().catch((err) => logger.error({ err }, "Failed to seed card designs"));

// Printags does not issue a webhook signing secret, so PRINTAGS_WEBHOOK_SECRET is intentionally
// unset. The webhook handler accepts all incoming events without signature verification.
// If Printags adds secret support in the future, set PRINTAGS_WEBHOOK_SECRET to enable it.
logger.info("Printags webhook endpoint ready at POST /api/shop/webhook (no secret verification - Printags does not issue webhook secrets)");

// ── GET /api/shop/designs ──────────────────────────────────────────────────────
router.get("/shop/designs", async (_req, res): Promise<void> => {
  const designs = await db
    .select({
      id: cardDesignsTable.id,
      name: cardDesignsTable.name,
      description: cardDesignsTable.description,
      artist: cardDesignsTable.artist,
      printafsFileId: cardDesignsTable.printafsFileId,
      printafsFileIdBack: cardDesignsTable.printafsFileIdBack,
      previewUrl: cardDesignsTable.previewUrl,
      priceEurCents: cardDesignsTable.priceEurCents,
      active: cardDesignsTable.active,
      sortOrder: cardDesignsTable.sortOrder,
      isCommunity: cardDesignsTable.isCommunity,
      moderationStatus: cardDesignsTable.moderationStatus,
      royaltySatsPerUnit: cardDesignsTable.royaltySatsPerUnit,
      createdAt: cardDesignsTable.createdAt,
      submitterHandle: entitiesTable.handle,
    })
    .from(cardDesignsTable)
    .leftJoin(accountsTable, eq(cardDesignsTable.submittedByAccountId, accountsTable.id))
    .leftJoin(entitiesTable, eq(accountsTable.entityId, entitiesTable.id))
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
      res.status(503).json({ error: "Custom card uploads are not available - print service is not configured." });
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

// ── GitHub helpers for design moderation ─────────────────────────────────────

const GITHUB_REPO = "bitPOS-app/bitpos";

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Constant-time comparison of a provided admin secret against ADMIN_SECRET.
// Returns false when ADMIN_SECRET is unset so admin actions fail closed.
function verifyAdminSecret(provided: string): boolean {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) return false;
  const mac = (s: string) => createHmac("sha256", "bitpos-mod").update(s).digest();
  return timingSafeEqual(mac(provided), mac(adminSecret));
}

function githubModHeaders(): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ["User-\x41gent"]: "bitPOS-moderation/1.0",
    Authorization: `Bearer ${process.env.GITHUB_WORKFLOW_TOKEN ?? ""}`,
  };
}

async function openModerationIssue(opts: {
  designId: string;
  designName: string;
  submitterHandle: string;
  previewUrl: string;
  baseUrl: string;
}): Promise<number | null> {
  if (!process.env.GITHUB_WORKFLOW_TOKEN) return null;
  const { designId, designName, submitterHandle, previewUrl, baseUrl } = opts;
  const approveUrl = `${baseUrl}/api/shop/designs/${encodeURIComponent(designId)}/approve?secret=${encodeURIComponent(process.env.ADMIN_SECRET ?? "")}`;
  const rejectUrl  = `${baseUrl}/api/shop/designs/${encodeURIComponent(designId)}/reject?secret=${encodeURIComponent(process.env.ADMIN_SECRET ?? "")}`;

  let body = `**Design name:** ${designName}\n**Submitted by:** @${submitterHandle}\n**Design ID:** \`${designId}\`\n\n`;
  if (previewUrl.startsWith("data:image/")) {
    body += `![Preview](${previewUrl})\n\n`;
  }
  body += `---\n[Approve](${approveUrl}) | [Reject](${rejectUrl})`;

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
      method: "POST",
      headers: { ...githubModHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `[Design Review] ${designName} by @${submitterHandle}`,
        body,
        labels: ["design-review"],
      }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "Failed to open GitHub moderation issue");
      return null;
    }
    const json = (await res.json()) as { number: number };
    return json.number ?? null;
  } catch (err) {
    logger.warn({ err }, "Error opening GitHub moderation issue");
    return null;
  }
}

async function closeModerationIssue(issueNumber: number, comment: string): Promise<void> {
  if (!process.env.GITHUB_WORKFLOW_TOKEN) return;
  try {
    await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues/${issueNumber}/comments`, {
      method: "POST",
      headers: { ...githubModHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ body: comment }),
    });
    await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues/${issueNumber}`, {
      method: "PATCH",
      headers: { ...githubModHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ state: "closed" }),
    });
  } catch (err) {
    logger.warn({ err, issueNumber }, "Error closing GitHub moderation issue");
  }
}

// ── POST /api/shop/designs/publish ────────────────────────────────────────────
// Submits a user-uploaded custom artwork as a community design for moderation.
// The design starts hidden (active=false, moderation_status=pending) and only
// becomes visible after admin approval via GET /api/shop/designs/:id/approve.
// A GitHub issue is opened for the admin to review.
router.post("/shop/designs/publish", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.auth!.accountId;
  const { frontFileId, backFileId, name, previewDataUrl, royaltySatsPerUnit, stickerIds } = req.body as {
    frontFileId?: string;
    backFileId?: string;
    name?: string;
    previewDataUrl?: string;
    royaltySatsPerUnit?: number;
    stickerIds?: unknown;
  };

  if (!frontFileId || typeof frontFileId !== "string" || !frontFileId.trim()) {
    res.status(400).json({ error: "frontFileId is required" });
    return;
  }

  const designName =
    typeof name === "string" && name.trim() ? name.trim().slice(0, 60) : "Community Design";

  const preview =
    typeof previewDataUrl === "string" &&
    previewDataUrl.startsWith("data:image/") &&
    previewDataUrl.length <= 2_000_000
      ? previewDataUrl
      : "";

  const id = `community-${randomUUID()}`;

  // Look up submitter handle for the GitHub issue
  const [submitterRow] = await db
    .select({ handle: entitiesTable.handle })
    .from(accountsTable)
    .leftJoin(entitiesTable, eq(accountsTable.entityId, entitiesTable.id))
    .where(eq(accountsTable.id, accountId));
  const submitterHandle = submitterRow?.handle ?? "unknown";

  const clampedRoyalty =
    typeof royaltySatsPerUnit === "number" && Number.isFinite(royaltySatsPerUnit)
      ? Math.max(0, Math.round(royaltySatsPerUnit))
      : 0;

  const validStickerIds =
    Array.isArray(stickerIds) && stickerIds.every((s) => typeof s === "string")
      ? (stickerIds as string[]).slice(0, 20)
      : [];

  await db.insert(cardDesignsTable).values({
    id,
    name: designName,
    printafsFileId: frontFileId.trim(),
    printafsFileIdBack:
      typeof backFileId === "string" && backFileId.trim() ? backFileId.trim() : null,
    previewUrl: preview,
    priceEurCents: CUSTOM_UPLOAD_EUR_CENTS,
    active: false,
    sortOrder: 100,
    submittedByAccountId: accountId,
    isCommunity: true,
    moderationStatus: "pending",
    royaltySatsPerUnit: clampedRoyalty,
    usedStickerIds: validStickerIds.length > 0 ? JSON.stringify(validStickerIds) : null,
  });

  // Fire-and-forget: open a GitHub issue for admin review
  const baseUrl = process.env.APP_BASE_URL ?? "https://bitpos.app";
  openModerationIssue({ designId: id, designName, submitterHandle, previewUrl: preview, baseUrl })
    .then(async (issueNumber) => {
      if (issueNumber != null) {
        await db
          .update(cardDesignsTable)
          .set({ githubIssueNumber: issueNumber })
          .where(eq(cardDesignsTable.id, id));
        logger.info({ id, issueNumber }, "GitHub moderation issue opened for community design");
      }
    })
    .catch(() => {});

  logger.info({ id, accountId, designName }, "Community design submitted for moderation");
  res.json({ designId: id });
});

// ── GET /api/shop/designs/:id/approve ─────────────────────────────────────────
// Admin-only: approves a community design, making it visible in the shop.
// Protected by ADMIN_SECRET env var passed as ?secret= query param.
// Returns a plain HTML confirmation so it works as a one-click link in email.
router.get("/shop/designs/:id/approve", async (req, res): Promise<void> => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    res.status(503).send("<h2>Admin moderation not configured (ADMIN_SECRET not set).</h2>");
    return;
  }
  const provided = typeof req.query.secret === "string" ? req.query.secret : "";
  const mac = (s: string) => createHmac("sha256", "bitpos-mod").update(s).digest();
  if (!timingSafeEqual(mac(provided), mac(adminSecret))) {
    res.status(403).send("<h2>Invalid secret.</h2>");
    return;
  }

  const designId = req.params.id;
  const [design] = await db
    .select({ id: cardDesignsTable.id, name: cardDesignsTable.name, githubIssueNumber: cardDesignsTable.githubIssueNumber, moderationStatus: cardDesignsTable.moderationStatus })
    .from(cardDesignsTable)
    .where(eq(cardDesignsTable.id, designId));

  if (!design) {
    res.status(404).send("<h2>Design not found.</h2>");
    return;
  }
  if (design.moderationStatus === "approved") {
    res.send(`<h2>Design &ldquo;${escHtml(design.name)}&rdquo; is already approved and live in the shop.</h2>`);
    return;
  }

  await db
    .update(cardDesignsTable)
    .set({ active: true, moderationStatus: "approved" })
    .where(eq(cardDesignsTable.id, designId));

  logger.info({ designId, name: design.name }, "Community design approved by admin");

  if (design.githubIssueNumber) {
    closeModerationIssue(design.githubIssueNumber, `Approved. Design "${design.name}" is now live in the shop.`).catch(() => {});
  }

  res.send(`<h2>Approved!</h2><p>Design &ldquo;${escHtml(design.name)}&rdquo; is now live in the shop.</p>`);
});

// ── GET /api/shop/designs/:id/reject ──────────────────────────────────────────
// Admin-only: rejects a community design, keeping it hidden.
// Optional ?reason= query param is included in the GitHub issue comment.
router.get("/shop/designs/:id/reject", async (req, res): Promise<void> => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    res.status(503).send("<h2>Admin moderation not configured (ADMIN_SECRET not set).</h2>");
    return;
  }
  const provided = typeof req.query.secret === "string" ? req.query.secret : "";
  const mac = (s: string) => createHmac("sha256", "bitpos-mod").update(s).digest();
  if (!timingSafeEqual(mac(provided), mac(adminSecret))) {
    res.status(403).send("<h2>Invalid secret.</h2>");
    return;
  }

  const designId = req.params.id;
  const reason = typeof req.query.reason === "string" && req.query.reason.trim()
    ? req.query.reason.trim()
    : null;

  const [design] = await db
    .select({ id: cardDesignsTable.id, name: cardDesignsTable.name, githubIssueNumber: cardDesignsTable.githubIssueNumber, moderationStatus: cardDesignsTable.moderationStatus })
    .from(cardDesignsTable)
    .where(eq(cardDesignsTable.id, designId));

  if (!design) {
    res.status(404).send("<h2>Design not found.</h2>");
    return;
  }
  if (design.moderationStatus === "rejected") {
    res.send(`<h2>Design &ldquo;${escHtml(design.name)}&rdquo; was already rejected.</h2>`);
    return;
  }

  await db
    .update(cardDesignsTable)
    .set({ active: false, moderationStatus: "rejected" })
    .where(eq(cardDesignsTable.id, designId));

  logger.info({ designId, name: design.name, reason }, "Community design rejected by admin");

  if (design.githubIssueNumber) {
    const comment = reason
      ? `Rejected. Reason: ${reason}`
      : "Rejected. Design will not appear in the shop.";
    closeModerationIssue(design.githubIssueNumber, comment).catch(() => {});
  }

  res.send(`<h2>Rejected.</h2><p>Design &ldquo;${escHtml(design.name)}&rdquo; will not appear in the shop.${reason ? ` Reason: ${escHtml(reason)}` : ""}</p>`);
});

// ── GET /api/admin/designs/upload ─────────────────────────────────────────────
// Admin-only: shows a password entry form. Secret is never passed in the URL
// to avoid proxy mangling of special characters.
router.get("/admin/designs/upload", (_req, res): void => {
  res.send(adminLoginForm());
});

// ── POST /api/admin/designs/upload ────────────────────────────────────────────
// Admin-only: accepts multipart form data, uploads artwork to Printags, and
// inserts the design row immediately as approved+active.
router.post(
  "/admin/designs/upload",
  upload.fields([{ name: "front", maxCount: 1 }, { name: "back", maxCount: 1 }]),
  async (req, res): Promise<void> => {
    if (!process.env.ADMIN_SECRET) { res.status(503).send(adminPage("<h2>ADMIN_SECRET not set.</h2>")); return; }
    const provided = typeof req.body.secret === "string" ? req.body.secret : "";
    if (!verifyAdminSecret(provided)) {
      res.status(403).send(adminLoginForm("Invalid secret - please try again."));
      return;
    }

    // Stage 1: secret-only POST (login step) - return the upload form
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    if (!files?.front?.[0]) {
      // No front file means this is just the login step (or missing file on upload)
      const hasName = typeof req.body.name === "string" && req.body.name.trim();
      if (!hasName) {
        // Pure login step - return upload form
        res.send(adminUploadForm(provided));
        return;
      }
      // Had name but no file - actual validation error
      res.status(400).send(adminPage(`<h2>Front artwork file is required.</h2><p><a href="/api/admin/designs/upload">Back</a></p>`));
      return;
    }

    // Stage 2: full upload
    if (!isConfigured()) {
      res.status(503).send(adminPage("<h2>Printags not configured (PRINTAGS_SECRET_KEY / PRINTAGS_ACCOUNT_ID missing).</h2>"));
      return;
    }

    const frontFile = files.front[0];
    const backFile = files?.back?.[0];
    const designName = (typeof req.body.name === "string" ? req.body.name.trim() : "").slice(0, 60) || "Community Design";
    const artist = typeof req.body.artist === "string" ? req.body.artist.trim().slice(0, 60) : null;
    const rawRoyalty = parseInt(req.body.royaltySatsPerUnit ?? "0", 10);
    const royaltySatsPerUnit = Number.isFinite(rawRoyalty) ? Math.max(0, rawRoyalty) : 0;

    try {
      const { fileId: frontFileId } = await uploadFile(frontFile.buffer, frontFile.originalname, frontFile.mimetype);
      let backFileId: string | null = null;
      if (backFile) {
        const { fileId } = await uploadFile(backFile.buffer, backFile.originalname, backFile.mimetype);
        backFileId = fileId;
      }

      const id = `community-${randomUUID()}`;
      const previewUrl = `/api/shop/designs/${id}/artwork?v=1`;

      await db.insert(cardDesignsTable).values({
        id,
        name: designName,
        artist: artist || null,
        printafsFileId: frontFileId,
        printafsFileIdBack: backFileId,
        previewUrl,
        priceEurCents: CUSTOM_UPLOAD_EUR_CENTS,
        active: true,
        sortOrder: 100,
        isCommunity: true,
        moderationStatus: "approved",
        royaltySatsPerUnit,
      });

      logger.info({ id, designName, artist, royaltySatsPerUnit }, "Admin directly published community design");

      const backLink = backFileId
        ? `<p><a href="/api/shop/designs/${encodeURIComponent(id)}/artwork?side=back" target="_blank">Preview back artwork</a></p>`
        : "";
      res.send(adminPage(`
        <h2>Published!</h2>
        <p>Design <strong>&ldquo;${escHtml(designName)}&rdquo;</strong> is now live in the shop.</p>
        ${artist ? `<p>Artist: <strong>${escHtml(artist)}</strong></p>` : ""}
        <p>Royalty: <strong>${royaltySatsPerUnit} sats/card</strong></p>
        <p>Design ID: <code>${escHtml(id)}</code></p>
        <p><img src="/api/shop/designs/${encodeURIComponent(id)}/artwork" alt="Front artwork preview" style="max-width:320px;border-radius:12px;margin-top:8px;"></p>
        ${backLink}
        <p style="margin-top:24px">
          <form method="POST" action="/api/admin/designs/upload" enctype="multipart/form-data" style="display:inline">
            <input type="hidden" name="secret" value="${escHtml(provided)}">
            <button type="submit" style="background:none;border:none;color:#f5a623;cursor:pointer;padding:0;font-size:1rem;text-decoration:underline">Upload another design</button>
          </form>
        </p>
      `));
    } catch (err) {
      logger.error({ err, designName }, "Admin design upload failed");
      const msg = err instanceof Error ? escHtml(err.message) : "Unknown error";
      res.status(502).send(adminPage(`
        <h2>Upload failed</h2><p>${msg}</p>
        <form method="POST" action="/api/admin/designs/upload" enctype="multipart/form-data" style="margin-top:16px">
          <input type="hidden" name="secret" value="${escHtml(provided)}">
          <button type="submit" style="background:linear-gradient(160deg,#f7a93c,#d97318);border:none;border-radius:10px;color:#1a0e06;font-size:1rem;font-weight:700;padding:10px 20px;cursor:pointer">Back to upload form</button>
        </form>
      `));
    }
  },
);

// Loads every card design (official + community) with its submitter handle,
// newest first, for the admin management view.
async function fetchAdminDesigns(): Promise<AdminDesignRow[]> {
  return db
    .select({
      id: cardDesignsTable.id,
      name: cardDesignsTable.name,
      artist: cardDesignsTable.artist,
      royaltySatsPerUnit: cardDesignsTable.royaltySatsPerUnit,
      isCommunity: cardDesignsTable.isCommunity,
      active: cardDesignsTable.active,
      moderationStatus: cardDesignsTable.moderationStatus,
      submitterHandle: entitiesTable.handle,
    })
    .from(cardDesignsTable)
    .leftJoin(accountsTable, eq(cardDesignsTable.submittedByAccountId, accountsTable.id))
    .leftJoin(entitiesTable, eq(accountsTable.entityId, entitiesTable.id))
    .orderBy(desc(cardDesignsTable.createdAt));
}

// ── POST /api/admin/designs/manage ────────────────────────────────────────────
// Admin-only: lists all card designs with inline edit + delete controls.
router.post("/admin/designs/manage", upload.none(), async (req, res): Promise<void> => {
  if (!process.env.ADMIN_SECRET) { res.status(503).send(adminPage("<h2>ADMIN_SECRET not set.</h2>")); return; }
  const provided = typeof req.body.secret === "string" ? req.body.secret : "";
  if (!verifyAdminSecret(provided)) {
    res.status(403).send(adminLoginForm("Invalid secret - please try again."));
    return;
  }

  res.send(adminManageForm(provided, await fetchAdminDesigns()));
});

// ── POST /api/admin/designs/update ────────────────────────────────────────────
// Admin-only: updates a design's name, artist handle and royalty.
router.post("/admin/designs/update", upload.none(), async (req, res): Promise<void> => {
  if (!process.env.ADMIN_SECRET) { res.status(503).send(adminPage("<h2>ADMIN_SECRET not set.</h2>")); return; }
  const provided = typeof req.body.secret === "string" ? req.body.secret : "";
  if (!verifyAdminSecret(provided)) {
    res.status(403).send(adminLoginForm("Invalid secret - please try again."));
    return;
  }

  const id = typeof req.body.id === "string" ? req.body.id : "";
  if (!id) { res.status(400).send(adminPage("<h2>Missing design id.</h2>")); return; }

  const name = (typeof req.body.name === "string" ? req.body.name.trim() : "").slice(0, 60);
  const artistRaw = typeof req.body.artist === "string" ? req.body.artist.trim().slice(0, 60) : "";
  const rawRoyalty = parseInt(req.body.royaltySatsPerUnit ?? "0", 10);
  const royaltySatsPerUnit = Number.isFinite(rawRoyalty) ? Math.max(0, rawRoyalty) : 0;

  if (!name) { res.status(400).send(adminPage("<h2>Design name is required.</h2>")); return; }

  await db
    .update(cardDesignsTable)
    .set({ name, artist: artistRaw || null, royaltySatsPerUnit })
    .where(eq(cardDesignsTable.id, id));

  logger.info({ id, name, artist: artistRaw, royaltySatsPerUnit }, "Admin updated card design");

  const designs = await db
    .select({
      id: cardDesignsTable.id,
      name: cardDesignsTable.name,
      artist: cardDesignsTable.artist,
      royaltySatsPerUnit: cardDesignsTable.royaltySatsPerUnit,
      isCommunity: cardDesignsTable.isCommunity,
      active: cardDesignsTable.active,
      moderationStatus: cardDesignsTable.moderationStatus,
      submitterHandle: entitiesTable.handle,
    })
    .from(cardDesignsTable)
    .leftJoin(accountsTable, eq(cardDesignsTable.submittedByAccountId, accountsTable.id))
    .leftJoin(entitiesTable, eq(accountsTable.entityId, entitiesTable.id))
    .orderBy(desc(cardDesignsTable.createdAt));

  res.send(adminManageForm(provided, designs, `Saved changes to "${escHtml(name)}".`));
});

// ── POST /api/admin/designs/delete ────────────────────────────────────────────
// Admin-only: permanently removes a card design row.
router.post("/admin/designs/delete", upload.none(), async (req, res): Promise<void> => {
  if (!process.env.ADMIN_SECRET) { res.status(503).send(adminPage("<h2>ADMIN_SECRET not set.</h2>")); return; }
  const provided = typeof req.body.secret === "string" ? req.body.secret : "";
  if (!verifyAdminSecret(provided)) {
    res.status(403).send(adminLoginForm("Invalid secret - please try again."));
    return;
  }

  const id = typeof req.body.id === "string" ? req.body.id : "";
  if (!id) { res.status(400).send(adminPage("<h2>Missing design id.</h2>")); return; }

  await db.delete(cardDesignsTable).where(eq(cardDesignsTable.id, id));
  logger.info({ id }, "Admin deleted card design");

  res.send(adminManageForm(provided, await fetchAdminDesigns(), `Design "${escHtml(id)}" deleted.`));
});

interface AdminDesignRow {
  id: string;
  name: string;
  artist: string | null;
  royaltySatsPerUnit: number;
  isCommunity: boolean;
  active: boolean;
  moderationStatus: string;
  submitterHandle: string | null;
}

function adminManageForm(secret: string, designs: AdminDesignRow[], notice?: string): string {
  const rows = designs.length === 0
    ? `<p style="color:#a08060">No designs found.</p>`
    : designs.map((d) => {
      const handle = d.submitterHandle ? `@${escHtml(d.submitterHandle)}` : "";
      const meta = [
        d.isCommunity ? "Community" : "Official",
        d.active ? "active" : "hidden",
        escHtml(d.moderationStatus),
        handle,
      ].filter(Boolean).join(" · ");
      return `
      <div class="row">
        <img src="/api/shop/designs/${encodeURIComponent(d.id)}/artwork" alt="" onerror="this.style.display='none'">
        <div class="row-body">
          <div class="meta">${meta}</div>
          <code>${escHtml(d.id)}</code>
          <form method="POST" action="/api/admin/designs/update" enctype="multipart/form-data" class="edit">
            <input type="hidden" name="secret" value="${escHtml(secret)}">
            <input type="hidden" name="id" value="${escHtml(d.id)}">
            <label>Name</label>
            <input type="text" name="name" maxlength="60" value="${escHtml(d.name)}" required>
            <label>Artist handle</label>
            <input type="text" name="artist" maxlength="60" value="${escHtml(d.artist ?? "")}" placeholder="e.g. kongzi">
            <label>Royalty (sats per card sold)</label>
            <input type="number" name="royaltySatsPerUnit" min="0" step="1" value="${d.royaltySatsPerUnit}">
            <button type="submit" class="save">Save changes</button>
          </form>
          <form method="POST" action="/api/admin/designs/delete" enctype="multipart/form-data" class="del" onsubmit="return confirm('Delete this design permanently?')">
            <input type="hidden" name="secret" value="${escHtml(secret)}">
            <input type="hidden" name="id" value="${escHtml(d.id)}">
            <button type="submit" class="delete">Delete design</button>
          </form>
        </div>
      </div>`;
    }).join("");

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>bitPOS Admin - Manage Designs</title>
<style>
*{box-sizing:border-box}
body{font-family:system-ui,sans-serif;background:#0d0a07;color:#e8ddd0;margin:0;padding:32px 16px;min-height:100vh}
.card{background:#1a1208;border:1px solid #2e2010;border-radius:16px;padding:28px;max-width:640px;margin:0 auto}
h1{font-size:1.1rem;font-weight:700;color:#f5a623;margin:0 0 6px}
.sub{font-size:.82rem;color:#a08060;margin:0 0 20px}
.notice{background:#13301a;border:1px solid #1f5a2e;color:#8ee6a0;border-radius:10px;padding:10px 12px;margin-bottom:16px;font-size:.85rem}
.row{display:flex;gap:14px;padding:16px 0;border-top:1px solid #2e2010}
.row img{width:84px;height:53px;object-fit:cover;border-radius:6px;flex-shrink:0;background:#0d0a07}
.row-body{flex:1;min-width:0}
.meta{font-size:.74rem;color:#a08060;margin-bottom:4px}
code{background:#2e2010;padding:1px 5px;border-radius:5px;font-size:.72rem;word-break:break-all}
label{display:block;font-size:.74rem;font-weight:600;color:#a08060;margin:10px 0 3px}
input[type=text],input[type=number]{width:100%;background:#0d0a07;border:1px solid #2e2010;border-radius:8px;color:#e8ddd0;font-size:.9rem;padding:8px 10px}
input:focus{outline:none;border-color:#f5a623}
.save{margin-top:12px;background:linear-gradient(160deg,#f7a93c,#d97318);border:none;border-radius:8px;color:#1a0e06;font-size:.88rem;font-weight:700;padding:9px 16px;cursor:pointer}
.del{margin-top:8px}
.delete{background:none;border:1px solid #5a1f1f;border-radius:8px;color:#ef6b6b;font-size:.82rem;font-weight:600;padding:8px 14px;cursor:pointer}
.delete:hover{background:#2a1010}
.nav{margin-top:24px}
.nav button{background:none;border:none;color:#f5a623;cursor:pointer;padding:0;font-size:.95rem;text-decoration:underline}
a{color:#f5a623}
</style></head>
<body><div class="card">
<h1>Manage Designs</h1>
<p class="sub">Edit name, artist handle and royalty, or delete a design.</p>
${notice ? `<div class="notice">${notice}</div>` : ""}
${rows}
<div class="nav">
  <form method="POST" action="/api/admin/designs/upload" enctype="multipart/form-data">
    <input type="hidden" name="secret" value="${escHtml(secret)}">
    <button type="submit">+ Upload a new design</button>
  </form>
</div>
</div></body></html>`;
}

function adminPage(body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>bitPOS Admin</title>
<style>*{box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0d0a07;color:#e8ddd0;margin:0;padding:32px 16px;min-height:100vh}
.card{background:#1a1208;border:1px solid #2e2010;border-radius:16px;padding:32px;max-width:540px;margin:0 auto}
h1{font-size:1.1rem;font-weight:700;color:#f5a623;margin:0 0 24px}
h2{font-size:1.1rem;font-weight:600;margin:0 0 12px}
a{color:#f5a623}code{background:#2e2010;padding:2px 6px;border-radius:6px;font-size:.85rem}
img{display:block}</style></head>
<body><div class="card"><h1>bitPOS Admin</h1>${body}</div></body></html>`;
}

function adminLoginForm(error?: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>bitPOS Admin</title>
<style>
*{box-sizing:border-box}
body{font-family:system-ui,sans-serif;background:#0d0a07;color:#e8ddd0;margin:0;padding:32px 16px;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:#1a1208;border:1px solid #2e2010;border-radius:16px;padding:32px;width:100%;max-width:380px}
h1{font-size:1.1rem;font-weight:700;color:#f5a623;margin:0 0 24px}
label{display:block;font-size:.82rem;font-weight:600;color:#a08060;margin-bottom:6px}
input[type=password]{width:100%;background:#0d0a07;border:1px solid #2e2010;border-radius:8px;color:#e8ddd0;font-size:.95rem;padding:10px 12px}
input[type=password]:focus{outline:none;border-color:#f5a623}
button{width:100%;margin-top:16px;background:linear-gradient(160deg,#f7a93c,#d97318);border:none;border-radius:10px;color:#1a0e06;font-size:1rem;font-weight:700;padding:13px;cursor:pointer}
.err{color:#ef4444;font-size:.85rem;margin-top:12px}
</style></head>
<body><div class="card">
<h1>bitPOS Admin</h1>
<form method="POST" action="/api/admin/designs/upload" enctype="multipart/form-data">
  <label for="secret">Admin secret</label>
  <input type="password" id="secret" name="secret" autofocus autocomplete="current-password" placeholder="Enter admin secret">
  <button type="submit">Unlock</button>
  ${error ? `<p class="err">${escHtml(error)}</p>` : ""}
</form>
</div></body></html>`;
}

function adminUploadForm(secret: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>bitPOS Admin - Upload Design</title>
<style>
*{box-sizing:border-box}
body{font-family:system-ui,sans-serif;background:#0d0a07;color:#e8ddd0;margin:0;padding:32px 16px;min-height:100vh}
.card{background:#1a1208;border:1px solid #2e2010;border-radius:16px;padding:32px;max-width:540px;margin:0 auto}
h1{font-size:1.1rem;font-weight:700;color:#f5a623;margin:0 0 24px}
label{display:block;font-size:.82rem;font-weight:600;color:#a08060;margin-bottom:4px;margin-top:16px}
input[type=text],input[type=number]{width:100%;background:#0d0a07;border:1px solid #2e2010;border-radius:8px;color:#e8ddd0;font-size:.95rem;padding:10px 12px}
input[type=text]:focus,input[type=number]:focus{outline:none;border-color:#f5a623}
input[type=file]{display:block;margin-top:4px;color:#a08060;font-size:.88rem}
.hint{font-size:.78rem;color:#6b5040;margin-top:3px}
.required{color:#ef4444}
button{width:100%;margin-top:24px;background:linear-gradient(160deg,#f7a93c,#d97318);border:none;border-radius:10px;color:#1a0e06;font-size:1rem;font-weight:700;padding:13px;cursor:pointer;transition:.15s}
button:disabled{opacity:.5;cursor:not-allowed}
#status{margin-top:16px;font-size:.9rem;color:#a08060;display:none}
a{color:#f5a623}
</style></head>
<body><div class="card">
<h1>Upload Community Design</h1>
<form id="form" enctype="multipart/form-data" method="POST" action="/api/admin/designs/upload">
  <input type="hidden" name="secret" value="${escHtml(secret)}">
  <label>Design name <span class="required">*</span></label>
  <input type="text" name="name" required maxlength="60" placeholder="e.g. bitPOS#2">
  <label>Artist handle</label>
  <input type="text" name="artist" maxlength="60" placeholder="e.g. kongzi">
  <div class="hint">Optional. Shown as &ldquo;by @handle&rdquo; in the shop.</div>
  <label>Royalty (sats per card sold)</label>
  <input type="number" name="royaltySatsPerUnit" value="0" min="0" step="1">
  <div class="hint">Sats credited to the artist on each sale.</div>
  <label>Front artwork <span class="required">*</span></label>
  <input type="file" name="front" accept="image/png,image/jpeg" required id="frontFile">
  <div class="hint">PNG or JPEG, print-ready. Required.</div>
  <label>Back artwork</label>
  <input type="file" name="back" accept="image/png,image/jpeg" id="backFile">
  <div class="hint">Optional. Leave blank for plain white back.</div>
  <button type="submit" id="btn">Publish Design</button>
  <div id="status">Uploading artwork to Printags... this may take 15-30 seconds.</div>
</form>
<div style="margin-top:24px;border-top:1px solid #2e2010;padding-top:16px">
  <form method="POST" action="/api/admin/designs/manage" enctype="multipart/form-data">
    <input type="hidden" name="secret" value="${escHtml(secret)}">
    <button type="submit" style="width:auto;margin:0;background:none;border:none;color:#f5a623;cursor:pointer;padding:0;font-size:.95rem;text-decoration:underline">Manage existing designs</button>
  </form>
</div>
</div>
<script>
document.getElementById('form').addEventListener('submit', function() {
  document.getElementById('btn').disabled = true;
  document.getElementById('btn').textContent = 'Uploading...';
  document.getElementById('status').style.display = 'block';
});
</script>
</body></html>`;
}

// ── GET /api/shop/quote ────────────────────────────────────────────────────────
// Accepts both authenticated (bitpos.app users) and unauthenticated callers
// (OSS self-hosted instances using X-BitPOS-Instance proxy auth).
// Unauthenticated callers receive userBalanceSats: 0 / shortfallSats: totalSats.
router.get("/shop/quote", optionalAuth, async (req, res): Promise<void> => {
  const country = typeof req.query.country === "string" ? req.query.country.toUpperCase() : "US";
  const hasCustomFile = req.query.hasCustomFile === "true";
  const designId = typeof req.query.designId === "string" ? req.query.designId : null;
  const quantity = Math.max(1, parseInt(typeof req.query.quantity === "string" ? req.query.quantity : "1", 10) || 1);

  let baseEurCents = PLAIN_WHITE_EUR_CENTS;
  let designRoyaltyPerCard = 0;
  let designSubmittedBy: string | null = null;
  if (hasCustomFile) {
    baseEurCents = CUSTOM_UPLOAD_EUR_CENTS;
  } else if (designId) {
    const [design] = await db
      .select({
        priceEurCents: cardDesignsTable.priceEurCents,
        isCommunity: cardDesignsTable.isCommunity,
        royaltySatsPerUnit: cardDesignsTable.royaltySatsPerUnit,
        submittedByAccountId: cardDesignsTable.submittedByAccountId,
      })
      .from(cardDesignsTable)
      .where(eq(cardDesignsTable.id, designId));
    if (design) {
      baseEurCents = design.priceEurCents;
      if (design.isCommunity && design.royaltySatsPerUnit > 0) {
        designRoyaltyPerCard = design.royaltySatsPerUnit;
        designSubmittedBy = design.submittedByAccountId ?? null;
      }
    }
  }

  // Shipping is NO LONGER part of the quote. Exact shipping is fetched live per
  // destination at checkout via POST /shop/shipping-rates (carrier selection).
  // The quote returns the card subtotal (card price + any designer royalty) only.
  const baseEurCentsTotal = baseEurCents * quantity;

  const price = await getBtcPrice();
  const baseSats = eurCentsToSats(baseEurCentsTotal, price.eur);

  let userBalanceSats = 0;
  const buyerAccountId = req.auth?.accountId ?? null;
  if (buyerAccountId) {
    const [account] = await db
      .select({ balanceSats: accountsTable.balanceSats })
      .from(accountsTable)
      .where(eq(accountsTable.id, buyerAccountId));
    userBalanceSats = account?.balanceSats ?? 0;
  }

  // Apply royalty only when buyer is not the designer
  const isOwnDesign = buyerAccountId && designSubmittedBy && buyerAccountId === designSubmittedBy;
  const royaltySats = (!isOwnDesign && designRoyaltyPerCard > 0) ? designRoyaltyPerCard * quantity : 0;
  const subtotalSats = baseSats + royaltySats;

  res.json({
    quantity,
    cardEurCentsPerUnit: baseEurCents,
    baseEurCents: baseEurCentsTotal,
    royaltyPerCard: royaltySats > 0 ? designRoyaltyPerCard : 0,
    royaltySats,
    subtotalSats,
    btcEurRate: price.eur,
    btcUsdRate: price.usd,
    priceUpdatedAt: Date.now(),
    userBalanceSats,
  });
});

// ── POST /api/shop/shipping-rates ──────────────────────────────────────────────
// Returns live carrier shipping options for a destination + quantity. There is
// intentionally NO flat-rate fallback: if Printags is unavailable or returns no
// rates, checkout is blocked with an error so we never charge a guessed price.
router.post("/shop/shipping-rates", optionalAuth, async (req, res): Promise<void> => {
  if (!isConfigured()) {
    res.status(503).json({ error: "Card printing is temporarily unavailable. Please try again later." });
    return;
  }

  const country = typeof req.body.country === "string" ? req.body.country.toUpperCase() : "";
  const postalCode = typeof req.body.postalCode === "string" ? req.body.postalCode.trim() : "";
  const quantity = Math.max(1, parseInt(req.body.quantity ?? "1", 10) || 1);

  if (!country || !postalCode) {
    res.status(400).json({ error: "Destination country and postal code are required" });
    return;
  }

  let carriers;
  try {
    carriers = await getShippingRates({
      toCountry: country,
      toPostalCode: postalCode,
      items: [{ modelId: "ntag424_pvccard_white", quantity }],
    });
  } catch {
    res.status(502).json({ error: "Could not fetch live shipping rates for this address. Please check your address and try again." });
    return;
  }

  const price = await getBtcPrice();

  const rates = carriers
    .map((c) => ({
      serviceId: c.serviceId,
      name: c.name,
      shippingEurCents: c.priceEurCents,
      shippingSats: eurCentsToSats(c.priceEurCents, price.eur),
      estimatedDaysMin: c.estimatedDaysMin ?? null,
      estimatedDaysMax: c.estimatedDaysMax ?? null,
    }))
    .sort((a, b) => a.shippingEurCents - b.shippingEurCents);

  res.json({
    rates,
    btcEurRate: price.eur,
    btcUsdRate: price.usd,
    priceUpdatedAt: Date.now(),
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
    carrierServiceId,
  } = req.body;
  const quantity = Math.max(1, parseInt(req.body.quantity ?? "1", 10) || 1);

  if (!shippingName || !shippingAddress1 || !shippingCity || !shippingPostalCode || !shippingCountry) {
    res.status(400).json({ error: "Missing required shipping fields" });
    return;
  }

  if (!shippingEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shippingEmail)) {
    res.status(400).json({ error: "A valid email address is required" });
    return;
  }

  // Encrypt PII fields once - used in both payment paths below.
  const encShipping = encryptShippingFields({
    shippingName,
    shippingEmail: shippingEmail ?? null,
    shippingPhone: shippingPhone ?? null,
    shippingAddress1,
    shippingAddress2: shippingAddress2 ?? null,
    shippingCity,
    shippingPostalCode,
    shippingCountry,
  });

  let baseEurCents = PLAIN_WHITE_EUR_CENTS;
  let orderRoyaltyPerCard = 0;
  if (printFileId) {
    baseEurCents = CUSTOM_UPLOAD_EUR_CENTS;
  } else if (designId) {
    const [design] = await db
      .select({
        priceEurCents: cardDesignsTable.priceEurCents,
        isCommunity: cardDesignsTable.isCommunity,
        royaltySatsPerUnit: cardDesignsTable.royaltySatsPerUnit,
        submittedByAccountId: cardDesignsTable.submittedByAccountId,
      })
      .from(cardDesignsTable)
      .where(and(eq(cardDesignsTable.id, designId), eq(cardDesignsTable.active, true)));
    if (!design) {
      res.status(404).json({ error: "Design not found" });
      return;
    }
    baseEurCents = design.priceEurCents;
    if (design.isCommunity && design.royaltySatsPerUnit > 0 && design.submittedByAccountId !== accountId) {
      orderRoyaltyPerCard = design.royaltySatsPerUnit;
    }
  }

  // Shipping is authoritative on the server: never trust a client-sent price.
  // Re-fetch live rates for this exact destination + quantity and look up the
  // carrier the customer chose. No flat-rate fallback - if rates are unavailable
  // or the chosen carrier is gone, block the order with a clear error.
  if (!isConfigured()) {
    res.status(503).json({ error: "Card printing is temporarily unavailable. Please try again later." });
    return;
  }
  if (!carrierServiceId || typeof carrierServiceId !== "string") {
    res.status(400).json({ error: "Please choose a shipping option." });
    return;
  }

  let carriers;
  try {
    carriers = await getShippingRates({
      toCountry: shippingCountry,
      toPostalCode: shippingPostalCode,
      items: [{ modelId: "ntag424_pvccard_white", quantity }],
    });
  } catch {
    res.status(502).json({ error: "Could not fetch live shipping rates for this address. Please try again." });
    return;
  }

  const chosenCarrier = carriers.find((c) => c.serviceId === carrierServiceId);
  if (!chosenCarrier) {
    res.status(409).json({ error: "That shipping option is no longer available. Please choose again." });
    return;
  }

  const shippingEurCents = chosenCarrier.priceEurCents;
  const totalEurCents = baseEurCents * quantity + shippingEurCents;

  const price = await getBtcPrice();
  const royaltySatsTotal = orderRoyaltyPerCard * quantity;
  const amountSats = eurCentsToSats(totalEurCents, price.eur) + royaltySatsTotal;

  const [account] = await db
    .select({ balanceSats: accountsTable.balanceSats })
    .from(accountsTable)
    .where(eq(accountsTable.id, accountId));

  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  const useBalance = req.body.useBalance === true;

  // ── Path A: Explicit balance payment (user opted in and has enough) ─────────
  if (useBalance && account.balanceSats >= amountSats) {
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
          ...encShipping,
          carrierServiceId,
          shippingEurCents,
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
    const royaltyCredited = await creditDesignRoyalty(order);
    forwardCardRevenue(order.amountSats - royaltyCredited, order.id).catch(() => { /* errors logged inside */ });

    res.status(201).json({ orderId: order.id, paid: true, status: "confirmed" });
    return;
  }

  // ── Path B: Lightning payment - invoice for the full amount ────────────────
  const nwcUrl = await getAccountNwcUrl(accountId);

  // Generate order ID upfront so the invoice memo can reference it.
  // Create invoice FIRST - no DB writes yet, so a failure here leaves no orphaned order.
  const orderId = randomUUID();
  const invoiceResult = await makeInvoice(
    amountSats,
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
        ...encShipping,
        carrierServiceId,
        shippingEurCents,
        amountSats,
      })
      .returning();

    const [pi] = await tx
      .insert(pendingInvoicesTable)
      .values({
        accountId,
        bolt11: invoiceResult.bolt11,
        paymentHash: invoiceResult.paymentHash,
        amountSats,
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
      amountSats,
      expiresAt: invoiceResult.expiresAt,
    },
  });
});

// ── POST /api/shop/orders/:id/pay ──────────────────────────────────────────────
// Two modes:
//   useBalance: true  - user chose to pay from wallet; deduct balance atomically
//   useBalance: false - Lightning invoice was paid; just confirm the order
router.post("/shop/orders/:id/pay", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.auth!.accountId;
  const orderId = paramStr(req.params.id);
  const useBalance = req.body?.useBalance === true;

  const [order] = await db
    .select()
    .from(cardOrdersTable)
    .where(and(eq(cardOrdersTable.id, orderId), eq(cardOrdersTable.accountId, accountId)));

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  if (order.status !== "awaiting_payment") {
    // Idempotent: already confirmed
    if (["pending", "confirmed", "printing", "shipped", "delivered"].includes(order.status)) {
      res.json({ orderId, paid: true, status: order.status });
      return;
    }
    res.status(400).json({ error: `Order cannot be paid (status: ${order.status})` });
    return;
  }

  if (useBalance) {
    // Deduct balance atomically - only succeeds if balance is sufficient
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
        .set({ status: "confirmed" })
        .where(eq(cardOrdersTable.id, orderId))
        .returning();

      return updatedOrder;
    });

    if (!result) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }

    submitOrderToPrintags(decryptOrderShipping(result)).catch(() => { /* errors logged inside */ });
    const royaltySats = await creditDesignRoyalty(result);
    forwardCardRevenue(result.amountSats - royaltySats, result.id).catch(() => { /* errors logged inside */ });

    res.json({ orderId, paid: true, status: "confirmed" });
    return;
  }

  // Lightning path: verify the invoice was actually settled before confirming.
  // An unauthenticated caller could otherwise confirm any order for free by hitting
  // this endpoint directly. We require proof of payment via paidAt in the DB or a
  // live NWC lookup as a fallback (in case the webhook hasn't fired yet).
  if (!order.pendingInvoiceId) {
    res.status(400).json({ error: "No Lightning invoice associated with this order" });
    return;
  }

  const [invoice] = await db
    .select({
      paidAt: pendingInvoicesTable.paidAt,
      paymentHash: pendingInvoicesTable.paymentHash,
      nwcUrlEncrypted: pendingInvoicesTable.nwcUrlEncrypted,
    })
    .from(pendingInvoicesTable)
    .where(eq(pendingInvoicesTable.id, order.pendingInvoiceId));

  if (!invoice) {
    res.status(400).json({ error: "Invoice record not found" });
    return;
  }

  if (!invoice.paidAt) {
    // Invoice not yet marked paid in DB - do a live NWC lookup as a last resort
    // (handles the race between payment arrival and webhook processing)
    try {
      const nwcUrl = invoice.nwcUrlEncrypted ? decrypt(invoice.nwcUrlEncrypted) : undefined;
      const status = await lookupInvoice(invoice.paymentHash, nwcUrl ?? undefined);
      if (!status.paid) {
        res.status(402).json({ error: "Invoice not yet paid" });
        return;
      }
      // Mark paid in DB so subsequent polls and expiry checks see the correct state
      await db
        .update(pendingInvoicesTable)
        .set({ paidAt: new Date() })
        .where(eq(pendingInvoicesTable.id, order.pendingInvoiceId));
    } catch (err) {
      logger.warn({ err, orderId }, "Lightning /pay lookup failed - cannot confirm order");
      res.status(402).json({ error: "Could not verify invoice payment" });
      return;
    }
  }

  // Invoice confirmed paid - settle the order
  const [updatedOrder] = await db
    .update(cardOrdersTable)
    .set({ status: "confirmed" })
    .where(and(eq(cardOrdersTable.id, orderId), eq(cardOrdersTable.status, "awaiting_payment")))
    .returning();

  if (!updatedOrder) {
    // Could have been settled already by the auto-settle cron - idempotent
    res.json({ orderId, paid: true, status: "confirmed" });
    return;
  }

  submitOrderToPrintags(decryptOrderShipping(updatedOrder)).catch(() => { /* errors logged inside */ });
  const royaltySats = await creditDesignRoyalty(updatedOrder);
  forwardCardRevenue(updatedOrder.amountSats - royaltySats, updatedOrder.id).catch(() => { /* errors logged inside */ });

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

  res.json(orders.map(decryptOrderShipping));
});

// ── GET /api/shop/orders/:id ───────────────────────────────────────────────────
router.get("/shop/orders/:id", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.auth!.accountId;
  const orderId = paramStr(req.params.id);

  const [rawOrder] = await db
    .select()
    .from(cardOrdersTable)
    .where(and(eq(cardOrdersTable.id, orderId), eq(cardOrdersTable.accountId, accountId)));

  if (!rawOrder) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const order = decryptOrderShipping(rawOrder);

  // Resilience: an order that has been paid (confirmed/pending/printing) but has
  // no printOrderId never reached Printags - the original submission failed (e.g.
  // a transient error or an address Printags rejected before sanitization). The
  // frontend polls this endpoint, so retry the submission here. submitOrderToPrintags
  // is idempotent (guards on printOrderId + an in-flight lock) and decrypts the
  // shipping fields itself, so passing the raw (encrypted) row is correct.
  //
  // Only retry within 48 hours of creation. Beyond that the failure is non-transient
  // (bad address, Printags account issue, etc.) and silent re-submission would send
  // unintended orders to the printer whenever anyone views the order detail page.
  const RETRY_WINDOW_MS = 48 * 60 * 60 * 1000;
  const orderAge = Date.now() - new Date(rawOrder.createdAt).getTime();
  if (
    !order.printOrderId &&
    ["confirmed", "pending", "printing"].includes(order.status) &&
    isConfigured() &&
    orderAge < RETRY_WINDOW_MS
  ) {
    submitOrderToPrintags(rawOrder).catch(() => { /* errors logged inside */ });
  }

  // Kick off a background Printags status refresh so the DB stays current.
  // We do NOT await it - the stored DB state is returned immediately so the
  // page loads fast. The frontend polls every 5s for active orders, so any
  // status change surfaces on the next tick. The 2-min background poller also
  // keeps status current for orders with no active viewer.
  if (order.printOrderId) {
    const _printOrderId = order.printOrderId;
    getOrder(_printOrderId)
      .then((live) => applyPrintagsStatus(_printOrderId, live.status, live.trackingNumber))
      .catch(() => { /* poller will retry */ });
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

// ── GET /api/shop/designs/:id/artwork ─────────────────────────────────────────
// Streams a community/custom design's artwork from Printags.
// ?side=front (default) or ?side=back
// No auth required - designs are public once approved.
router.get("/shop/designs/:id/artwork", async (req, res): Promise<void> => {
  const designId = req.params.id;
  const side = req.query.side === "back" ? "back" : "front";

  const [design] = await db
    .select({ printafsFileId: cardDesignsTable.printafsFileId, printafsFileIdBack: cardDesignsTable.printafsFileIdBack, active: cardDesignsTable.active })
    .from(cardDesignsTable)
    .where(and(eq(cardDesignsTable.id, designId), eq(cardDesignsTable.active, true)));

  if (!design) {
    res.status(404).json({ error: "Design not found" });
    return;
  }

  const fileId = side === "back" ? design.printafsFileIdBack : design.printafsFileId;
  if (!fileId) {
    res.status(404).json({ error: `No ${side} artwork for this design` });
    return;
  }

  if (!isConfigured()) {
    res.status(503).json({ error: "Print service not configured" });
    return;
  }

  try {
    const { buffer, contentType } = await getFile(fileId);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(buffer);
  } catch (err) {
    const upstreamStatus = (err as { response?: { status?: number } })?.response?.status;
    if (upstreamStatus === 404) {
      res.status(404).json({ error: "Artwork not found" });
      return;
    }
    logger.error({ err, designId, side }, "Failed to fetch design artwork from Printags");
    res.status(502).json({ error: "Could not load artwork" });
  }
});

// ── GET /api/shop/orders/:id/artwork/:side ─────────────────────────────────────
// Streams a custom-upload order's artwork image (front or back) by proxying the
// file from Printags. Keeps the Printags secret key server-side; the browser
// fetches this authenticated endpoint and renders the returned image bytes.
router.get("/shop/orders/:id/artwork/:side", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.auth!.accountId;
  const orderId = paramStr(req.params.id);
  const side = paramStr(req.params.side);

  if (side !== "front" && side !== "back") {
    res.status(400).json({ error: "side must be 'front' or 'back'" });
    return;
  }

  const [order] = await db
    .select({ printFileId: cardOrdersTable.printFileId, printFileIdBack: cardOrdersTable.printFileIdBack })
    .from(cardOrdersTable)
    .where(and(eq(cardOrdersTable.id, orderId), eq(cardOrdersTable.accountId, accountId)));

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const fileId = side === "back" ? order.printFileIdBack : order.printFileId;
  if (!fileId) {
    res.status(404).json({ error: "No artwork for this side" });
    return;
  }

  if (!isConfigured()) {
    res.status(503).json({ error: "Print service not configured" });
    return;
  }

  try {
    const { buffer, contentType } = await getFile(fileId);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(buffer);
  } catch (err) {
    const upstreamStatus = (err as { response?: { status?: number } })?.response?.status;
    if (upstreamStatus === 404) {
      res.status(404).json({ error: "Artwork not found" });
      return;
    }
    logger.error({ err, orderId, side }, "Failed to fetch order artwork from Printags");
    res.status(502).json({ error: "Could not load artwork" });
  }
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
    logger.warn({ headers: req.headers }, "Printags webhook signature verification failed - ignoring event");
    return;
  }

  const raw = req.body as Record<string, unknown>;

  // Log the complete payload so we can see exactly what Printags sends for real orders
  logger.info({ webhookPayload: raw }, "Printags webhook received - full payload");

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
      "Printags webhook missing orderId or status - cannot update order. Check payload shape above.",
    );
    return;
  }

  // Delegate to the shared forward-only updater (same logic the page-load enrich
  // and the background poller use). It maps the exact Printags status, guards
  // against backwards/stale transitions, and persists status + printStatus + tracking.
  const changed = await applyPrintagsStatus(orderId, rawStatus, trackingNumber);

  logger.info(
    { eventType, printOrderId: orderId, rawStatus, trackingNumber, changed },
    changed
      ? "Printags webhook processed - order updated"
      : "Printags webhook processed - no change (stale/duplicate, guard, or order not found)",
  );
});

export default router;
