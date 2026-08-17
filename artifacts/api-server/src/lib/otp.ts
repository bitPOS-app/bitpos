/**
 * Emailed one-time codes for recovery flows (recovery-email verification and
 * account recovery). Codes are 6 digits, stored bcrypt-hashed, single-use,
 * expire after 10 minutes, capped at a few verification attempts, and
 * rate-limited per entity+purpose to prevent email spam.
 */
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db, otpCodesTable } from "@workspace/db";
import { and, eq, isNull, desc } from "drizzle-orm";

export type OtpPurpose = "recovery_email_verify" | "account_recovery";

export const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

function randomSixDigits(): string {
  // 0 - 999999, zero-padded to 6 digits
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * Issue a fresh OTP for the given entity + purpose, invalidating any prior
 * un-consumed codes. Returns the plaintext code (to be emailed) or null when a
 * recently-issued code is still within the resend cooldown.
 */
export async function issueOtp(
  entityId: string,
  purpose: OtpPurpose,
  email: string,
): Promise<string | null> {
  const [recent] = await db
    .select({ createdAt: otpCodesTable.createdAt })
    .from(otpCodesTable)
    .where(and(eq(otpCodesTable.entityId, entityId), eq(otpCodesTable.purpose, purpose)))
    .orderBy(desc(otpCodesTable.createdAt))
    .limit(1);

  if (recent && Date.now() - recent.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    return null;
  }

  // Invalidate any outstanding codes for this entity+purpose
  await db
    .update(otpCodesTable)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(otpCodesTable.entityId, entityId),
        eq(otpCodesTable.purpose, purpose),
        isNull(otpCodesTable.consumedAt),
      ),
    );

  const code = randomSixDigits();
  const codeHash = await bcrypt.hash(code, 10);

  await db.insert(otpCodesTable).values({
    entityId,
    purpose,
    email,
    codeHash,
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  });

  return code;
}

export type VerifyOtpResult =
  | { ok: true; email: string }
  | { ok: false; reason: "no_code" | "expired" | "too_many_attempts" | "mismatch" };

/**
 * Verify a submitted OTP for the given entity + purpose. Consumes the code on
 * success or when the attempt cap is hit.
 */
export async function verifyOtp(
  entityId: string,
  purpose: OtpPurpose,
  code: string,
): Promise<VerifyOtpResult> {
  const [row] = await db
    .select()
    .from(otpCodesTable)
    .where(
      and(
        eq(otpCodesTable.entityId, entityId),
        eq(otpCodesTable.purpose, purpose),
        isNull(otpCodesTable.consumedAt),
      ),
    )
    .orderBy(desc(otpCodesTable.createdAt))
    .limit(1);

  if (!row) return { ok: false, reason: "no_code" };

  if (row.expiresAt.getTime() < Date.now()) {
    await db.update(otpCodesTable).set({ consumedAt: new Date() }).where(eq(otpCodesTable.id, row.id));
    return { ok: false, reason: "expired" };
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    await db.update(otpCodesTable).set({ consumedAt: new Date() }).where(eq(otpCodesTable.id, row.id));
    return { ok: false, reason: "too_many_attempts" };
  }

  const matches = await bcrypt.compare(code, row.codeHash);
  if (!matches) {
    await db
      .update(otpCodesTable)
      .set({ attempts: row.attempts + 1 })
      .where(eq(otpCodesTable.id, row.id));
    return { ok: false, reason: "mismatch" };
  }

  await db.update(otpCodesTable).set({ consumedAt: new Date() }).where(eq(otpCodesTable.id, row.id));
  return { ok: true, email: row.email };
}
