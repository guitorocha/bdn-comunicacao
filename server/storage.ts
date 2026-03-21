import {
  type User, type InsertUser, type AdminCreateUser,
  type Request, type InsertRequest,
  type Subtask, type InsertSubtask,
  type Comment, type InsertComment,
} from "@shared/schema";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  createUserAdmin(user: AdminCreateUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  deleteUser(id: number): Promise<boolean>;
  updateUserAdmin(id: number, isAdmin: boolean): Promise<User | undefined>;
  // Requests
  getRequest(id: number): Promise<Request | undefined>;
  getAllRequests(): Promise<Request[]>;
  createRequest(req: InsertRequest): Promise<Request>;
  updateRequestStatus(id: number, status: string): Promise<Request | undefined>;
  getRequestsByMinistryAndDate(ministry: string, eventDate: string): Promise<Request[]>;
  // Subtasks
  getSubtasksByRequest(requestId: number): Promise<Subtask[]>;
  createSubtask(sub: InsertSubtask): Promise<Subtask>;
  toggleSubtask(id: number): Promise<Subtask | undefined>;
  deleteSubtask(id: number): Promise<boolean>;
  // Comments
  getCommentsByRequest(requestId: number): Promise<Comment[]>;
  createComment(comment: InsertComment): Promise<Comment>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User> = new Map();
  private requests: Map<number, Request> = new Map();
  private subtasks: Map<number, Subtask> = new Map();
  private comments: Map<number, Comment> = new Map();
  private nextUserId = 1;
  private nextRequestId = 1000;
  private nextSubtaskId = 1;
  private nextCommentId = 1;

  constructor() {
    // Seed users
    this.createUserAdmin({
      username: "admin",
      password: "bdn2026",
      displayName: "Administrador",
      isAdmin: true,
    });
    this.createUserAdmin({
      username: "comunicacao",
      password: "comunica2026",
      displayName: "Equipe Comunicação",
      isAdmin: false,
    });
  }

  // Users
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(u => u.username === username);
  }

  async createUser(data: InsertUser): Promise<User> {
    const id = this.nextUserId++;
    const user: User = { id, ...data, isAdmin: false };
    this.users.set(id, user);
    return user;
  }

  async createUserAdmin(data: AdminCreateUser): Promise<User> {
    const id = this.nextUserId++;
    const user: User = { id, ...data, isAdmin: data.isAdmin ?? false };
    this.users.set(id, user);
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async deleteUser(id: number): Promise<boolean> {
    return this.users.delete(id);
  }

  async updateUserAdmin(id: number, isAdmin: boolean): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    user.isAdmin = isAdmin;
    this.users.set(id, user);
    return user;
  }

  // Requests
  async getRequest(id: number): Promise<Request | undefined> {
    return this.requests.get(id);
  }

  async getAllRequests(): Promise<Request[]> {
    return Array.from(this.requests.values()).sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  async createRequest(data: InsertRequest): Promise<Request> {
    const id = this.nextRequestId++;
    const request: Request = {
      id,
      ...data,
      status: "pendente",
      createdAt: new Date().toISOString(),
    };
    this.requests.set(id, request);
    return request;
  }

  async updateRequestStatus(id: number, status: string): Promise<Request | undefined> {
    const req = this.requests.get(id);
    if (!req) return undefined;
    req.status = status;
    this.requests.set(id, req);
    return req;
  }

  async getRequestsByMinistryAndDate(ministry: string, eventDate: string): Promise<Request[]> {
    return Array.from(this.requests.values()).filter(
      r => r.ministry === ministry && r.eventDate === eventDate && r.status !== "cancelada"
    );
  }

  // Subtasks
  async getSubtasksByRequest(requestId: number): Promise<Subtask[]> {
    return Array.from(this.subtasks.values())
      .filter(s => s.requestId === requestId)
      .sort((a, b) => a.id - b.id);
  }

  async createSubtask(data: InsertSubtask): Promise<Subtask> {
    const id = this.nextSubtaskId++;
    const subtask: Subtask = {
      id,
      ...data,
      completed: data.completed ?? false,
      createdAt: new Date().toISOString(),
    };
    this.subtasks.set(id, subtask);
    return subtask;
  }

  async toggleSubtask(id: number): Promise<Subtask | undefined> {
    const sub = this.subtasks.get(id);
    if (!sub) return undefined;
    sub.completed = !sub.completed;
    this.subtasks.set(id, sub);
    return sub;
  }

  async deleteSubtask(id: number): Promise<boolean> {
    return this.subtasks.delete(id);
  }

  // Comments
  async getCommentsByRequest(requestId: number): Promise<Comment[]> {
    return Array.from(this.comments.values())
      .filter(c => c.requestId === requestId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async createComment(data: InsertComment): Promise<Comment> {
    const id = this.nextCommentId++;
    const comment: Comment = {
      id,
      ...data,
      createdAt: new Date().toISOString(),
    };
    this.comments.set(id, comment);
    return comment;
  }
}

import { DynamoStorage } from "./storage-dynamo";

export const storage = process.env.NODE_ENV === "production"
  ? new DynamoStorage()   // Lambda + DynamoDB
  : new MemStorage();     // Dev local (sem AWS)
