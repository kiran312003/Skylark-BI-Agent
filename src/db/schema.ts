import { pgTable, text, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";

export const chatSessions = pgTable("chat_sessions", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const chatMessages = pgTable("chat_messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  role: text("role").notNull(), // 'user' | 'assistant' | 'system'
  content: text("content").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const boardCache = pgTable("board_cache", {
  id: text("id").primaryKey(),
  boardId: text("board_id").notNull(),
  boardName: text("board_name").notNull(),
  boardType: text("board_type").notNull(), // 'work_orders' | 'deals'
  data: jsonb("data").notNull(),
  cachedAt: timestamp("cached_at").defaultNow().notNull(),
  isValid: boolean("is_valid").default(true).notNull(),
});
