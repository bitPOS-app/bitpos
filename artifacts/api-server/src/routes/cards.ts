/**
 * Card management API routes.
 *
 * POST   /api/accounts/:accountId/cards          - Issue a new Bolt Card
 * GET    /api/accounts/:accountId/cards          - List cards for account
 * PATCH  /api/cards/:id                          - Update limits / freeze / unfreeze
 * DELETE /api/cards/:id                          - Deactivate (cancel) card
 */
import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, cardsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { UpdateCardBody, SetCardPinBody, SetCardPinLimitBody, UnlockCardPinBody } from "@workspace/api-zod";
import { randomBytes } from "crypto";
import { encrypt, decrypt } from "../lib/encrypt";
import { verifyEntityPin } from "../lib/verify-pin";
import { requireAuth, requireAccountAccessByParam } from "../middleware/auth";
import { logger } from "../lib/logger";
import { DOMAIN } from "../lib/domain";

// Middleware for routes where the account UUID is in `:accountId` param
const requireAccountOwner = requireAccountAccessByParam("accountId");

const router: IRouter = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateAesKey(): string {
  return randomBytes(16).toString("hex");
}

function encryptKey(hexKey: string): string {
  return encrypt(hexKey);
}

/** Resolve card ownership: returns accountId for the given card or null. */
async function getCardOwnerAccountId(cardId: string): Promise<string | null> {
  const [row] = await db
    .select({ accountId: cardsTable.accountId })
    .from(cardsTable)
    .where(eq(cardsTable.id, cardId));
  return row?.accountId ?? null;
}

