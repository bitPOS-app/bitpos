import { pgTable, text, uuid, bigint, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { entitiesTable } from "./entities";

export const accountTypeEnum = pgEnum("account_type", ["personal", "business"]);

export const accountsTable = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityId: uuid("entity_id").notNull().references(() => entitiesTable.id),
  type: accountTypeEnum("type").notNull().default("personal"),
  businessName: text("business_name"),
  businessActive: boolean("business_active").notNull().default(false),
  // Merchant display currency (lowercase code, e.g. "usd", "thb"). Used by the
  // web app and the posBOX device so both show the same fiat. Source of truth.
  currency: text("currency").notNull().default("usd"),
  albySubWalletNwcUrl: text("alby_sub_wallet_nwc_url"),
  balanceSats: bigint("balance_sats", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAccountSchema = createInsertSchema(accountsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof accountsTable.$inferSelect;
