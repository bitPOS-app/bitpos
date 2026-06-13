import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, entitiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { signRecoveryToken, verifyRecoveryToken } from "../lib/auth";
import { maskEmail } from "../lib/mask";
import { sendEmail } from "../lib/email";
import { issueOtp, verifyOtp } from "../lib/otp";
import {
  generateTotpSecret,
  totpKeyUri,
  verifyTotp,
  generateRecoveryCodes,
  hashRecoveryCodes,
} from "../lib/totp";

const router: IRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIX_DIGITS_RE = /^\d{6}$/;

function otpFailureMessage(reason: string): string {
  switch (reason) {
    case "expired":
      return "That code has expired. Request a new one.";
    case "too_many_attempts":
      return "Too many incorrect attempts. Request a new code.";
    case "no_code":
      return "No active code. Request a new one.";
    default:
      return "Incorrect code.";
  }
}

// ── TOTP two-factor ──────────────────────────────────────────────────────────

// Begin TOTP enrollment: generate a pending secret + provisioning URI.
router.post("/auth/totp/setup", requireAuth, async (req, res): Promise<void> => {
  const { entityId } = req.auth!;
  const [entity] = await db.select().from(entitiesTable).where(eq(entitiesTable.id, entityId));
  if (!entity) { res.status(404).json({ error: "Entity not found" }); return; }
  if (entity.totpEnabled) { res.status(400).json({ error: "Two-factor is already enabled" }); return; }

  const secret = generateTotpSecret();
  await db.update(entitiesTable).set({ totpSecret: secret }).where(eq(entitiesTable.id, entityId));

  res.json({ secret, otpauthUrl: totpKeyUri(entity.handle, secret) });
});

// Confirm the first code and enable TOTP; returns one-time recovery codes.
router.post("/auth/totp/enable", requireAuth, async (req, res): Promise<void> => {
  const { code } = req.body as { code?: string };
  if (!code) { res.status(400).json({ error: "code is required" }); return; }

  const { entityId } = req.auth!;
  const [entity] = await db.select().from(entitiesTable).where(eq(entitiesTable.id, entityId));
  if (!entity) { res.status(404).json({ error: "Entity not found" }); return; }
  if (entity.totpEnabled) { res.status(400).json({ error: "Two-factor is already enabled" }); return; }
  if (!entity.totpSecret) { res.status(400).json({ error: "Start two-factor setup first" }); return; }

  if (!(await verifyTotp(code, entity.totpSecret))) {
    res.status(400).json({ error: "Incorrect code. Check your authenticator app and try again." });
    return;
  }

  const recoveryCodes = generateRecoveryCodes();
  const hashes = await hashRecoveryCodes(recoveryCodes);

  await db
    .update(entitiesTable)
    .set({ totpEnabled: true, totpRecoveryCodes: JSON.stringify(hashes) })
    .where(eq(entitiesTable.id, entityId));

  req.log.info({ entityId }, "TOTP two-factor enabled");
  res.json({ recoveryCodes });
});

// Disable TOTP (PIN-protected).
router.post("/auth/totp/disable", requireAuth, async (req, res): Promise<void> => {
  const { pin } = req.body as { pin?: string };
  if (!pin) { res.status(400).json({ error: "pin is required" }); return; }

  const { entityId } = req.auth!;
  const [entity] = await db.select().from(entitiesTable).where(eq(entitiesTable.id, entityId));
  if (!entity) { res.status(404).json({ error: "Entity not found" }); return; }

  if (!(await bcrypt.compare(pin, entity.pinHash))) {
    res.status(401).json({ error: "Incorrect PIN" });
    return;
  }

  await db
    .update(entitiesTable)
    .set({ totpEnabled: false, totpSecret: null, totpRecoveryCodes: null })
    .where(eq(entitiesTable.id, entityId));

  req.log.info({ entityId }, "TOTP two-factor disabled");
  res.json({ ok: true });
});

// ── Recovery email (authenticated) ───────────────────────────────────────────

// Send an OTP to a candidate recovery email.
router.post("/auth/recovery-email/start", requireAuth, async (req, res): Promise<void> => {
  const raw = (req.body as { email?: unknown })?.email;
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) { res.status(400).json({ error: "A valid email is required" }); return; }

  const { entityId } = req.auth!;
  const code = await issueOtp(entityId, "recovery_email_verify", email);
  if (!code) {
    res.status(429).json({ error: "Please wait a moment before requesting another code." });
    return;
  }

  try {
    await sendEmail({
      to: email,
      subject: "Verify your bitPOS recovery email",
      text: `Your bitPOS recovery email verification code is ${code}. It expires in 10 minutes.`,
    });
  } catch (err) {
    req.log.error({ err, entityId }, "Failed to send recovery-email verification");
    res.status(502).json({ error: "Could not send the verification email. Try again shortly." });
    return;
  }

  res.json({ sent: true, emailHint: maskEmail(email) });
});

