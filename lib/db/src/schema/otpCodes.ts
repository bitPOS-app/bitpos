import { pgTable, text, uuid, integer, timestamp, index } from "drizzle-orm/pg-core";
import { entitiesTable } from "./entities";

/**
 * One-time codes emailed to users for security flows:
 *  - "recovery_email_verify": confirm ownership of a recovery email (authenticated).
 *  - "account_recovery": prove email ownership to reset a forgotten PIN / lost 2FA
 *    (unauthenticated; looked up via handle).
 *
 * Codes are stored hashed (bcrypt). Each row is short-lived and single-use.
 */
export const otpCodesTable = pgTable("otp_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityId: uuid("entity_id")
    .notNull()
    .references(() => entitiesTable.id, { onDelete: "cascade" }),
  purpose: text("purpose").notNull(),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("otp_codes_entity_purpose_idx").on(t.entityId, t.purpose),
]);

export type OtpCode = typeof otpCodesTable.$inferSelect;
