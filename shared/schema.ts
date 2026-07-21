import { pgTable, text, varchar, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// The four functions of the media ministry (escalas)
export const SCHEDULE_ROLES = ["fotografia", "filmmaker", "projecao", "transmissao"] as const;
export type ScheduleRole = (typeof SCHEDULE_ROLES)[number];

export const SCHEDULE_ROLE_LABELS: Record<ScheduleRole, string> = {
  fotografia: "Fotografia",
  filmmaker: "Filmmaker",
  projecao: "Projeção",
  transmissao: "Transmissão ao Vivo",
};

// Team members (communication team). `roles` marks the functions the
// user can serve in — users with at least one role are the volunteers.
export const users = pgTable("users", {
  id: integer("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  roles: jsonb("roles").$type<ScheduleRole[]>().notNull().default([]),
  // Profile data the member keeps up to date on /usuarios
  email: text("email"),
  phone: text("phone"),
  cellName: text("cell_name"),
  cellLeaders: text("cell_leaders"),
});

export const insertUserSchema = createInsertSchema(users, {
  roles: z.array(z.enum(SCHEDULE_ROLES)).default([]),
}).omit({ id: true, isAdmin: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type SafeUser = Omit<User, "password">;

// ── Política de senha ──
// Comprimento vale mais que regras de caractere: uma frase longa é melhor que
// "S3nh@!". Além do mínimo, barra os valores óbvios que já circularam por aqui.
export const PASSWORD_MIN_LENGTH = 10;

const COMMON_PASSWORDS = [
  "bdn2026", "bdn2025", "bdncomunicacao", "comunicacao", "batistadanovavida",
  "123456", "1234567", "12345678", "123456789", "1234567890",
  "senha", "senha123", "password", "qwerty", "abc123", "admin", "admin123",
];

export const PASSWORD_RULE_MESSAGE = `A senha deve ter ao menos ${PASSWORD_MIN_LENGTH} caracteres`;

export function passwordIssue(password: string, username?: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return PASSWORD_RULE_MESSAGE;
  const normalized = password.toLowerCase();
  if (COMMON_PASSWORDS.includes(normalized)) return "Essa senha é muito comum. Escolha outra.";
  if (username && normalized === username.trim().toLowerCase()) {
    return "A senha não pode ser igual ao nome de usuário";
  }
  return null;
}

// Aplica a política a um campo de senha; `username` vem do próprio objeto
// quando existe (criação de usuário), para barrar senha igual ao login.
export const passwordField = z.string().superRefine((value, ctx) => {
  const issue = passwordIssue(value);
  if (issue) ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue });
});

// Schema for admin-created users (allows setting isAdmin)
export const adminCreateUserSchema = createInsertSchema(users, {
  roles: z.array(z.enum(SCHEDULE_ROLES)).default([]),
  password: passwordField,
})
  .omit({ id: true })
  .superRefine((data, ctx) => {
    const issue = passwordIssue(data.password, data.username);
    if (issue) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["password"], message: issue });
  });
export type AdminCreateUser = z.infer<typeof adminCreateUserSchema>;

// Profile the logged-in user edits themselves on /usuarios
const optionalText = z.string().trim().max(120).optional().default("");

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1, "Informe seu nome"),
  email: z.union([z.string().trim().email("E-mail inválido"), z.literal("")]).optional().default(""),
  phone: optionalText,
  cellName: optionalText,
  cellLeaders: optionalText,
});
export type UpdateProfile = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Informe a senha atual"),
  newPassword: passwordField,
});
export type ChangePassword = z.infer<typeof changePasswordSchema>;

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

// ── Escalas (volunteer scheduling) ──

// One assignment inside a schedule: a volunteer (registered user) serving in a role
export const scheduleAssignmentSchema = z.object({
  role: z.enum(SCHEDULE_ROLES),
  volunteerId: z.number(),
  volunteerName: z.string(),
});
export type ScheduleAssignment = z.infer<typeof scheduleAssignmentSchema>;

// A schedule (escala) for a service or special event
export const schedules = pgTable("schedules", {
  id: integer("id").primaryKey(),
  title: text("title").notNull(),
  eventType: text("event_type").notNull(), // "culto" | "especial"
  eventDate: text("event_date").notNull(), // YYYY-MM-DD
  eventTime: text("event_time").notNull(), // HH:mm
  notes: text("notes"),
  assignments: jsonb("assignments").$type<ScheduleAssignment[]>().notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertScheduleSchema = createInsertSchema(schedules, {
  assignments: z.array(scheduleAssignmentSchema),
}).omit({ id: true, createdAt: true });

export type InsertSchedule = z.infer<typeof insertScheduleSchema>;
export type Schedule = typeof schedules.$inferSelect;

// Days a volunteer cannot serve — used by auto-generation and shown to admins
export const unavailability = pgTable("unavailability", {
  id: integer("id").primaryKey(),
  userId: integer("user_id").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  createdAt: text("created_at").notNull(),
});

export const insertUnavailabilitySchema = createInsertSchema(unavailability).omit({
  id: true,
  createdAt: true,
});
export type InsertUnavailability = z.infer<typeof insertUnavailabilitySchema>;
export type Unavailability = typeof unavailability.$inferSelect;

// Ministry list
export const MINISTRIES = [
  "Arteria",
  "Atalaias",
  "Audio",
  "Boas Vindas",
  "Casais",
  "Cura",
  "Diaconia",
  "Eventos",
  "Flame",
  "Homens",
  "Intercessão",
  "Louvor",
  "Lutas/M.D.L.",
  "Mergulhando",
  "M.I./BDN Kids",
  "Mulheres",
  "Nova Vida",
  "Recrie",
  "Secretaría",
  "Teatro",
  "Teens",
  "Zeladoria",
] as const;
