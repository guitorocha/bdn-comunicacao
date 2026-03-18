import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertRequestSchema, insertSubtaskSchema, insertCommentSchema, adminCreateUserSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ── Auth ──
  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Usuário e senha são obrigatórios" });
    }
    const user = await storage.getUserByUsername(username);
    if (!user || user.password !== password) {
      return res.status(401).json({ message: "Credenciais inválidas" });
    }
    // Return user info (no sessions needed — simple token-less auth for prototype)
    return res.json({ id: user.id, username: user.username, displayName: user.displayName, isAdmin: user.isAdmin });
  });

  // ── Users (admin only) ──

  app.get("/api/users", async (_req, res) => {
    const users = await storage.getAllUsers();
    // Don't send passwords to the client
    const safeUsers = users.map(({ password, ...rest }) => rest);
    return res.json(safeUsers);
  });

  app.post("/api/users", async (req, res) => {
    try {
      const data = adminCreateUserSchema.parse(req.body);
      // Check if username already exists
      const existing = await storage.getUserByUsername(data.username);
      if (existing) {
        return res.status(409).json({ message: "Já existe um usuário com esse nome de usuário" });
      }
      const user = await storage.createUserAdmin(data);
      const { password, ...safeUser } = user;
      return res.status(201).json(safeUser);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: err.errors });
      }
      throw err;
    }
  });

  app.delete("/api/users/:id", async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "ID inválido" });
    const deleted = await storage.deleteUser(id);
    if (!deleted) return res.status(404).json({ message: "Usuário não encontrado" });
    return res.json({ success: true });
  });

  app.patch("/api/users/:id/admin", async (req, res) => {
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

  // Get all requests (for admin panel)
  app.get("/api/requests", async (_req, res) => {
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

  // Update request status (admin only)
  app.patch("/api/requests/:id/status", async (req, res) => {
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

  app.get("/api/requests/:id/subtasks", async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const subtasks = await storage.getSubtasksByRequest(id);
    return res.json(subtasks);
  });

  app.post("/api/requests/:id/subtasks", async (req, res) => {
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

  app.patch("/api/subtasks/:id/toggle", async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const toggled = await storage.toggleSubtask(id);
    if (!toggled) return res.status(404).json({ message: "Subtarefa não encontrada" });
    return res.json(toggled);
  });

  app.delete("/api/subtasks/:id", async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const deleted = await storage.deleteSubtask(id);
    if (!deleted) return res.status(404).json({ message: "Subtarefa não encontrada" });
    return res.json({ success: true });
  });

  // ── Comments ──

  app.get("/api/requests/:id/comments", async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const comments = await storage.getCommentsByRequest(id);
    return res.json(comments);
  });

  app.post("/api/requests/:id/comments", async (req, res) => {
    const requestId = parseInt(req.params.id, 10);
    try {
      const data = insertCommentSchema.parse({ ...req.body, requestId });
      const comment = await storage.createComment(data);
      return res.status(201).json(comment);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: err.errors });
      }
      throw err;
    }
  });

  return httpServer;
}
