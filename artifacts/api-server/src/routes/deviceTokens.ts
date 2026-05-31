import { Router, type IRouter } from "express";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import { deviceTokensTable } from "@workspace/db";
import { accountsTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireAccountAccess } from "../middleware/auth";

const router: IRouter = Router();

// POST /accounts/:id/device-tokens — issue a new device token (token returned only here)
router.post("/accounts/:id/device-tokens", requireAccountAccess, async (req, res): Promise<void> => {
  const accountId = req.params.id as string;
  const label: string = typeof req.body?.label === "string" && req.body.label.trim()
    ? req.body.label.trim().slice(0, 80)
    : "posBOX";

  const [account] = await db
    .select({ id: accountsTable.id })
    .from(accountsTable)
    .where(eq(accountsTable.id, accountId));

  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  const token = randomBytes(32).toString("hex");

  const [created] = await db
    .insert(deviceTokensTable)
    .values({ accountId, token, label })
    .returning({ id: deviceTokensTable.id, label: deviceTokensTable.label, createdAt: deviceTokensTable.createdAt });

  res.status(201).json({ id: created.id, token, label: created.label, createdAt: created.createdAt });
});

// GET /accounts/:id/device-tokens — list tokens (token value never returned)
router.get("/accounts/:id/device-tokens", requireAccountAccess, async (req, res): Promise<void> => {
  const accountId = req.params.id as string;

  const tokens = await db
    .select({
      id:         deviceTokensTable.id,
      label:      deviceTokensTable.label,
      lastUsedAt: deviceTokensTable.lastUsedAt,
      createdAt:  deviceTokensTable.createdAt,
    })
    .from(deviceTokensTable)
    .where(and(
      eq(deviceTokensTable.accountId, accountId),
      isNull(deviceTokensTable.revokedAt),
    ));

  res.json(tokens);
});

// DELETE /accounts/:id/device-tokens/:tokenId — revoke a token
router.delete("/accounts/:id/device-tokens/:tokenId", requireAccountAccess, async (req, res): Promise<void> => {
  const accountId = req.params.id as string;
  const tokenId = req.params.tokenId as string;

  const [updated] = await db
    .update(deviceTokensTable)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(deviceTokensTable.id, tokenId),
      eq(deviceTokensTable.accountId, accountId),
      isNull(deviceTokensTable.revokedAt),
    ))
    .returning({ id: deviceTokensTable.id });

  if (!updated) {
    res.status(404).json({ error: "Token not found or already revoked" });
    return;
  }

  res.json({ ok: true });
});

export default router;
