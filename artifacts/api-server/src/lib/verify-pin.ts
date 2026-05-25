/**
 * Shared PIN verification helper.
 * Fetches the entity's stored bcrypt hash and compares it to the supplied PIN.
 * Returns `true` if the PIN matches, `false` otherwise.
 * Throws if the entity cannot be found.
 */
import bcrypt from "bcryptjs";
import { db, entitiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function verifyEntityPin(entityId: string, pin: string): Promise<boolean> {
  const [entity] = await db
    .select({ pinHash: entitiesTable.pinHash })
    .from(entitiesTable)
    .where(eq(entitiesTable.id, entityId));

  if (!entity) {
    throw new Error(`Entity not found: ${entityId}`);
  }

  return bcrypt.compare(pin, entity.pinHash);
}
