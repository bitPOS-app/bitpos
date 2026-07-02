import { Request, Response, NextFunction } from "express";
import { verifyToken, JwtPayload } from "../lib/auth";
import { db } from "@workspace/db";
import { deviceTokensTable, accountsTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      auth?: JwtPayload;
    }
  }
}

/**
 * Attempt to authenticate a raw device token (64-char hex string from device_tokens table).
 * Returns a JwtPayload-shaped object on success, null on failure.
 * Fire-and-forgets a lastUsedAt update.
 */
async function tryDeviceToken(rawToken: string): Promise<JwtPayload | null> {
  const [row] = await db
    .select({
      id:        deviceTokensTable.id,
      accountId: deviceTokensTable.accountId,
      entityId:  accountsTable.entityId,
    })
    .from(deviceTokensTable)
    .innerJoin(accountsTable, eq(accountsTable.id, deviceTokensTable.accountId))
    .where(and(
      eq(deviceTokensTable.token, rawToken),
      isNull(deviceTokensTable.revokedAt),
    ));

  if (!row) return null;

  // Fire-and-forget: update lastUsedAt without blocking the request
  db.update(deviceTokensTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(deviceTokensTable.id, row.id))
    .catch(() => { /* non-critical */ });

  return { entityId: row.entityId, accountId: row.accountId };
}

/**
 * Sets req.auth if a valid Bearer token is present, but never blocks the request.
 * Use for endpoints that work for both authenticated users and anonymous callers.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      req.auth = verifyToken(header.slice(7));
    } catch { /* ignore invalid token */ }
  }
  next();
}

/**
 * Requires a valid Bearer token — either a JWT or a long-lived device token.
 * Device tokens (64-char hex) are looked up in device_tokens table as a fallback.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const token = header.slice(7);

  // Fast path: try JWT first
  try {
    req.auth = verifyToken(token);
    next();
    return;
  } catch { /* fall through to device token check */ }

  // Slow path: device token (async — only raw 64-char hex strings are valid candidates)
  if (token.length !== 64 || !/^[0-9a-f]+$/.test(token)) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  tryDeviceToken(token).then((auth) => {
    if (!auth) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    req.auth = auth;
    next();
  }).catch(() => {
    res.status(401).json({ error: "Invalid or expired token" });
  });
}

export function requireAccountAccess(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!req.auth || req.auth.accountId !== rawId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  });
}

/**
 * Same as requireAccountAccess but reads the account ID from a named route
 * parameter instead of the default `:id`.
 */
export function requireAccountAccessByParam(
  paramName: string,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    requireAuth(req, res, () => {
      const raw = req.params[paramName];
      const rawId = Array.isArray(raw) ? raw[0] : raw;
      if (!req.auth || req.auth.accountId !== rawId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      next();
    });
  };
}
