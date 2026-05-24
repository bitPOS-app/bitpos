import { Request, Response, NextFunction } from "express";
import { verifyToken, JwtPayload } from "../lib/auth";

declare global {
  namespace Express {
    interface Request {
      auth?: JwtPayload;
    }
  }
}

/**
 * Sets req.auth if a valid Bearer token is present, but never blocks the request.
 * Use for endpoints that work for both authenticated users and anonymous callers
 * (e.g. OSS proxy calls that use X-BitPOS-Instance instead of JWT).
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

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const token = header.slice(7);
  try {
    req.auth = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
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
 * parameter instead of the default `:id`.  Use this when the route param is
 * named differently, e.g. `:accountId`.
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
