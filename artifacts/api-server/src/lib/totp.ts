/**
 * TOTP (RFC 6238) two-factor helpers plus single-use recovery codes.
 * Backed by otplib's authenticator (SHA-1, 6 digits, 30s step).
 */
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { generateSecret, generateURI, verify } from "otplib";

const ISSUER = "bitPOS";

// Allow one 30s step of clock drift in each direction.
const EPOCH_TOLERANCE_SECONDS = 30;

export function generateTotpSecret(): string {
  return generateSecret();
}

/** otpauth:// URI for authenticator apps / QR codes. */
export function totpKeyUri(handle: string, secret: string): string {
  return generateURI({ issuer: ISSUER, label: handle, secret });
}

export async function verifyTotp(token: string, secret: string): Promise<boolean> {
  try {
    const result = await verify({
      token: token.replace(/\s+/g, ""),
      secret,
      epochTolerance: EPOCH_TOLERANCE_SECONDS,
    });
    return result.valid;
  } catch {
    return false;
  }
}

const RECOVERY_CODE_COUNT = 10;

/** Generate plaintext recovery codes in the form `xxxxx-xxxxx`. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(5).toString("hex"); // 10 hex chars
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

function normalizeRecoveryCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function hashRecoveryCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((c) => bcrypt.hash(normalizeRecoveryCode(c), 10)));
}

/**
 * Check a submitted recovery code against the stored hashes. On a match,
 * returns the remaining hashes (with the used one removed) so the caller can
 * persist the consumption.
 */
export async function matchAndConsumeRecoveryCode(
  storedHashes: string[],
  input: string,
): Promise<{ matched: boolean; remainingHashes: string[] }> {
  const normalized = normalizeRecoveryCode(input);
  for (let i = 0; i < storedHashes.length; i++) {
    if (await bcrypt.compare(normalized, storedHashes[i])) {
      const remainingHashes = storedHashes.filter((_, idx) => idx !== i);
      return { matched: true, remainingHashes };
    }
  }
  return { matched: false, remainingHashes: storedHashes };
}
