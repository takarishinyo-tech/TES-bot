import { pgTable, text, serial, numeric, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const inventoryItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  acquiredAt: z.string(),
});

export type InventoryItem = z.infer<typeof inventoryItemSchema>;

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id").notNull().unique(),
  username: text("username").notNull().default("Unknown"),
  balance: numeric("balance", { precision: 10, scale: 2 }).notNull().default("0"),
  inventory: jsonb("inventory").$type<InventoryItem[]>().notNull().default([]),
  services: jsonb("services").$type<Record<string, boolean>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
