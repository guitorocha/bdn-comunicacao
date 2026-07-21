import type { Express, Request as ExpressRequest, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertRequestSchema, insertSubtaskSchema, insertCommentSchema, adminCreateUserSchema, insertScheduleSchema, updateProfileSchema, changePasswordSchema, SCHEDULE_ROLES, type User } from "@shared/schema";
import { z } from "zod";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { hashPassword, isHashed, verifyPassword } from "./password";
import { matchesCurrentPassword, signToken, verifyToken } from "./tokens";

// ── Rate limiting ──
// Sem isso o login aceita tentativas ilimitadas, e cada uma roda um scrypt
// (~70ms de Lambda), o que também é um vetor de custo. Dois limites: por IP
// (ataque de um lugar só) e por usuário (ataque distribuído numa conta).
const tooManyLogins = { message: "Muitas tentativas de login. Tente novamente em alguns minutos." };

// Só tentativas que falham contam: a equipe toda costuma sair do mesmo wi-fi
// (um IP só depois do NAT), e login certo de um não pode gastar a cota do outro.
// Para quem está adivinhando senha nada muda — todo palpite errado queima cota.
const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: tooManyLogins,
});

// Limite por conta: barra o ataque distribuído, que passa pelo limite de IP
const loginUserLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: tooManyLogins,
  keyGenerator: (req) =>
    typeof req.body?.username === "string"
      ? `user:${req.body.username.toLowerCase()}`
      : ipKeyGenerator(req.ip ?? ""),
});

// Teto geral da API, bem acima do uso normal — segura scripts abusivos
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Muitas requisições. Aguarde alguns minutos." },
});

// ── Auth middleware ──
// O cliente envia o JWT emitido no login em "Authorization: Bearer <token>".
// O token é assinado pelo servidor, então não pode ser forjado; ainda assim o
// usuário é recarregado do banco a cada request para que troca de senha,
// remoção de admin ou exclusão de conta valham imediatamente.

interface AuthedRequest extends ExpressRequest {
  authUser?: User;
}

async function resolveRequestUser(req: ExpressRequest): Promise<User | undefined> {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) return undefined;

  const payload = verifyToken(header.slice("Bearer ".length).trim());
  if (!payload) return undefined;

  const id = parseInt(payload.sub, 10);
  if (isNaN(id)) return undefined;

  const user = await storage.getUser(id);
  if (!user) return undefined;
  // Token emitido antes da última troca de senha deixa de valer
  if (!matchesCurrentPassword(payload, user)) return undefined;
  return user;
}

const requireUser: RequestHandler<any> = async (req, res, next) => {
  const user = await resolveRequestUser(req);
  if (!user) return res.status(401).json({ message: "Autenticação necessária" });
  (req as AuthedRequest).authUser = user;
  next();
};

