import { pgTable, text, uuid, bigint, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { accountsTable } from "./accounts";

export const swapStatusEnum = pgEnum("swap_status", ["pending", "claimed", "failed", "expired"]);

export const swapsTable = pgTable("swaps", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accountsTable.id),
  swapId: text("swap_id").notNull().unique(),
  status: swapStatusEnum("status").notNull().default("pending"),
  invoice: text("invoice").notNull(),
  onchainAmountSats: bigint("onchain_amount_sats", { mode: "number" }).notNull(),
  destinationAddress: text("destination_address").notNull(),
  txid: text("txid"),
  paymentHash: text("payment_hash"),
  // Stored so the monitor can refund the correct amount on failed/expired
  feeSats: bigint("fee_sats", { mode: "number" }).notNull().default(0),
  totalDeductedSats: bigint("total_deducted_sats", { mode: "number" }).notNull().default(0),
  claimPrivateKeyHex: text("claim_private_key_hex"),
  preimageHex: text("preimage_hex"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSwapSchema = createInsertSchema(swapsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSwap = z.infer<typeof insertSwapSchema>;
export type Swap = typeof swapsTable.$inferSelect;
