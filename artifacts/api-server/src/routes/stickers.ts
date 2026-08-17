import { Router } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  stickersTable,
  accountsTable,
  transactionsTable,
  type NewSticker,
} from "@workspace/db";
import { requireAuth } from "../middleware/auth";
import { logger } from "../lib/logger";

const router = Router();

// ── Seed default platform stickers ────────────────────────────────────────────

const PLATFORM_STICKERS: NewSticker[] = [
  {
    id: "default-lightning",
    name: "Lightning Bolt",
    description: "The classic lightning bolt - perfect for Bitcoin Lightning cards",
    imageUrl: "data:image/svg+xml;base64," + Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><polygon points="58,5 22,52 48,52 42,95 78,48 52,48" fill="#F59E0B" stroke="#B45309" stroke-width="2.5"/></svg>`
    ).toString("base64"),
    active: true,
    moderationStatus: "approved",
    royaltySatsPerUse: 0,
  },
  {
    id: "default-bitcoin",
    name: "Bitcoin Circle",
    description: "The Bitcoin orange coin symbol",
    imageUrl: "data:image/svg+xml;base64," + Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><circle cx="50" cy="50" r="46" fill="#F7931A"/><text x="50" y="68" font-size="52" font-family="Arial Black,sans-serif" font-weight="900" text-anchor="middle" fill="white">B</text><line x1="44" y1="14" x2="44" y2="24" stroke="white" stroke-width="4" stroke-linecap="round"/><line x1="56" y1="14" x2="56" y2="24" stroke="white" stroke-width="4" stroke-linecap="round"/></svg>`
    ).toString("base64"),
    active: true,
    moderationStatus: "approved",
    royaltySatsPerUse: 0,
  },
  {
    id: "default-star",
    name: "Gold Star",
    description: "A shining gold star",
    imageUrl: "data:image/svg+xml;base64," + Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><polygon points="50,5 61,37 95,37 68,57 79,91 50,71 21,91 32,57 5,37 39,37" fill="#FBBF24" stroke="#D97706" stroke-width="2"/></svg>`
    ).toString("base64"),
    active: true,
    moderationStatus: "approved",
    royaltySatsPerUse: 0,
  },
  {
    id: "default-heart",
    name: "Red Heart",
    description: "Show the love",
    imageUrl: "data:image/svg+xml;base64," + Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><path d="M50 82 C50 82 12 58 12 33 C12 19 22 10 34 10 C41 10 48 14 50 20 C52 14 59 10 66 10 C78 10 88 19 88 33 C88 58 50 82 50 82Z" fill="#EF4444" stroke="#B91C1C" stroke-width="2"/></svg>`
    ).toString("base64"),
    active: true,
    moderationStatus: "approved",
    royaltySatsPerUse: 0,
  },
  {
    id: "default-flame",
    name: "Flame",
    description: "Hot fire flame",
    imageUrl: "data:image/svg+xml;base64," + Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><path d="M50 92 C28 92 14 76 14 60 C14 42 26 36 36 28 C33 39 38 46 44 50 C41 37 50 19 57 8 C57 24 64 36 70 44 C74 32 72 22 68 14 C80 28 86 46 86 60 C86 76 72 92 50 92Z" fill="#F97316" stroke="#C2410C" stroke-width="1.5"/><path d="M50 80 C40 80 34 73 34 65 C34 56 40 52 46 47 C45 54 48 58 52 61 C50 54 54 44 58 38 C58 48 63 55 66 60 C66 71 59 80 50 80Z" fill="#FEF08A"/></svg>`
    ).toString("base64"),
    active: true,
    moderationStatus: "approved",
    royaltySatsPerUse: 0,
  },
  {
    id: "default-diamond",
    name: "Diamond",
    description: "A sparkling diamond gem",
    imageUrl: "data:image/svg+xml;base64," + Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><polygon points="50,6 88,36 50,94 12,36" fill="#67E8F9" stroke="#0E7490" stroke-width="2"/><polygon points="50,6 88,36 50,44 12,36" fill="#A5F3FC" stroke="#0E7490" stroke-width="1"/><polygon points="50,44 88,36 50,94" fill="#22D3EE" stroke="#0E7490" stroke-width="0"/></svg>`
    ).toString("base64"),
    active: true,
    moderationStatus: "approved",
    royaltySatsPerUse: 0,
  },
];

export async function seedDefaultStickers(): Promise<void> {
  try {
    for (const sticker of PLATFORM_STICKERS) {
      await db
        .insert(stickersTable)
        .values(sticker)
        .onConflictDoNothing();
    }
    logger.info({ count: PLATFORM_STICKERS.length }, "Default stickers seeded/synced");
  } catch (err) {
    logger.error({ err }, "Failed to seed default stickers");
  }
}

// ── GET /stickers ─────────────────────────────────────────────────────────────
// List all active/approved stickers

router.get("/stickers", requireAuth, async (_req, res) => {
  try {
    const stickers = await db
      .select({
        id: stickersTable.id,
        name: stickersTable.name,
        description: stickersTable.description,
        imageUrl: stickersTable.imageUrl,
        royaltySatsPerUse: stickersTable.royaltySatsPerUse,
        submittedByAccountId: stickersTable.submittedByAccountId,
      })
      .from(stickersTable)
      .where(and(
        eq(stickersTable.active, true),
        eq(stickersTable.moderationStatus, "approved"),
      ));

    res.json({ stickers });
  } catch (err) {
    logger.error({ err }, "GET /stickers failed");
    res.status(500).json({ error: "Failed to fetch stickers" });
  }
});

// ── POST /stickers/publish ────────────────────────────────────────────────────
// Submit a community sticker for moderation review

router.post("/stickers/publish", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.auth!.accountId;
  const { name, description, imageUrl } = req.body as {
    name?: string;
    description?: string;
    imageUrl?: string;
  };

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    res.status(400).json({ error: "name must be at least 2 characters" }); return;
  }
  if (!imageUrl || typeof imageUrl !== "string" || !imageUrl.startsWith("data:image/")) {
    res.status(400).json({ error: "imageUrl must be a valid data: image URL" }); return;
  }
  if (imageUrl.length > 512_000) {
    res.status(400).json({ error: "Image too large (max ~384KB)" }); return;
  }

  try {
    const id = `community-${accountId.slice(0, 8)}-${Date.now()}`;
    const [sticker] = await db
      .insert(stickersTable)
      .values({
        id,
        name: name.trim(),
        description: description?.trim() ?? null,
        imageUrl,
        submittedByAccountId: accountId,
        active: false,
        moderationStatus: "pending",
        royaltySatsPerUse: 0,
      })
      .returning();

    logger.info({ stickerId: sticker.id, accountId }, "Community sticker submitted for review");
    res.status(201).json({ sticker });
  } catch (err) {
    logger.error({ err }, "POST /stickers/publish failed");
    res.status(500).json({ error: "Failed to submit sticker" });
  }
});

// ── creditStickerRoyalties (internal) ─────────────────────────────────────────
// Called at order settlement time. Credits sticker authors from the platform
// bank account for each community sticker used in the settled design.
// Never throws - errors are logged per-sticker and the caller is not affected.

export async function creditStickerRoyalties(
  _designerAccountId: string | null | undefined,
  _stickerIds: string[],
): Promise<void> {
  // Sticker royalties are handled by maekob - no-op in bitPOS SaaS layer
}

export default router;