/** Middleware that verifies the caller owns the card. */
async function requireCardAccess(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
): Promise<void> {
  requireAuth(req, res, async () => {
    const rawCardId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const ownerAccountId = await getCardOwnerAccountId(rawCardId);
    if (!ownerAccountId || req.auth?.accountId !== ownerAccountId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  });
}

// ── POST /api/accounts/:accountId/cards - Issue a new Bolt Card ─────────────
router.post("/accounts/:accountId/cards", requireAccountOwner, async (req, res): Promise<void> => {
  const accountId = Array.isArray(req.params.accountId) ? req.params.accountId[0] : req.params.accountId;

  // Generate 5 random 16-byte AES keys (key_0 through key_4)
  const rawKeys = Array.from({ length: 5 }, generateAesKey);
  const [key0, key1, key2, key3, key4] = rawKeys;

  // Generate a one-time provisioning token (expires in 24 hours)
  const provisionToken = randomBytes(24).toString("hex");
  const provisionTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const [card] = await db
    .insert(cardsTable)
    .values({
      accountId,
      aesKey0: encryptKey(key0),
      aesKey1: encryptKey(key1),
      aesKey2: encryptKey(key2),
      aesKey3: encryptKey(key3),
      aesKey4: encryptKey(key4),
      provisionToken,
      provisionTokenExpiresAt,
    })
    .returning();

  logger.info({ cardId: card.id, accountId }, "Bolt Card issued");

  // provisionUrl is scanned by the Bolt Card NFC Creator app as boltcard://program?url=<provisionUrl>
  // The app fetches it to receive the new_bolt_card_response JSON with keys + lnurlw_base
  const provisionUrl = `https://${DOMAIN}/api/provision/${provisionToken}`;

  // lnurlwTemplate is for manual NFC programming tools (e.g. NXP TagXplorer)
  const lnurlwTemplate = `lnurlw://${DOMAIN}/card/${card.id}?p=00000000000000000000000000000000&c=0000000000000000`;

  res.status(201).json({
    cardId: card.id,
    status: card.status,
    perTapLimitSats: card.perTapLimitSats,
    dailyLimitSats: card.dailyLimitSats,
    provisionUrl,
    lnurlwTemplate,
    // Raw keys for manual NXP TagXplorer programming (shown in Raw keys tab)
    keys: {
      key0,
      key1,
      key2,
      key3,
      key4,
    },
    createdAt: card.createdAt,
  });
});

// ── GET /api/accounts/:accountId/cards - List cards ─────────────────────────
router.get("/accounts/:accountId/cards", requireAccountOwner, async (req, res): Promise<void> => {
  const accountId = Array.isArray(req.params.accountId) ? req.params.accountId[0] : req.params.accountId;

  const rows = await db
    .select({
      id: cardsTable.id,
      name: cardsTable.name,
      note: cardsTable.note,
      status: cardsTable.status,
      perTapLimitSats: cardsTable.perTapLimitSats,
      dailyLimitSats: cardsTable.dailyLimitSats,
      pinHash: cardsTable.pinHash,
      pinLimitMsats: cardsTable.pinLimitMsats,
      pinLockedAt: cardsTable.pinLockedAt,
      lastUsedAt: cardsTable.lastUsedAt,
      createdAt: cardsTable.createdAt,
    })
    .from(cardsTable)
    .where(eq(cardsTable.accountId, accountId));

  const cards = rows.map(({ pinHash, pinLockedAt, ...rest }) => ({
    ...rest,
    pinEnabled: pinHash != null,
    pinLocked: pinLockedAt != null,
  }));

  res.json(cards);
});

// ── PATCH /api/cards/:id - Update limits / freeze / unfreeze ────────────────
router.patch("/cards/:id", requireCardAccess, async (req, res): Promise<void> => {
  const cardId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const body = UpdateCardBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  if (!body.data.status && !body.data.perTapLimitSats && !body.data.dailyLimitSats && body.data.name === undefined && body.data.note === undefined) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [card] = await db
    .update(cardsTable)
    .set({
      ...(body.data.status ? { status: body.data.status } : {}),
      ...(body.data.perTapLimitSats ? { perTapLimitSats: body.data.perTapLimitSats } : {}),
      ...(body.data.dailyLimitSats ? { dailyLimitSats: body.data.dailyLimitSats } : {}),
      ...(body.data.name !== undefined ? { name: body.data.name || null } : {}),
      ...(body.data.note !== undefined ? { note: body.data.note || null } : {}),
    })
    .where(eq(cardsTable.id, cardId))
    .returning({
      id: cardsTable.id,
      name: cardsTable.name,
      note: cardsTable.note,
      status: cardsTable.status,
      perTapLimitSats: cardsTable.perTapLimitSats,
      dailyLimitSats: cardsTable.dailyLimitSats,
      lastUsedAt: cardsTable.lastUsedAt,
      createdAt: cardsTable.createdAt,
    });

  if (!card) {
    res.status(404).json({ error: "Card not found" });
    return;
  }

  logger.info({ cardId, ...body.data }, "Bolt Card updated");
  res.json(card);
});

// ── POST /api/cards/:id/keys - View decrypted keys (PIN-gated) ──────────────
router.post("/cards/:id/keys", requireCardAccess, async (req, res): Promise<void> => {
  const cardId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { pin } = req.body as { pin?: string };

  if (!pin) {
    res.status(400).json({ error: "pin is required" });
    return;
  }

  // Verify PIN
  const { entityId } = req.auth!;
  let valid: boolean;
  try {
    valid = await verifyEntityPin(entityId, pin);
  } catch {
    res.status(404).json({ error: "Entity not found" });
    return;
  }
  if (!valid) {
    res.status(401).json({ error: "Incorrect PIN" });
    return;
  }

  const [card] = await db
    .select({ id: cardsTable.id, aesKey0: cardsTable.aesKey0, aesKey1: cardsTable.aesKey1, aesKey2: cardsTable.aesKey2, aesKey3: cardsTable.aesKey3, aesKey4: cardsTable.aesKey4 })
    .from(cardsTable)
    .where(eq(cardsTable.id, cardId));

  if (!card) { res.status(404).json({ error: "Card not found" }); return; }

  try {
    const k0 = decrypt(card.aesKey0);
    const k1 = decrypt(card.aesKey1);
    const k2 = decrypt(card.aesKey2);
    const k3 = decrypt(card.aesKey3);
    const k4 = decrypt(card.aesKey4);
    const lnurlwTemplate = `lnurlw://${DOMAIN}/card/${card.id}?p=00000000000000000000000000000000&c=0000000000000000`;
    logger.info({ cardId }, "Card keys accessed via PIN");
    res.json({ k0, k1, k2, k3, k4, lnurlwTemplate });
  } catch {
    res.status(500).json({ error: "Internal error decrypting keys" });
  }
});

// ── POST /api/cards/:id/wipe - Generate wipe payload (PIN-gated) ────────────
//
// Returns the current AES keys as a wipe_bolt_card_response JSON payload so the
// Bolt Card NFC Creator app can authenticate to the chip and reset it to factory
// defaults. Keys are rotated atomically in the DB at the same time - so the old
// keys are single-use even if the QR is never scanned.
//
// The QR in the frontend must encode the JSON string directly (not a URL).
// The Bolt Card Creator's Reset tab expects JSON in the QR, not an HTTP URL.
router.post("/cards/:id/wipe", requireCardAccess, async (req, res): Promise<void> => {
  const cardId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { pin } = req.body as { pin?: string };

  if (!pin) {
    res.status(400).json({ error: "pin is required" });
    return;
  }

  // Verify PIN
  const { entityId } = req.auth!;
  let validWipe: boolean;
  try {
    validWipe = await verifyEntityPin(entityId, pin);
  } catch {
    res.status(404).json({ error: "Entity not found" });
    return;
  }
  if (!validWipe) {
    res.status(401).json({ error: "Incorrect PIN" });
    return;
  }

  // Load current card to decrypt existing keys
  const [card] = await db
    .select({ aesKey0: cardsTable.aesKey0, aesKey1: cardsTable.aesKey1, aesKey2: cardsTable.aesKey2, aesKey3: cardsTable.aesKey3, aesKey4: cardsTable.aesKey4 })
    .from(cardsTable)
    .where(eq(cardsTable.id, cardId));

  if (!card) { res.status(404).json({ error: "Card not found" }); return; }

  let k0: string, k1: string, k2: string, k3: string, k4: string;
  try {
    k0 = decrypt(card.aesKey0);
    k1 = decrypt(card.aesKey1);
    k2 = decrypt(card.aesKey2);
    k3 = decrypt(card.aesKey3);
    k4 = decrypt(card.aesKey4);
  } catch {
    res.status(500).json({ error: "Internal error decrypting keys" });
    return;
  }

  // Issue a fresh provision token but DO NOT rotate the AES keys.
  // The wipe payload must contain the keys currently programmed on the physical
  // chip - if we rotate here the chip still has the old keys and authentication
  // will fail with 91ae. Key rotation happens automatically when the chip is
  // re-provisioned via the new provision URL (the provision endpoint writes
  // whatever keys are in the DB at that point back onto the chip).
  const newProvisionToken = randomBytes(24).toString("hex");
  const newProvisionTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.update(cardsTable).set({
    counter: 0,
    uid: null,
    pendingK1: null,
    pendingK1ExpiresAt: null,
    provisionToken: newProvisionToken,
    provisionTokenExpiresAt: newProvisionTokenExpiresAt,
    wipeToken: null,
    wipeTokenExpiresAt: null,
  }).where(eq(cardsTable.id, cardId));

  logger.info({ cardId }, "Card wipe payload issued - provision token ready (keys unchanged)");

  res.json({
    wipeKeys: {
      protocol_name: "wipe_bolt_card_response",
      protocol_version: 1,
      version: 1,
      action: "wipe",
      k0, k1, k2, k3, k4,
    },
    newProvisionUrl: `https://${DOMAIN}/api/provision/${newProvisionToken}`,
  });
});

// ── PUT /api/cards/:id/pin - Set / change / remove card tap-PIN (LUD-21) ────
router.put("/cards/:id/pin", requireCardAccess, async (req, res): Promise<void> => {
  const cardId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const body = SetCardPinBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  // `pin` = current card PIN (required when card already has one); `newPin` = replacement (null = remove)
  // pinLimitMsats semantics: null = always required; 0 = always required; >0 = threshold in msats
  const { pin, newPin, pinLimitMsats } = body.data;

  // Load current pinHash to check if PIN change requires current PIN
  const [card] = await db
    .select({ pinHash: cardsTable.pinHash })
    .from(cardsTable)
    .where(eq(cardsTable.id, cardId));

  if (!card) {
    res.status(404).json({ error: "Card not found" });
    return;
  }

  // If card already has a PIN, require current PIN before changing/removing
  if (card.pinHash) {
    if (!pin) {
      res.status(400).json({ error: "Current card PIN required to change or remove PIN" });
      return;
    }
    const valid = await bcrypt.compare(pin, card.pinHash);
    if (!valid) {
      res.status(401).json({ error: "Incorrect current card PIN" });
      return;
    }
  }

  // Compute new pinHash (null = remove PIN)
  const newPinHash = newPin != null ? await bcrypt.hash(newPin, 10) : null;

  // Update - also update pinLimitMsats if provided
  const updatePayload: Partial<typeof cardsTable.$inferInsert> = {
    pinHash: newPinHash,
    pinFailCount: 0,
    pinLockedAt: null,
  };
  if (pinLimitMsats !== undefined) {
    updatePayload.pinLimitMsats = pinLimitMsats ?? null;
  }

  const [updated] = await db
    .update(cardsTable)
    .set(updatePayload)
    .where(eq(cardsTable.id, cardId))
    .returning({ pinHash: cardsTable.pinHash, pinLimitMsats: cardsTable.pinLimitMsats });

  logger.info({ cardId, pinEnabled: newPinHash != null }, "Card tap-PIN updated");
  res.json({
    pinEnabled: updated.pinHash != null,
    pinLimitMsats: updated.pinLimitMsats ?? null,
  });
});

// ── PUT /api/cards/:id/pin/limit - Update PIN amount threshold only ──────────
router.put("/cards/:id/pin/limit", requireCardAccess, async (req, res): Promise<void> => {
  const cardId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const body = SetCardPinLimitBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  // null = always required (same as 0 on the LUD-21 wire); >0 = threshold in msats
  const { pinLimitMsats } = body.data;

  const [updated] = await db
    .update(cardsTable)
    .set({ pinLimitMsats: pinLimitMsats ?? null })
    .where(eq(cardsTable.id, cardId))
    .returning({ pinEnabled: cardsTable.pinHash, pinLimitMsats: cardsTable.pinLimitMsats });

  if (!updated) {
    res.status(404).json({ error: "Card not found" });
    return;
  }

  logger.info({ cardId, pinLimitMsats }, "Card PIN limit updated");
  res.json({ pinLimitMsats: updated.pinLimitMsats ?? null });
});

// ── PUT /api/cards/:id/pin/unlock - Unlock a PIN-locked card (entity PIN) ────
router.put("/cards/:id/pin/unlock", requireCardAccess, async (req, res): Promise<void> => {
  const cardId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const body = UnlockCardPinBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { entityId } = req.auth!;
  let valid: boolean;
  try {
    valid = await verifyEntityPin(entityId, body.data.entityPin);
  } catch {
    res.status(404).json({ error: "Entity not found" });
    return;
  }

  if (!valid) {
    res.status(401).json({ error: "Incorrect entity PIN" });
    return;
  }

  const [updated] = await db
    .update(cardsTable)
    .set({ pinLockedAt: null, pinFailCount: 0 })
    .where(eq(cardsTable.id, cardId))
    .returning({ id: cardsTable.id });

  if (!updated) {
    res.status(404).json({ error: "Card not found" });
    return;
  }

  logger.info({ cardId, entityId }, "Card PIN lock cleared");
  res.json({ pinLocked: false });
});

// ── DELETE /api/cards/:id - Deactivate (cancel) card ────────────────────────
router.delete("/cards/:id", requireCardAccess, async (req, res): Promise<void> => {
  const cardId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [card] = await db
    .update(cardsTable)
    .set({ status: "cancelled" })
    .where(and(eq(cardsTable.id, cardId)))
    .returning({ id: cardsTable.id, status: cardsTable.status });

  if (!card) {
    res.status(404).json({ error: "Card not found" });
    return;
  }

  logger.info({ cardId }, "Bolt Card cancelled");
  res.json({ id: card.id, status: card.status });
});

export default router;
