import { pgTable, text, uuid, boolean, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const entitiesTable = pgTable("entities", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  handle: text("handle").notNull().unique(),
  phone: text("phone"),
  phoneVerified: boolean("phone_verified").notNull().default(false),
  pinHash: text("pin_hash").notNull(),
  // Login brute-force protection
  loginFailCount: integer("login_fail_count").notNull().default(0),
  loginLockedUntil: timestamp("login_locked_until", { withTimezone: true }),
  // System accounts (e.g. bank revenue) are identified by this flag, not by handle
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("entities_is_system_idx").on(t.isSystem),
]);

export const insertEntitySchema = createInsertSchema(entitiesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEntity = z.infer<typeof insertEntitySchema>;
export type Entity = typeof entitiesTable.$inferSelect;
