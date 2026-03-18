import { pgTable, text, varchar, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Team members (communication team)
export const users = pgTable("users", {
  id: integer("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, isAdmin: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Schema for admin-created users (allows setting isAdmin)
export const adminCreateUserSchema = createInsertSchema(users).omit({ id: true });
export type AdminCreateUser = z.infer<typeof adminCreateUserSchema>;

// Content requests
export const requests = pgTable("requests", {
  id: integer("id").primaryKey(),
  requesterName: text("requester_name").notNull(),
  ministry: text("ministry").notNull(),
  eventType: text("event_type").notNull(), // "culto" | "outro"
  eventName: text("event_name").notNull(),
  eventDate: text("event_date").notNull(),
  eventTime: text("event_time").notNull(),
  eventDescription: text("event_description").notNull(),
  promotionType: text("promotion_type").notNull(), // "interna" | "externa"
  status: text("status").notNull().default("pendente"), // pendente | em_andamento | concluida | cancelada
  createdAt: text("created_at").notNull(),
});

export const insertRequestSchema = createInsertSchema(requests).omit({
  id: true,
  status: true,
  createdAt: true,
});

export type InsertRequest = z.infer<typeof insertRequestSchema>;
export type Request = typeof requests.$inferSelect;

// Subtasks for each request
export const subtasks = pgTable("subtasks", {
  id: integer("id").primaryKey(),
  requestId: integer("request_id").notNull(),
  title: text("title").notNull(),
  completed: boolean("completed").notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const insertSubtaskSchema = createInsertSchema(subtasks).omit({
  id: true,
  createdAt: true,
});
export type InsertSubtask = z.infer<typeof insertSubtaskSchema>;
export type Subtask = typeof subtasks.$inferSelect;

// Comments/activity log for each request
export const comments = pgTable("comments", {
  id: integer("id").primaryKey(),
  requestId: integer("request_id").notNull(),
  authorName: text("author_name").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertCommentSchema = createInsertSchema(comments).omit({
  id: true,
  createdAt: true,
});
export type InsertComment = z.infer<typeof insertCommentSchema>;
export type Comment = typeof comments.$inferSelect;

// Ministry list
export const MINISTRIES = [
  "Louvor",
  "Jovens",
  "Kids",
  "Casais",
  "Homens",
  "Mulheres",
  "Intercessão",
  "Diaconia",
  "Conexão",
  "Esportes",
  "Dança",
  "Teatro",
  "Mídia",
  "Recepção",
] as const;
