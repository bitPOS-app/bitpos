import { pgTable, text, uuid, bigint, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { cardsTable } from "./cards";
import { accountsTable } from "./accounts";

export const pinSessionStatusEnum = pgEnum("pin_session_status", ["pending", "processing", "authorized", "expired", "failed"]);

/**
 * Short-lived payment sessions created when a PIN-protected card is tapped at a
 * non-LUD-21 POS. The cardholder enters their PIN on the hosted /pay/:id page,
 * the server executes the Lightning payment, and the invoice is settled.
 *
 * pinLimitMsats semantics: null = always required (0 on LUD-21 wire); >0 = threshold in msats.
 */
export const pinPaymentSessionsTable = pgTable("pin_payment_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  cardId: uuid("card_id").notNull().references(() => cardsTable.id),
  accountId: uuid("account_id").notNull().references(() => accountsTable.id),
  pr: text("pr").notNull(),
  amountSats: bigint("amount_sats", { mode: "number" }).notNull(),
  feeSats: bigint("fee_sats", { mode: "number" }).notNull(),
  cardLabel: text("card_label"),
  status: pinSessionStatusEnum("status").notNull().default("pending"),
  pinFailCount: integer("pin_fail_count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PinPaymentSession = typeof pinPaymentSessionsTable.$inferSelect;
