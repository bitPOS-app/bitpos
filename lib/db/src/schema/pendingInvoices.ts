import { pgTable, text, uuid, bigint, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { accountsTable } from "./accounts";

export const pendingInvoicesTable = pgTable("pending_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accountsTable.id),
  bolt11: text("bolt11").notNull(),
  paymentHash: text("payment_hash").notNull().unique(),
  amountSats: bigint("amount_sats", { mode: "number" }).notNull(),
  memo: text("memo"),
  nwcUrlEncrypted: text("nwc_url_encrypted"),
  cardOrderId: uuid("card_order_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPendingInvoiceSchema = createInsertSchema(pendingInvoicesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPendingInvoice = z.infer<typeof insertPendingInvoiceSchema>;
export type PendingInvoice = typeof pendingInvoicesTable.$inferSelect;
