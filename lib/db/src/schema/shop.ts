import { pgTable, text, uuid, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { accountsTable } from "./accounts";
import { pendingInvoicesTable } from "./pendingInvoices";

export const cardDesignsTable = pgTable("card_designs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  artist: text("artist"),
  printafsFileId: text("printafs_file_id"),
  previewUrl: text("preview_url").notNull().default(""),
  priceEurCents: integer("price_eur_cents").notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CardDesign = typeof cardDesignsTable.$inferSelect;

export const cardOrdersTable = pgTable("card_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accountsTable.id),
  designId: text("design_id"),
  printFileId: text("print_file_id"),
  printFileIdBack: text("print_file_id_back"),
  printOrderId: text("print_order_id"),
  status: text("status").notNull().default("awaiting_payment"),
  quantity: integer("quantity").notNull().default(1),
  shippingName: text("shipping_name").notNull(),
  shippingEmail: text("shipping_email"),
  shippingPhone: text("shipping_phone"),
  shippingAddress1: text("shipping_address1").notNull(),
  shippingAddress2: text("shipping_address2"),
  shippingCity: text("shipping_city").notNull(),
  shippingPostalCode: text("shipping_postal_code").notNull(),
  shippingCountry: text("shipping_country").notNull(),
  trackingNumber: text("tracking_number"),
  amountSats: integer("amount_sats").notNull(),
  pendingInvoiceId: uuid("pending_invoice_id").references(() => pendingInvoicesTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type CardOrder = typeof cardOrdersTable.$inferSelect;
