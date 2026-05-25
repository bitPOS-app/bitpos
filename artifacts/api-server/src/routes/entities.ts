import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { entitiesTable, accountsTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { signToken } from "../lib/auth";
import { requireAuth } from "../middleware/auth";
import { createSubWallet } from "../lib/albyHub";
import { encrypt } from "../lib/encrypt";
import { RegisterBody, ActivateBusinessBody } from "@workspace/api-zod";
import { DOMAIN } from "../lib/domain";

const router: IRouter = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireUuid(raw: string | string[] | undefined): string | null {
  const val = Array.isArray(raw) ? raw[0] : raw;
  return val && UUID_RE.test(val) ? val : null;
}

// POST /entities - create entity + account (signup)
router.post("/entities", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { email, handle, pin } = parsed.data;

  // Block reserved system handle prefixes to prevent bank account impersonation
  if (handle.startsWith("_")) {
    res.status(400).json({ error: "Handle cannot start with underscore (reserved)" });
    return;
  }

  const [existing] = await db
    .select({ id: entitiesTable.id })
    .from(entitiesTable)
    .where(or(eq(entitiesTable.email, email), eq(entitiesTable.handle, handle.toLowerCase())));

  if (existing) { res.status(409).json({ error: "Email or handle already taken" }); return; }

  const pinHash = await bcrypt.hash(pin, 12);

  const [entity] = await db
    .insert(entitiesTable)
    .values({ email, handle: handle.toLowerCase(), pinHash })
    .returning();

  // Attempt to provision an Alby Hub sub-wallet (optional - requires ALBY_HUB_URL + ALBY_HUB_ACCESS_TOKEN)
  let encryptedNwcUrl: string | null = null;
  try {
    const subWallet = await createSubWallet(entity.handle);
    if (subWallet) {
      encryptedNwcUrl = encrypt(subWallet.nwcUrl);
    }
  } catch (err) {
    req.log.warn({ err, entityId: entity.id }, "Sub-wallet creation failed - continuing with main node");
  }

  const [account] = await db
    .insert(accountsTable)
    .values({ entityId: entity.id, type: "personal", albySubWalletNwcUrl: encryptedNwcUrl })
    .returning();

  const token = signToken({ entityId: entity.id, accountId: account.id });

  req.log.info({ entityId: entity.id, hasSubWallet: Boolean(encryptedNwcUrl) }, "Entity registered");

  res.status(201).json({
    token,
    entity: {
      id: entity.id,
      email: entity.email,
      handle: entity.handle,
      lightningAddress: `${entity.handle}@${DOMAIN}`,
      createdAt: entity.createdAt,
    },
    account: {
      id: account.id,
      type: account.type,
      businessName: account.businessName,
      businessActive: account.businessActive,
      balanceSats: account.balanceSats,
    },
  });
});

// GET /entities/:id - get entity info (own entity only)
router.get("/entities/:id", requireAuth, async (req, res): Promise<void> => {
  const entityId = requireUuid(req.params.id);
  if (!entityId) { res.status(400).json({ error: "Invalid entity id" }); return; }

  if (req.auth!.entityId !== entityId) { res.status(403).json({ error: "Forbidden" }); return; }

  const [entity] = await db
    .select()
    .from(entitiesTable)
    .where(eq(entitiesTable.id, entityId));

  if (!entity) { res.status(404).json({ error: "Entity not found" }); return; }

  const [account] = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.entityId, entity.id));

  res.json({
    entity: {
      id: entity.id,
      email: entity.email,
      handle: entity.handle,
      phone: entity.phone,
      phoneVerified: entity.phoneVerified,
      lightningAddress: `${entity.handle}@${DOMAIN}`,
      createdAt: entity.createdAt,
    },
    account: account
      ? {
          id: account.id,
          type: account.type,
          businessName: account.businessName,
          businessActive: account.businessActive,
          balanceSats: account.balanceSats,
          createdAt: account.createdAt,
        }
      : null,
  });
});

// POST /entities/:id/business - activate business profile
router.post("/entities/:id/business", requireAuth, async (req, res): Promise<void> => {
  const entityId = requireUuid(req.params.id);
  if (!entityId) { res.status(400).json({ error: "Invalid entity id" }); return; }

  if (req.auth!.entityId !== entityId) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = ActivateBusinessBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [account] = await db
    .update(accountsTable)
    .set({ businessName: parsed.data.businessName, businessActive: true })
    .where(eq(accountsTable.entityId, entityId))
    .returning();

  if (!account) { res.status(404).json({ error: "Account not found" }); return; }

  req.log.info({ entityId, businessName: account.businessName }, "Business profile activated via entity route");

  res.json({
    id: account.id,
    type: account.type,
    businessName: account.businessName,
    businessActive: account.businessActive,
    balanceSats: account.balanceSats,
  });
});

export default router;
