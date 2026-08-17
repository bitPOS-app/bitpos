import { Router, type IRouter } from "express";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { entitiesTable, accountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { DOMAIN } from "../lib/domain";

const router: IRouter = Router();

const MAEKOB_SHARED_SECRET = process.env.MAEKOB_SHARED_SECRET;
const MAEKOB_EMBED_URL = process.env.MAEKOB_EMBED_URL ?? "https://maekob.com/embed";
const EMBED_TOKEN_TTL_SECONDS = 8 * 60;

router.post("/shop/embed-token", requireAuth, async (req, res): Promise<void> => {
  if (!MAEKOB_SHARED_SECRET) {
    res.status(503).json({ error: "Card shop is not configured (missing MAEKOB_SHARED_SECRET)" });
    return;
  }

  const { entityId, accountId } = req.auth!;

  const [entity] = await db
    .select({ handle: entitiesTable.handle, email: entitiesTable.email })
    .from(entitiesTable)
    .where(eq(entitiesTable.id, entityId));

  const [account] = await db
    .select({ businessName: accountsTable.businessName, type: accountsTable.type })
    .from(accountsTable)
    .where(eq(accountsTable.id, accountId));

  if (!entity || !account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: "bitpos",
    sub: entityId,
    handle: entity.handle,
    email: entity.email,
    lightningAddress: `${entity.handle}@${DOMAIN}`,
    businessName: account.businessName ?? null,
    accountType: account.type,
    iat: now,
    exp: now + EMBED_TOKEN_TTL_SECONDS,
  };

  const token = jwt.sign(payload, MAEKOB_SHARED_SECRET, { algorithm: "HS256" });
  const embedUrl = `${MAEKOB_EMBED_URL}?token=${encodeURIComponent(token)}`;

  res.json({ token, embedUrl });
});

export default router;
