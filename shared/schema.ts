import { pgTable, text, varchar, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// As funções do ministério de comunicação (escalas). "treinamento" não é um
// posto de trabalho: é a vaga de quem vai acompanhar a equipe para aprender uma
// função que ainda não exerce.
export const SCHEDULE_ROLES = ["fotografia", "filmmaker", "projecao", "transmissao", "treinamento"] as const;
export type ScheduleRole = (typeof SCHEDULE_ROLES)[number];

export const SCHEDULE_ROLE_LABELS: Record<ScheduleRole, string> = {
  fotografia: "Fotografia",
  filmmaker: "Filmmaker",
  projecao: "Projeção",
  transmissao: "Transmissão ao Vivo",
  treinamento: "Em treinamento",
};

export const TRAINING_ROLE: ScheduleRole = "treinamento";

// As funções que de fato cobrem o culto — tudo menos o treinamento
export const OPERATIONAL_ROLES: ScheduleRole[] = SCHEDULE_ROLES.filter((r) => r !== TRAINING_ROLE);

export function isTrainingRole(role: ScheduleRole): boolean {
  return role === TRAINING_ROLE;
}

// Team members (communication team). `roles` marks the functions the
// user can serve in — users with at least one role are the volunteers.
export const users = pgTable("users", {
  id: integer("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  roles: jsonb("roles").$type<ScheduleRole[]>().notNull().default([]),
  // Senha definida por um admin (criação ou reset): o dono precisa trocá-la
  // antes de usar o sistema, para que ninguém além dele conheça a senha.
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  // Bloqueio de conta: senhas erradas seguidas somam aqui e zeram no acerto.
  // `lockedAt` preenchido = conta bloqueada (só um admin destrava).
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedAt: text("locked_at"),
  // Profile data the member keeps up to date on /usuarios
  email: text("email"),
  phone: text("phone"),
  cellName: text("cell_name"),
  cellLeaders: text("cell_leaders"),
});

export const insertUserSchema = createInsertSchema(users, {
  roles: z.array(z.enum(SCHEDULE_ROLES)).default([]),
}).omit({
  id: true,
  isAdmin: true,
  mustChangePassword: true,
  failedLoginCount: true,
  lockedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type SafeUser = Omit<User, "password">;

// ── Usuário raiz ──
// A conta "admin" é a que sobra quando tudo mais falha: só ela pode redefinir a
// própria senha (ou um update direto no banco). Se um admin qualquer pudesse
// redefini-la, bastaria uma conta de admin comprometida para tomar a raiz.
export const ROOT_ADMIN_USERNAME = "admin";

export function isRootAdmin(user: { username: string }): boolean {
  return user.username.trim().toLowerCase() === ROOT_ADMIN_USERNAME;
}

// ── Bloqueio de conta ──
// Oito senhas erradas seguidas bloqueiam a conta em definitivo: não há prazo
// para destravar sozinha, um admin precisa liberar. Isso fecha o ataque lento e
// distribuído, que passa por baixo do rate limit (10 tentativas/15min por conta)
// simplesmente esperando a janela virar. O acerto da senha zera o contador, então
// quem só errou de vez em quando nunca chega perto do limite.
export const MAX_FAILED_LOGINS = 8;

export function isLocked(user: { lockedAt?: string | null }): boolean {
  return Boolean(user.lockedAt);
}

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
  // Estado de sessão/bloqueio é decidido pelo servidor, não pelo corpo do request
  .omit({ id: true, mustChangePassword: true, failedLoginCount: true, lockedAt: true })
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

// Reset feito por um admin: não pede a senha atual (o admin não a conhece), e o
// dono da conta é obrigado a trocar a senha no próximo acesso.
export const adminResetPasswordSchema = z.object({
  newPassword: passwordField,
});
export type AdminResetPassword = z.infer<typeof adminResetPasswordSchema>;

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

// Períodos que o voluntário pode bloquear num dia. "dia" cobre os três outros.
export const UNAVAILABILITY_PERIODS = ["manha", "tarde", "noite", "dia"] as const;
export type UnavailabilityPeriod = (typeof UNAVAILABILITY_PERIODS)[number];

export const UNAVAILABILITY_PERIOD_LABELS: Record<UnavailabilityPeriod, string> = {
  manha: "Manhã",
  tarde: "Tarde",
  noite: "Noite",
  dia: "Dia inteiro",
};

// Registros criados antes deste campo bloqueavam o dia inteiro
export function unavailabilityPeriod(period?: string | null): UnavailabilityPeriod {
  return UNAVAILABILITY_PERIODS.includes(period as UnavailabilityPeriod)
    ? (period as UnavailabilityPeriod)
    : "dia";
}

// Períodos que um culto pode ocupar — "dia" só existe do lado da indisponibilidade
export const EVENT_PERIODS: UnavailabilityPeriod[] = ["manha", "tarde", "noite"];

// Horário do culto ("HH:mm") → período do dia
export function periodOfTime(time: string): UnavailabilityPeriod {
  const hour = Number(time.slice(0, 2));
  if (hour < 12) return "manha";
  if (hour < 18) return "tarde";
  return "noite";
}

// Days a volunteer cannot serve — used by auto-generation and shown to admins
export const unavailability = pgTable("unavailability", {
  id: integer("id").primaryKey(),
  userId: integer("user_id").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  period: text("period").$type<UnavailabilityPeriod>().notNull(), // manha | tarde | noite | dia
  createdAt: text("created_at").notNull(),
});

export const insertUnavailabilitySchema = createInsertSchema(unavailability, {
  period: z.enum(UNAVAILABILITY_PERIODS),
}).omit({
  id: true,
  createdAt: true,
});
export type InsertUnavailability = z.infer<typeof insertUnavailabilitySchema>;
export type Unavailability = typeof unavailability.$inferSelect;

// ── Treinamento ──
// Quem está escalado em treinamento não assume nenhuma outra função no mesmo
// período: a pessoa está ali para aprender, acompanhando quem já sabe, e não
// pode ser contada como responsável por um posto ao mesmo tempo. O bloqueio vale
// só para o período do treinamento — quem treina no culto da manhã continua
// livre para servir à tarde ou à noite do mesmo dia.

// O que a regra precisa de uma escala: o horário (de onde sai o período) e quem
// está escalado. Serve tanto para a escala salva quanto para a que está sendo
// criada.
export interface ScheduledEvent {
  eventTime: string;
  assignments: ScheduleAssignment[];
}

// Nomes dos voluntários que estão em treinamento e em outra função no mesmo
// período. Recebe os eventos de um único dia — os dois cultos de domingo são
// avaliados separadamente, cada um no seu período.
export function trainingConflicts(events: ScheduledEvent[]): string[] {
  const trainees = new Map<string, { id: number; name: string }>();
  const working = new Set<string>();
  for (const event of events) {
    const period = periodOfTime(event.eventTime);
    for (const a of event.assignments) {
      const key = `${period}:${a.volunteerId}`;
      if (isTrainingRole(a.role)) trainees.set(key, { id: a.volunteerId, name: a.volunteerName });
      else working.add(key);
    }
  }
  // Um mesmo voluntário em conflito em dois períodos aparece uma vez só
  const conflicted = new Map<number, string>();
  trainees.forEach((trainee, key) => {
    if (working.has(key)) conflicted.set(trainee.id, trainee.name);
  });
  return Array.from(conflicted.values());
}

// Mensagem única para o aviso do formulário e o erro da API
export function trainingConflictMessage(names: string[]): string | null {
  if (names.length === 0) return null;
  const list = names.join(", ");
  return names.length === 1
    ? `${list} está em treinamento e não pode assumir outra função no mesmo período.`
    : `${list} estão em treinamento e não podem assumir outra função no mesmo período.`;
}

// ── Auditoria ──
// Registro append-only do que aconteceu com contas e acessos. Não é log de
// aplicação: é a resposta para "o que houve?" depois de um incidente — quem
// entrou, quem tentou e errou, quem virou admin, quem apagou quem.
export const AUDIT_ACTIONS = [
  "login.success",
  "login.failure",
  "login.blocked",   // tentativa numa conta já bloqueada
  "account.locked",
  "account.unlocked",
  "password.change", // o próprio dono trocou
  "password.reset",  // um admin definiu uma provisória
  "user.create",
  "user.delete",
  "admin.grant",
  "admin.revoke",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  "login.success": "Login",
  "login.failure": "Login incorreto",
  "login.blocked": "Login em conta bloqueada",
  "account.locked": "Conta bloqueada",
  "account.unlocked": "Conta desbloqueada",
  "password.change": "Senha alterada pelo dono",
  "password.reset": "Senha redefinida por admin",
  "user.create": "Usuário criado",
  "user.delete": "Usuário removido",
  "admin.grant": "Admin concedido",
  "admin.revoke": "Admin removido",
};

export const auditEntries = pgTable("audit", {
  id: integer("id").primaryKey(),
  at: text("at").notNull(),              // ISO 8601
  action: text("action").$type<AuditAction>().notNull(),
  // Quem agiu. Null em login que falhou antes de identificar a conta.
  actorId: integer("actor_id"),
  actorName: text("actor_name"),
  // Sobre quem. No login é a própria conta; em ações de admin, o alvo.
  targetId: integer("target_id"),
  targetName: text("target_name"),
  ip: text("ip"),
  detail: text("detail"),
});

export type AuditEntry = typeof auditEntries.$inferSelect;
export type InsertAuditEntry = Omit<AuditEntry, "id" | "at">;

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
