import { pgTable, text, uuid, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { accountsTable } from "./accounts";

export const stickersTable = pgTable("stickers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  imageUrl: text("image_url").notNull(),
  submittedByAccountId: uuid("submitted_by_account_id").references(() => accountsTable.id),
  active: boolean("active").notNull().default(false),
  moderationStatus: text("moderation_status").notNull().default("pending"),
  githubIssueNumber: integer("github_issue_number"),
  royaltySatsPerUse: integer("royalty_sats_per_use").notNull().default(200),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Sticker = typeof stickersTable.$inferSelect;
export type NewSticker = typeof stickersTable.$inferInsert;
