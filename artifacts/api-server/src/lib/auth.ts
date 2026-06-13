import jwt from "jsonwebtoken";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required");
}

const JWT_SECRET = process.env.SESSION_SECRET;
const ACCESS_EXPIRY = "1h";
const REFRESH_EXPIRY = "30d";

export interface JwtPayload {
  entityId: string;
  accountId: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_EXPIRY });
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign({ ...payload, type: "refresh" }, JWT_SECRET, { expiresIn: REFRESH_EXPIRY });
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (typeof decoded !== "object" || !decoded) throw new Error("Invalid token");
  return decoded as JwtPayload;
}

const RECOVERY_EXPIRY = "10m";

/** Short-lived token proving recovery-email ownership, used to reset a PIN. */
export function signRecoveryToken(entityId: string): string {
  return jwt.sign({ entityId, type: "recovery" }, JWT_SECRET, { expiresIn: RECOVERY_EXPIRY });
}

export function verifyRecoveryToken(token: string): { entityId: string } {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (typeof decoded !== "object" || !decoded || (decoded as { type?: string }).type !== "recovery") {
    throw new Error("Invalid recovery token");
  }
  return { entityId: (decoded as { entityId: string }).entityId };
}
