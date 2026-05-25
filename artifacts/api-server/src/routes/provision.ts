/**
 * Bolt Card provisioning endpoint.
 *
 * GET /api/provision/:token
 *
 * Called by the Bolt Card NFC Creator app's DisplayAuthInfo component, which does
 * fetch(data) directly on the raw QR content. The QR must encode this plain HTTPS
 * URL - not a boltcard:// scheme URL (React Native fetch rejects non-http(s) schemes).
 * Returns a one-time `new_bolt_card_response` JSON payload containing the card keys
 * and the lnurlw_base URL to be written to the NFC card's NDEF record.
 *
 * The token is single-use and expires after 24 hours.
 */
import { Router, type IRouter } from "express";
import { db, cardsTable } from "@workspace/db";
import { eq, and, gte, isNotNull } from "drizzle-orm";
import { decrypt } from "../lib/encrypt";
import { logger } from "../lib/logger";
import { DOMAIN } from "../lib/domain";

const router: IRouter = Router();

router.get("/provision/:token", async (req, res): Promise<void> => {
  const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;

  if (!token) {
    res.status(400).json({ error: "Missing token" });
    return;
  }

  const now = new Date();

  // Find a card with a matching, unexpired provision token
  const [card] = await db
    .select()
    .from(cardsTable)
    .where(
      and(
        eq(cardsTable.provisionToken, token),
        isNotNull(cardsTable.provisionTokenExpiresAt),
        gte(cardsTable.provisionTokenExpiresAt, now),
      ),
    );

  if (!card) {
    res.status(404).json({ error: "Invalid or expired provisioning token" });
    return;
  }

  // Consume the token immediately (one-time use)
  await db
    .update(cardsTable)
    .set({ provisionToken: null, provisionTokenExpiresAt: null })
    .where(eq(cardsTable.id, card.id));

  // Decrypt all five AES keys
  let key0: string, key1: string, key2: string, key3: string, key4: string;
  try {
    key0 = decrypt(card.aesKey0);
    key1 = decrypt(card.aesKey1);
    key2 = decrypt(card.aesKey2);
    key3 = decrypt(card.aesKey3);
    key4 = decrypt(card.aesKey4);
  } catch {
    logger.error({ cardId: card.id }, "Failed to decrypt card AES keys during provisioning");
    res.status(500).json({ error: "Internal error" });
    return;
  }

  // lnurlw_base uses the lnurlw:// scheme (wallet apps convert to https://)
  // No ?p=...&c=... here - the Bolt Card Creator app configures SDM to append them
  const lnurlwBase = `lnurlw://${DOMAIN}/card/${card.id}`;

  logger.info({ cardId: card.id, accountId: card.accountId }, "Bolt Card provisioning data served");

  // Return the new_bolt_card_response payload expected by the Bolt Card NFC Creator app
  res.json({
    protocol_name: "new_bolt_card_response",
    protocol_version: 1,
    card_name: "bitPOS Card",
    lnurlw_base: lnurlwBase,
    uid_privacy: "Y",
    k0: key0,
    k1: key1,
    k2: key2,
    k3: key3,
    k4: key4,
  });
});

export default router;
