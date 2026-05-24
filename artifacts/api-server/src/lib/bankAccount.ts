import { db } from "@workspace/db";
import { entitiesTable, accountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import bcrypt from "bcryptjs";

let cachedBankAccountId: string | null = null;

/**
 * Returns the ID of the bitPOS bank revenue account.
 *
 * The system account is identified by `is_system = true`, NOT by handle, so
 * a user registering with the handle "_bank" cannot claim ownership of it.
 * Creates the account on first call if it doesn't exist yet using a transactional
 * upsert to avoid race conditions on concurrent startup.
 */
export async function getBankAccountId(): Promise<string> {
  if (cachedBankAccountId) return cachedBankAccountId;

  // Look up by is_system flag - not by mutable/user-visible handle
  const [entity] = await db
    .select({ id: entitiesTable.id })
    .from(entitiesTable)
    .where(eq(entitiesTable.isSystem, true));

  if (entity) {
    const [account] = await db
      .select({ id: accountsTable.id })
      .from(accountsTable)
      .where(eq(accountsTable.entityId, entity.id));

    if (account) {
      cachedBankAccountId = account.id;
      return account.id;
    }
  }

  // Bootstrap: create the bank system entity + account
  // Using a well-known internal email + is_system flag so no user can claim this.
  const pinHash = await bcrypt.hash(`system-bank-${process.env.SESSION_SECRET ?? "static"}`, 12);

  // Conflict target is the HANDLE (not email) because:
  // - The handle "_bank_system" starts with "_" and is blocked at user registration
  // - Using email as conflict target would allow a user who registered "bank@bitpos.internal"
  //   to have their entity promoted to is_system=true via the upsert
  const [newEntity] = await db
    .insert(entitiesTable)
    .values({
      email: "bank@bitpos.internal",
      handle: "_bank_system",
      pinHash,
      isSystem: true,
    })
    .onConflictDoUpdate({
      target: entitiesTable.handle,
      set: { isSystem: true },
    })
    .returning();

  const [newAccount] = await db
    .insert(accountsTable)
    .values({
      entityId: newEntity.id,
      type: "business",
      businessName: "bitPOS Bank Revenue",
      businessActive: true,
    })
    .onConflictDoNothing()
    .returning();

  // If another worker raced us and already created the account, fetch it
  const accountId = newAccount?.id ?? (await db
    .select({ id: accountsTable.id })
    .from(accountsTable)
    .where(eq(accountsTable.entityId, newEntity.id))
    .then(([a]) => a?.id));

  if (!accountId) throw new Error("Failed to bootstrap bank revenue account");

  cachedBankAccountId = accountId;
  logger.info({ bankAccountId: accountId }, "Bank revenue account ready");
  return accountId;
}
