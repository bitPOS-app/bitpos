import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import {
  entitiesTable,
  accountsTable,
  cardsTable,
  transactionsTable,
  pendingInvoicesTable,
  swapsTable,
} from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { verifyEntityPin } from "../lib/verify-pin";
import { signToken, signRefreshToken, verifyToken } from "../lib/auth";
import { requireAuth } from "../middleware/auth";
import { createSubWallet } from "../lib/nwc";
import { encrypt } from "../lib/encrypt";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import { DOMAIN } from "../lib/domain";
import { maskEmail } from "../lib/mask";
import { verifyTotp, matchAndConsumeRecoveryCode } from "../lib/totp";

const router: IRouter = Router();

type EntityRow = typeof entitiesTable.$inferSelect;

/** Standard entity payload returned to clients (includes security status). */
function entityInfo(entity: EntityRow) {
  return {
    id: entity.id,
    email: entity.email,
    handle: entity.handle,
    phone: entity.phone,
    phoneVerified: entity.phoneVerified,
    lightningAddress: `${entity.handle}@${DOMAIN}`,
    createdAt: entity.createdAt,
    totpEnabled: entity.totpEnabled,
    recoveryEmail: maskEmail(entity.recoveryEmail),
    recoveryEmailVerified: Boolean(entity.recoveryEmailVerifiedAt),
    pinUpgradeRequired: !entity.pinUpgraded,
  };
}

const REFRESH_COOKIE = "bitpos_refresh";
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: "/",
};

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function setRefreshCookie(res: import("express").Response, entityId: string, accountId: string) {
  const refreshToken = signRefreshToken({ entityId, accountId });
  res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTS);
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, handle, pin } = parsed.data;

  if (!/^\d{6}$/.test(pin)) {
    res.status(400).json({ error: "PIN must be exactly 6 digits" });
    return;
  }

  if (handle.startsWith("_")) {
    res.status(400).json({ error: "Handle cannot start with underscore (reserved)" });
    return;
  }

  const [existing] = await db
    .select({ id: entitiesTable.id })
    .from(entitiesTable)
    .where(or(eq(entitiesTable.email, email), eq(entitiesTable.handle, handle.toLowerCase())));

  if (existing) {
    res.status(409).json({ error: "Email or handle already taken" });
    return;
  }

  const pinHash = await bcrypt.hash(pin, 12);

  const [entity] = await db
    .insert(entitiesTable)
    .values({ email, handle: handle.toLowerCase(), pinHash, pinUpgraded: true })
    .returning();

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
  setRefreshCookie(res, entity.id, account.id);

  req.log.info({ entityId: entity.id, hasSubWallet: Boolean(encryptedNwcUrl) }, "New entity registered");

  res.status(201).json({
    token,
    entity: entityInfo(entity),
    account: {
      id: account.id,
      type: account.type,
      businessName: account.businessName,
      businessActive: account.businessActive,
      balanceSats: account.balanceSats,
      currency: account.currency,
    },
  });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { handle, pin } = parsed.data;

  const [entity] = await db
    .select()
    .from(entitiesTable)
    .where(eq(entitiesTable.handle, handle.toLowerCase()));

  if (!entity) {
    res.status(401).json({ error: "Invalid handle or PIN" });
    return;
  }

  // ── Account lockout check ─────────────────────────────────────────────────
  if (entity.loginLockedUntil && entity.loginLockedUntil > new Date()) {
    const retryAfterMin = Math.ceil((entity.loginLockedUntil.getTime() - Date.now()) / 60_000);
    req.log.warn({ entityId: entity.id }, "Login attempt on locked account");
    res.status(429).json({ error: `Account locked after too many failed attempts. Try again in ${retryAfterMin} minute(s).` });
    return;
  }

  const valid = await bcrypt.compare(pin, entity.pinHash);
  if (!valid) {
    const newFailCount = entity.loginFailCount + 1;
    if (newFailCount >= LOGIN_MAX_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + LOGIN_LOCKOUT_MS);
      await db
        .update(entitiesTable)
        .set({ loginFailCount: newFailCount, loginLockedUntil: lockedUntil })
        .where(eq(entitiesTable.id, entity.id));
      req.log.warn({ entityId: entity.id, handle }, "Account locked after too many failed login attempts");
      res.status(429).json({ error: "Too many failed attempts. Account locked for 15 minutes." });
    } else {
      await db
        .update(entitiesTable)
        .set({ loginFailCount: newFailCount })
        .where(eq(entitiesTable.id, entity.id));
      res.status(401).json({ error: "Invalid handle or PIN" });
    }
    return;
  }

  // PIN correct - enforce second factor when TOTP is enabled
  if (entity.totpEnabled) {
    const rawCode = (req.body as { totpCode?: unknown }).totpCode;
    const totpCode = typeof rawCode === "string" ? rawCode.trim() : "";
    if (!totpCode) {
      res.status(401).json({ error: "Two-factor code required", totpRequired: true });
      return;
    }

    let secondFactorOk = entity.totpSecret ? await verifyTotp(totpCode, entity.totpSecret) : false;

    // Fall back to a single-use recovery code
    if (!secondFactorOk && entity.totpRecoveryCodes) {
      let hashes: string[] = [];
      try { hashes = JSON.parse(entity.totpRecoveryCodes) as string[]; } catch { hashes = []; }
      const { matched, remainingHashes } = await matchAndConsumeRecoveryCode(hashes, totpCode);
      if (matched) {
        secondFactorOk = true;
        await db
          .update(entitiesTable)
          .set({ totpRecoveryCodes: JSON.stringify(remainingHashes) })
          .where(eq(entitiesTable.id, entity.id));
      }
    }

    if (!secondFactorOk) {
      const newFailCount = entity.loginFailCount + 1;
      if (newFailCount >= LOGIN_MAX_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + LOGIN_LOCKOUT_MS);
        await db
          .update(entitiesTable)
          .set({ loginFailCount: newFailCount, loginLockedUntil: lockedUntil })
          .where(eq(entitiesTable.id, entity.id));
        req.log.warn({ entityId: entity.id, handle }, "Account locked after too many failed two-factor attempts");
        res.status(429).json({ error: "Too many failed attempts. Account locked for 15 minutes." });
        return;
      }
      await db
        .update(entitiesTable)
        .set({ loginFailCount: newFailCount })
        .where(eq(entitiesTable.id, entity.id));
      res.status(401).json({ error: "Invalid two-factor code", totpRequired: true });
      return;
    }
  }

  // Successful login - reset fail counter and lockout
  await db
    .update(entitiesTable)
    .set({ loginFailCount: 0, loginLockedUntil: null })
    .where(eq(entitiesTable.id, entity.id));

  const [account] = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.entityId, entity.id));

  if (!account) {
    res.status(500).json({ error: "Account not found" });
    return;
  }

  const token = signToken({ entityId: entity.id, accountId: account.id });
  setRefreshCookie(res, entity.id, account.id);

  req.log.info({ entityId: entity.id }, "Entity logged in");

  res.json({
    token,
    entity: entityInfo(entity),
    account: {
      id: account.id,
      type: account.type,
      businessName: account.businessName,
      businessActive: account.businessActive,
      balanceSats: account.balanceSats,
      currency: account.currency,
    },
  });
});