// Confirm the OTP and persist the verified recovery email.
router.post("/auth/recovery-email/verify", requireAuth, async (req, res): Promise<void> => {
  const { code } = req.body as { code?: string };
  if (!code) { res.status(400).json({ error: "code is required" }); return; }

  const { entityId } = req.auth!;
  const result = await verifyOtp(entityId, "recovery_email_verify", code);
  if (!result.ok) {
    res.status(400).json({ error: otpFailureMessage(result.reason) });
    return;
  }

  await db
    .update(entitiesTable)
    .set({ recoveryEmail: result.email, recoveryEmailVerifiedAt: new Date() })
    .where(eq(entitiesTable.id, entityId));

  req.log.info({ entityId }, "Recovery email verified");
  res.json({ ok: true, recoveryEmail: maskEmail(result.email) });
});

// Remove the recovery email (PIN-protected).
router.delete("/auth/recovery-email", requireAuth, async (req, res): Promise<void> => {
  const { pin } = req.body as { pin?: string };
  if (!pin) { res.status(400).json({ error: "pin is required" }); return; }

  const { entityId } = req.auth!;
  const [entity] = await db.select().from(entitiesTable).where(eq(entitiesTable.id, entityId));
  if (!entity) { res.status(404).json({ error: "Entity not found" }); return; }

  if (!(await bcrypt.compare(pin, entity.pinHash))) {
    res.status(401).json({ error: "Incorrect PIN" });
    return;
  }

  await db
    .update(entitiesTable)
    .set({ recoveryEmail: null, recoveryEmailVerifiedAt: null })
    .where(eq(entitiesTable.id, entityId));

  res.json({ ok: true });
});

// ── Account recovery (unauthenticated) ───────────────────────────────────────

// Email an OTP to the account's verified recovery email.
router.post("/auth/recovery/start", async (req, res): Promise<void> => {
  const rawHandle = (req.body as { handle?: unknown })?.handle;
  const handle = typeof rawHandle === "string" ? rawHandle.trim().toLowerCase() : "";
  if (!handle) { res.status(400).json({ error: "handle is required" }); return; }

  const [entity] = await db.select().from(entitiesTable).where(eq(entitiesTable.handle, handle));

  if (!entity || !entity.recoveryEmail || !entity.recoveryEmailVerifiedAt) {
    res.json({ sent: false, emailHint: null });
    return;
  }

  const code = await issueOtp(entity.id, "account_recovery", entity.recoveryEmail);
  if (!code) {
    res.status(429).json({ error: "Please wait a moment before requesting another code." });
    return;
  }

  try {
    await sendEmail({
      to: entity.recoveryEmail,
      subject: "Your bitPOS account recovery code",
      text: `Your bitPOS account recovery code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
    });
  } catch (err) {
    req.log.error({ err, entityId: entity.id }, "Failed to send account recovery email");
    res.status(502).json({ error: "Could not send the recovery email. Try again shortly." });
    return;
  }

  res.json({ sent: true, emailHint: maskEmail(entity.recoveryEmail) });
});

// Verify the recovery OTP and return a short-lived reset token.
router.post("/auth/recovery/verify", async (req, res): Promise<void> => {
  const rawHandle = (req.body as { handle?: unknown })?.handle;
  const handle = typeof rawHandle === "string" ? rawHandle.trim().toLowerCase() : "";
  const { code } = req.body as { code?: string };
  if (!handle || !code) { res.status(400).json({ error: "handle and code are required" }); return; }

  const [entity] = await db.select({ id: entitiesTable.id }).from(entitiesTable).where(eq(entitiesTable.handle, handle));
  if (!entity) { res.status(400).json({ error: "Incorrect code." }); return; }

  const result = await verifyOtp(entity.id, "account_recovery", code);
  if (!result.ok) {
    res.status(400).json({ error: otpFailureMessage(result.reason) });
    return;
  }

  res.json({ recoveryToken: signRecoveryToken(entity.id) });
});

// Reset the PIN with a valid recovery token; also clears 2FA and lockouts.
router.post("/auth/recovery/reset", async (req, res): Promise<void> => {
  const { recoveryToken, newPin } = req.body as { recoveryToken?: string; newPin?: string };
  if (!recoveryToken || !newPin) { res.status(400).json({ error: "recoveryToken and newPin are required" }); return; }
  if (!SIX_DIGITS_RE.test(newPin)) { res.status(400).json({ error: "PIN must be exactly 6 digits" }); return; }

  let entityId: string;
  try {
    ({ entityId } = verifyRecoveryToken(recoveryToken));
  } catch {
    res.status(401).json({ error: "Recovery session expired. Start again." });
    return;
  }

  const pinHash = await bcrypt.hash(newPin, 12);
  const [updated] = await db
    .update(entitiesTable)
    .set({
      pinHash,
      pinUpgraded: true,
      totpEnabled: false,
      totpSecret: null,
      totpRecoveryCodes: null,
      loginFailCount: 0,
      loginLockedUntil: null,
    })
    .where(eq(entitiesTable.id, entityId))
    .returning({ id: entitiesTable.id });

  if (!updated) { res.status(404).json({ error: "Account not found" }); return; }

  req.log.info({ entityId }, "PIN reset via account recovery");
  res.json({ ok: true });
});

export default router;