const requireAdmin: RequestHandler<any> = async (req, res, next) => {
  const user = await resolveRequestUser(req);
  if (!user) return res.status(401).json({ message: "Autenticação necessária" });
  if (!user.isAdmin) return res.status(403).json({ message: "Apenas administradores podem executar esta ação" });
  (req as AuthedRequest).authUser = user;
  next();
};

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.use("/api", apiLimiter);

  // ── Auth ──
  app.post("/api/auth/login", loginIpLimiter, loginUserLimiter, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Usuário e senha são obrigatórios" });
    }
    const found = await storage.getUserByUsername(username);
    if (!found || !verifyPassword(password, found.password)) {
      return res.status(401).json({ message: "Credenciais inválidas" });
    }
    // Senhas antigas ficaram em texto puro — migra para hash no primeiro login.
    // O token é assinado depois, sobre o hash já gravado.
    let user = found;
    if (!isHashed(found.password)) {
      user = (await storage.updateUserPassword(found.id, hashPassword(password))) ?? found;
    }
    const { password: _pw, ...safeUser } = user;
    return res.json({ token: signToken(user), user: safeUser });
  });

  // Sem estado no servidor: o logout apenas descarta o token no cliente.
  // Endpoint existe para o cliente ter um ponto único de saída.
  app.post("/api/auth/logout", (_req, res) => res.json({ success: true }));

  // Revalida o token e devolve o usuário atualizado (usado no boot do cliente)
  app.get("/api/auth/me", requireUser, async (req, res) => {
    const { password, ...safeUser } = (req as AuthedRequest).authUser!;
    return res.json(safeUser);
  });

  // ── Users (admin only) ──

  // Admin vê o cadastro completo (/equipes); os demais recebem só o que as
  // escalas precisam — telefone e e-mail do time não são lista de contatos.
  app.get("/api/users", requireUser, async (req, res) => {
    const viewer = (req as AuthedRequest).authUser!;
    const users = await storage.getAllUsers();
    if (viewer.isAdmin) {
      return res.json(users.map(({ password, ...rest }) => rest));
    }
    return res.json(
      users.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        isAdmin: u.isAdmin,
        roles: u.roles,
      })),
    );
  });

  // ── Perfil do próprio usuário (qualquer usuário autenticado) ──

  app.get("/api/users/me", requireUser, async (req, res) => {
    const { password, ...safeUser } = (req as AuthedRequest).authUser!;
    return res.json(safeUser);
  });

  app.patch("/api/users/me", requireUser, async (req, res) => {
    const user = (req as AuthedRequest).authUser!;
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Dados inválidos" });
    }
    const updated = await storage.updateUserProfile(user.id, parsed.data);
    if (!updated) return res.status(404).json({ message: "Usuário não encontrado" });
    const { password, ...safeUser } = updated;
    return res.json(safeUser);
  });

  app.patch("/api/users/me/password", requireUser, async (req, res) => {
    const user = (req as AuthedRequest).authUser!;
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Dados inválidos" });
    }
    if (!verifyPassword(parsed.data.currentPassword, user.password)) {
      return res.status(403).json({ message: "Senha atual incorreta" });
    }
    const updated = await storage.updateUserPassword(user.id, hashPassword(parsed.data.newPassword));
    if (!updated) return res.status(404).json({ message: "Usuário não encontrado" });
    // A troca derruba os tokens antigos (inclusive em outros dispositivos);
    // devolve um novo para quem acabou de trocar continuar na sessão.
    return res.json({ success: true, token: signToken(updated) });
  });

  app.post("/api/users", requireAdmin, async (req, res) => {
    try {
      const data = adminCreateUserSchema.parse(req.body);
      // Check if username already exists
      const existing = await storage.getUserByUsername(data.username);
      if (existing) {
        return res.status(409).json({ message: "Já existe um usuário com esse nome de usuário" });
      }
      const user = await storage.createUserAdmin({ ...data, password: hashPassword(data.password) });
      const { password, ...safeUser } = user;
      return res.status(201).json(safeUser);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: err.errors });
      }
      throw err;
    }
  });

  app.delete("/api/users/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "ID inválido" });
    const deleted = await storage.deleteUser(id);
    if (!deleted) return res.status(404).json({ message: "Usuário não encontrado" });
    return res.json({ success: true });
  });

  app.patch("/api/users/:id/roles", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "ID inválido" });
    const parsed = z.array(z.enum(SCHEDULE_ROLES)).safeParse(req.body?.roles);
    if (!parsed.success) {
      return res.status(400).json({ message: "Campo roles inválido" });
    }
    const updated = await storage.updateUserRoles(id, parsed.data);
    if (!updated) return res.status(404).json({ message: "Usuário não encontrado" });
    const { password, ...safeUser } = updated;
    return res.json(safeUser);
  });

  app.patch("/api/users/:id/admin", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { isAdmin } = req.body;
    if (typeof isAdmin !== "boolean") {
      return res.status(400).json({ message: "Campo isAdmin deve ser boolean" });
    }
    const updated = await storage.updateUserAdmin(id, isAdmin);
    if (!updated) return res.status(404).json({ message: "Usuário não encontrado" });
    const { password, ...safeUser } = updated;
    return res.json(safeUser);
  });

  // ── Requests ──

  // Create a new request (public)
  app.post("/api/requests", async (req, res) => {
    try {
      const data = insertRequestSchema.parse(req.body);

      // Check for conflicting events (same ministry + same date)
      const conflicts = await storage.getRequestsByMinistryAndDate(data.ministry, data.eventDate);
      if (conflicts.length > 0) {
        return res.status(409).json({
          message: `Já existe um evento agendado para o ministério "${data.ministry}" na data ${data.eventDate}.`,
          conflictingEvent: conflicts[0],
        });
      }

      const request = await storage.createRequest(data);
      return res.status(201).json(request);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: err.errors });
      }
      throw err;
    }
  });

  // Get all requests (painel interno — só para quem está logado)
  app.get("/api/requests", requireUser, async (_req, res) => {
    const all = await storage.getAllRequests();
    return res.json(all);
  });

  // Get single request by ID (public for tracking)
  app.get("/api/requests/:id", async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "ID inválido" });
    const request = await storage.getRequest(id);
    if (!request) return res.status(404).json({ message: "Solicitação não encontrada" });
    return res.json(request);
  });

  // Update request status — qualquer membro logado toca a solicitação adiante
  app.patch("/api/requests/:id/status", requireUser, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { status } = req.body;
    const valid = ["pendente", "em_andamento", "concluida", "cancelada"];
    if (!valid.includes(status)) {
      return res.status(400).json({ message: "Status inválido" });
    }
    const updated = await storage.updateRequestStatus(id, status);
    if (!updated) return res.status(404).json({ message: "Solicitação não encontrada" });
    return res.json(updated);
  });

  // ── Subtasks ──

  // Leitura fica pública: a página de acompanhamento mostra o andamento a quem
  // tem o número da solicitação. Escrita exige login.
  app.get("/api/requests/:id/subtasks", async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const subtasks = await storage.getSubtasksByRequest(id);
    return res.json(subtasks);
  });

  app.post("/api/requests/:id/subtasks", requireUser, async (req, res) => {
    const requestId = parseInt(req.params.id, 10);
    try {
      const data = insertSubtaskSchema.parse({ ...req.body, requestId });
      const subtask = await storage.createSubtask(data);
      return res.status(201).json(subtask);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: err.errors });
      }
      throw err;
    }
  });

  app.patch("/api/subtasks/:id/toggle", requireUser, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const toggled = await storage.toggleSubtask(id);
    if (!toggled) return res.status(404).json({ message: "Subtarefa não encontrada" });
    return res.json(toggled);
  });

  app.delete("/api/subtasks/:id", requireUser, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const deleted = await storage.deleteSubtask(id);
    if (!deleted) return res.status(404).json({ message: "Subtarefa não encontrada" });
    return res.json({ success: true });
  });

  // ── Comments ──

  // Igual às subtarefas: leitura pública (acompanhamento), escrita autenticada.
  app.get("/api/requests/:id/comments", async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const comments = await storage.getCommentsByRequest(id);
    return res.json(comments);
  });

  app.post("/api/requests/:id/comments", requireUser, async (req, res) => {
    const requestId = parseInt(req.params.id, 10);
    const author = (req as AuthedRequest).authUser!;
    try {
      // authorName vem da sessão, nunca do corpo — ninguém comenta como outra pessoa
      const data = insertCommentSchema.parse({
        ...req.body,
        requestId,
        authorName: author.displayName,
      });
      const comment = await storage.createComment(data);
      return res.status(201).json(comment);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: err.errors });
      }
      throw err;
    }
  });

  // ── Unavailability (escalas) ──

  // Admins see everyone's entries (needed for auto-generation);
  // volunteers see only their own.
  app.get("/api/unavailability", requireUser, async (req, res) => {
    const user = (req as AuthedRequest).authUser!;
    const entries = user.isAdmin
      ? await storage.getAllUnavailability()
      : await storage.getUnavailabilityByUser(user.id);
    return res.json(entries);
  });

  // Volunteers record their own unavailability
  app.post("/api/unavailability", requireUser, async (req, res) => {
    const user = (req as AuthedRequest).authUser!;
    const parsed = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Data inválida (use YYYY-MM-DD)" });
    }
    const entry = await storage.createUnavailability({ userId: user.id, date: parsed.data.date });
    return res.status(201).json(entry);
  });

  app.delete("/api/unavailability/:id", requireUser, async (req, res) => {
    const user = (req as AuthedRequest).authUser!;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "ID inválido" });
    const entry = await storage.getUnavailabilityEntry(id);
    if (!entry) return res.status(404).json({ message: "Registro não encontrado" });
    if (entry.userId !== user.id && !user.isAdmin) {
      return res.status(403).json({ message: "Você só pode remover sua própria indisponibilidade" });
    }
    await storage.deleteUnavailability(id);
    return res.json({ success: true });
  });

  // ── Schedules (escalas) ──

  // Only logged-in users can see schedules
  app.get("/api/schedules", requireUser, async (_req, res) => {
    const all = await storage.getAllSchedules();
    return res.json(all);
  });

  // Only admins can create/edit/delete schedules
  app.post("/api/schedules", requireAdmin, async (req, res) => {
    try {
      const data = insertScheduleSchema.parse(req.body);
      const schedule = await storage.createSchedule(data);
      return res.status(201).json(schedule);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: err.errors });
      }
      throw err;
    }
  });

  // Bulk create (used by auto-generation)
  app.post("/api/schedules/bulk", requireAdmin, async (req, res) => {
    try {
      const data = z.array(insertScheduleSchema).min(1).parse(req.body?.schedules);
      const created = [];
      for (const item of data) {
        created.push(await storage.createSchedule(item));
      }
      return res.status(201).json(created);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: err.errors });
      }
      throw err;
    }
  });

  app.put("/api/schedules/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "ID inválido" });
    try {
      const data = insertScheduleSchema.parse(req.body);
      const updated = await storage.updateSchedule(id, data);
      if (!updated) return res.status(404).json({ message: "Escala não encontrada" });
      return res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: err.errors });
      }
      throw err;
    }
  });

  app.delete("/api/schedules/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "ID inválido" });
    const deleted = await storage.deleteSchedule(id);
    if (!deleted) return res.status(404).json({ message: "Escala não encontrada" });
    return res.json({ success: true });
  });

  return httpServer;
}