router.post("/auth/refresh", async (req, res): Promise<void> => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE];
  if (!refreshToken) {
    res.status(401).json({ error: "No refresh token" });
    return;
  }

  let payload: { entityId: string; accountId: string; type?: string };
  try {
    payload = verifyToken(refreshToken) as typeof payload;
    if (payload.type !== "refresh") throw new Error("Not a refresh token");
  } catch {
    res.clearCookie(REFRESH_COOKIE, { path: "/" });
    res.status(401).json({ error: "Invalid or expired refresh token" });
    return;
  }

  const [entity] = await db.select().from(entitiesTable).where(eq(entitiesTable.id, payload.entityId));
  const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, payload.accountId));

  if (!entity || !account) {
    res.clearCookie(REFRESH_COOKIE, { path: "/" });
    res.status(401).json({ error: "Account not found" });
    return;
  }

  const token = signToken({ entityId: entity.id, accountId: account.id });
  setRefreshCookie(res, entity.id, account.id);

  res.json({
    token,
    entity: entityInfo(entity),
    account: {
      id: account.id,
      type: account.type,
      businessName: account.businessName,
      businessActive: account.businessActive,
      balanceSats: account.balanceSats,
      currency: account.currency,
      createdAt: account.createdAt,
    },
  });
});

router.post("/auth/logout", (_req, res): void => {
  res.clearCookie(REFRESH_COOKIE, { path: "/" });
  res.json({ ok: true });
});

router.post("/auth/verify-pin", requireAuth, async (req, res): Promise<void> => {
  const { pin } = req.body as { pin?: string };
  if (!pin) {
    res.status(400).json({ error: "pin is required" });
    return;
  }

  const { entityId } = req.auth!;
  try {
    const valid = await verifyEntityPin(entityId, pin);
    res.json({ valid });
  } catch {
    res.status(404).json({ error: "Entity not found" });
  }
});

