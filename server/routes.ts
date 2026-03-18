import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertRequestSchema, insertSubtaskSchema, insertCommentSchema } from "@shared/schema";
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
    return res.json({ id: user.id, username: user.username, displayName: user.displayName });
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