router.post("/auth/change-pin", requireAuth, async (req, res): Promise<void> => {
  const { currentPin, newPin } = req.body as { currentPin?: string; newPin?: string };
  if (!currentPin || !newPin || !/^\d{6}$/.test(newPin)) {
    res.status(400).json({ error: "currentPin and a 6-digit newPin are required" });
    return;
  }

  const { entityId } = req.auth!;
  const [entity] = await db.select().from(entitiesTable).where(eq(entitiesTable.id, entityId));
  if (!entity) { res.status(404).json({ error: "Entity not found" }); return; }

  const valid = await bcrypt.compare(currentPin, entity.pinHash);
  if (!valid) { res.status(401).json({ error: "Current PIN is incorrect" }); return; }

  const newHash = await bcrypt.hash(newPin, 12);
  await db
    .update(entitiesTable)
    .set({ pinHash: newHash, pinUpgraded: true })
    .where(eq(entitiesTable.id, entityId));

  res.json({ ok: true });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const { entityId, accountId } = req.auth!;

  const [entity] = await db.select().from(entitiesTable).where(eq(entitiesTable.id, entityId));
  const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId));

  if (!entity || !account) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json({
    entity: entityInfo(entity),
    account: {
      id: account.id,
      type: account.type,
      businessName: account.businessName,
      businessActive: account.businessActive,
      balanceSats: account.balanceSats,
      currency: account.currency,
      createdAt: account.createdAt,
    },
  });
});

// PATCH /auth/currency - update the merchant display currency (lowercase code).
// Source of truth for both the web app and the posBOX device.
router.patch("/auth/currency", requireAuth, async (req, res): Promise<void> => {
  const raw = (req.body as { currency?: unknown })?.currency;
  if (typeof raw !== "string") {
    res.status(400).json({ error: "currency is required" });
    return;
  }

  const currency = raw.trim().toLowerCase();
  if (!/^[a-z]{3,5}$/.test(currency)) {
    res.status(400).json({ error: "Invalid currency code" });
    return;
  }

  const { accountId } = req.auth!;

  const [updated] = await db
    .update(accountsTable)
    .set({ currency })
    .where(eq(accountsTable.id, accountId))
    .returning({ currency: accountsTable.currency });

  if (!updated) { res.status(404).json({ error: "Account not found" }); return; }

  req.log.info({ accountId, currency }, "Account currency updated");
  res.json({ currency: updated.currency });
});

// PATCH /auth/handle - update username (must be unique, 3-20 alphanumeric/underscore)
router.patch("/auth/handle", requireAuth, async (req, res): Promise<void> => {
  const { handle } = req.body as { handle?: string };
  if (!handle || typeof handle !== "string") {
    res.status(400).json({ error: "handle is required" });
    return;
  }

  const newHandle = handle.trim().toLowerCase();

  if (!/^[a-z0-9][a-z0-9_]{2,19}$/.test(newHandle)) {
    res.status(400).json({ error: "Handle must be 3–20 characters (letters, numbers, underscores) and not start with underscore" });
    return;
  }

  if (newHandle.startsWith("_")) {
    res.status(400).json({ error: "Handle cannot start with underscore (reserved)" });
    return;
  }

  const { entityId } = req.auth!;

  const [existing] = await db
    .select({ id: entitiesTable.id })
    .from(entitiesTable)
    .where(eq(entitiesTable.handle, newHandle));

  if (existing && existing.id !== entityId) {
    res.status(409).json({ error: "Username already taken" });
    return;
  }

  const [updated] = await db
    .update(entitiesTable)
    .set({ handle: newHandle })
    .where(eq(entitiesTable.id, entityId))
    .returning({ handle: entitiesTable.handle });

  if (!updated) { res.status(404).json({ error: "Entity not found" }); return; }

  req.log.info({ entityId, newHandle }, "Entity handle updated");
  res.json({ handle: updated.handle });
});

// DELETE /auth/account - permanently delete the entity + all associated data (PIN-protected)
router.delete("/auth/account", requireAuth, async (req, res): Promise<void> => {
  const { pin } = req.body as { pin?: string };
  if (!pin) {
    res.status(400).json({ error: "pin is required" });
    return;
  }

  const { entityId, accountId } = req.auth!;

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

  // Delete child rows first (FK order), then the entity itself
  await db.delete(cardsTable).where(eq(cardsTable.accountId, accountId));
  await db.delete(pendingInvoicesTable).where(eq(pendingInvoicesTable.accountId, accountId));
  await db.delete(swapsTable).where(eq(swapsTable.accountId, accountId));
  await db.delete(transactionsTable).where(eq(transactionsTable.accountId, accountId));
  await db.delete(accountsTable).where(eq(accountsTable.id, accountId));
  await db.delete(entitiesTable).where(eq(entitiesTable.id, entityId));

  req.log.info({ entityId, accountId }, "Entity and account permanently deleted");

  res.clearCookie(REFRESH_COOKIE, { path: "/" });
  res.json({ ok: true });
});

export default router;
