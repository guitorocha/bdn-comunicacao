import {
  type User, type InsertUser, type AdminCreateUser,
  type Request, type InsertRequest,
  type Subtask, type InsertSubtask,
  type Comment, type InsertComment,
  type Schedule, type InsertSchedule,
  type Unavailability, type InsertUnavailability,
  type ScheduleRole,
  type UpdateProfile,
  type AuditEntry, type InsertAuditEntry,
  type PushSubscription, MAX_PUSH_SUBSCRIPTIONS,
} from "@shared/schema";
import { randomBytes } from "node:crypto";
import { hashPassword, isHashed } from "./password";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  createUserAdmin(user: AdminCreateUser & { mustChangePassword?: boolean }): Promise<User>;
  getAllUsers(): Promise<User[]>;
  deleteUser(id: number): Promise<boolean>;
  updateUserAdmin(id: number, isAdmin: boolean): Promise<User | undefined>;
  updateUserRoles(id: number, roles: ScheduleRole[]): Promise<User | undefined>;
  updateUserProfile(id: number, profile: UpdateProfile): Promise<User | undefined>;
  // `mustChangePassword` acompanha a senha: some quando o dono escolhe a sua,
  // liga quando um admin define uma provisória.
  updateUserPassword(id: number, password: string, mustChangePassword?: boolean): Promise<User | undefined>;
  // Contador de senhas erradas e bloqueio permanente da conta
  updateUserLockState(id: number, state: { failedLoginCount: number; lockedAt: string | null }): Promise<User | undefined>;
  // Aparelhos inscritos para receber lembrete de escala
  addPushSubscription(id: number, subscription: PushSubscription): Promise<User | undefined>;
  removePushSubscription(id: number, endpoint: string): Promise<User | undefined>;
  // Auditoria (append-only)
  createAuditEntry(entry: InsertAuditEntry): Promise<AuditEntry>;
  getRecentAuditEntries(limit: number): Promise<AuditEntry[]>;
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
  // Unavailability
  getAllUnavailability(): Promise<Unavailability[]>;
  getUnavailabilityByUser(userId: number): Promise<Unavailability[]>;
  createUnavailability(entry: InsertUnavailability): Promise<Unavailability>;
  getUnavailabilityEntry(id: number): Promise<Unavailability | undefined>;
  deleteUnavailability(id: number): Promise<boolean>;
  // Schedules
  getAllSchedules(): Promise<Schedule[]>;
  getSchedule(id: number): Promise<Schedule | undefined>;
  createSchedule(schedule: InsertSchedule): Promise<Schedule>;
  updateSchedule(id: number, schedule: InsertSchedule): Promise<Schedule | undefined>;
  deleteSchedule(id: number): Promise<boolean>;
  // Reserva o envio de um lembrete: grava a marca só se ela ainda não existir e
  // devolve `false` quando já estava lá. É o que impede o lembrete duplicado
  // quando a Lambda é reexecutada — a marca é gravada ANTES do envio.
  claimReminder(scheduleId: number, key: string): Promise<boolean>;
}

// Profile fields start empty — the member fills them in on /usuarios
const emptyProfile = { email: null, phone: null, cellName: null, cellLeaders: null };

// Conta nova nasce liberada e sem histórico de erro
const unlocked = { failedLoginCount: 0, lockedAt: null };

// Ninguém nasce inscrito: a assinatura só existe depois que a pessoa permite a
// notificação no navegador dela
const noReminders = { pushSubscriptions: [] as PushSubscription[] };

export class MemStorage implements IStorage {
  private users: Map<number, User> = new Map();
  private auditLog: AuditEntry[] = [];
  private nextAuditId = 1;
  private requests: Map<number, Request> = new Map();
  private subtasks: Map<number, Subtask> = new Map();
  private comments: Map<number, Comment> = new Map();
  private schedules: Map<number, Schedule> = new Map();
  private unavailabilityEntries: Map<number, Unavailability> = new Map();
  private nextUserId = 1;
  private nextRequestId = 1000;
  private nextSubtaskId = 1;
  private nextCommentId = 1;
  private nextScheduleId = 1;
  private nextUnavailabilityId = 1;

  constructor() {
    // Seed users (dev only). Users with roles are the schedulable volunteers.
    // Nenhuma senha fica no código: usa DEV_SEED_PASSWORD ou sorteia uma e
    // imprime no console. O seed nunca roda em produção.
    if (process.env.NODE_ENV === "production") {
      throw new Error("MemStorage não pode ser usado em produção");
    }

    const seedPassword = process.env.DEV_SEED_PASSWORD ?? randomBytes(12).toString("hex");
    if (!process.env.DEV_SEED_PASSWORD) {
      console.log(`[seed] senha dos usuários de desenvolvimento: ${seedPassword}`);
    }

    const seedUsers: Array<{ username: string; displayName: string; isAdmin: boolean; roles: ScheduleRole[] }> = [
      { username: "admin", displayName: "Administrador", isAdmin: true, roles: [] },
      { username: "comunicacao", displayName: "Equipe Comunicação", isAdmin: false, roles: ["projecao"] },
      { username: "lucas", displayName: "Lucas Almeida", isAdmin: false, roles: ["fotografia", "filmmaker"] },
      { username: "mariana", displayName: "Mariana Souza", isAdmin: false, roles: ["fotografia"] },
      { username: "pedro", displayName: "Pedro Santos", isAdmin: false, roles: ["projecao", "transmissao"] },
      { username: "gabriel", displayName: "Gabriel Costa", isAdmin: false, roles: ["transmissao", "filmmaker"] },
    ];

    for (const user of seedUsers) {
      this.createUserAdmin({ ...user, password: seedPassword });
    }
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
    const user: User = {
      ...emptyProfile,
      ...unlocked,
      ...noReminders,
      id,
      ...data,
      password: isHashed(data.password) ? data.password : hashPassword(data.password),
      isAdmin: false,
      roles: data.roles ?? [],
      mustChangePassword: false,
    };
    this.users.set(id, user);
    return user;
  }

  async createUserAdmin(data: AdminCreateUser & { mustChangePassword?: boolean }): Promise<User> {
    const id = this.nextUserId++;
    const user: User = {
      ...emptyProfile,
      ...unlocked,
      ...noReminders,
      id,
      ...data,
      // O seed usa senhas em texto puro — guarda sempre o hash
      password: isHashed(data.password) ? data.password : hashPassword(data.password),
      isAdmin: data.isAdmin ?? false,
      roles: data.roles ?? [],
      mustChangePassword: data.mustChangePassword ?? false,
    };
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

  async updateUserRoles(id: number, roles: ScheduleRole[]): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    user.roles = roles;
    this.users.set(id, user);
    return user;
  }

  async updateUserProfile(id: number, profile: UpdateProfile): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    const updated: User = {
      ...user,
      displayName: profile.displayName,
      email: profile.email || null,
      phone: profile.phone || null,
      cellName: profile.cellName || null,
      cellLeaders: profile.cellLeaders || null,
    };
    this.users.set(id, updated);
    return updated;
  }

  async updateUserPassword(id: number, password: string, mustChangePassword = false): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    user.password = password;
    user.mustChangePassword = mustChangePassword;
    this.users.set(id, user);
    return user;
  }

  async addPushSubscription(id: number, subscription: PushSubscription): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    // Reinscrever o mesmo aparelho substitui a entrada antiga em vez de somar:
    // o navegador reemite a assinatura por conta própria (renovação de chave,
    // limpeza de dados) e o endereço continua sendo o mesmo aparelho.
    const outros = (user.pushSubscriptions ?? []).filter((s) => s.endpoint !== subscription.endpoint);
    const updated: User = {
      ...user,
      pushSubscriptions: [...outros, subscription].slice(-MAX_PUSH_SUBSCRIPTIONS),
    };
    this.users.set(id, updated);
    return updated;
  }

  async removePushSubscription(id: number, endpoint: string): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    const updated: User = {
      ...user,
      pushSubscriptions: (user.pushSubscriptions ?? []).filter((s) => s.endpoint !== endpoint),
    };
    this.users.set(id, updated);
    return updated;
  }

  async updateUserLockState(
    id: number,
    state: { failedLoginCount: number; lockedAt: string | null },
  ): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    const updated: User = { ...user, ...state };
    this.users.set(id, updated);
    return updated;
  }

  // Auditoria
  async createAuditEntry(entry: InsertAuditEntry): Promise<AuditEntry> {
    const record: AuditEntry = { id: this.nextAuditId++, at: new Date().toISOString(), ...entry };
    this.auditLog.push(record);
    return record;
  }

  async getRecentAuditEntries(limit: number): Promise<AuditEntry[]> {
    return [...this.auditLog].reverse().slice(0, limit);
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

  // Unavailability
  async getAllUnavailability(): Promise<Unavailability[]> {
    return Array.from(this.unavailabilityEntries.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  async getUnavailabilityByUser(userId: number): Promise<Unavailability[]> {
    return Array.from(this.unavailabilityEntries.values())
      .filter((u) => u.userId === userId)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async createUnavailability(data: InsertUnavailability): Promise<Unavailability> {
    const sameDate = Array.from(this.unavailabilityEntries.values()).filter(
      (u) => u.userId === data.userId && u.date === data.date
    );
    // "Dia inteiro" já cobre qualquer período pedido depois
    const wholeDay = sameDate.find((u) => u.period === "dia");
    if (wholeDay) return wholeDay;
    const duplicate = sameDate.find((u) => u.period === data.period);
    if (duplicate) return duplicate;
    // ...e, quando chega, absorve os períodos já registrados naquele dia
    if (data.period === "dia") {
      sameDate.forEach((u) => this.unavailabilityEntries.delete(u.id));
    }
    const id = this.nextUnavailabilityId++;
    const entry: Unavailability = { id, ...data, createdAt: new Date().toISOString() };
    this.unavailabilityEntries.set(id, entry);
    return entry;
  }

  async getUnavailabilityEntry(id: number): Promise<Unavailability | undefined> {
    return this.unavailabilityEntries.get(id);
  }

  async deleteUnavailability(id: number): Promise<boolean> {
    return this.unavailabilityEntries.delete(id);
  }

  // Schedules
  async getAllSchedules(): Promise<Schedule[]> {
    return Array.from(this.schedules.values()).sort((a, b) =>
      `${a.eventDate} ${a.eventTime}`.localeCompare(`${b.eventDate} ${b.eventTime}`)
    );
  }

  async getSchedule(id: number): Promise<Schedule | undefined> {
    return this.schedules.get(id);
  }

  async createSchedule(data: InsertSchedule): Promise<Schedule> {
    const id = this.nextScheduleId++;
    const schedule: Schedule = {
      id,
      ...data,
      notes: data.notes ?? null,
      createdAt: new Date().toISOString(),
      remindersSent: [],
    };
    this.schedules.set(id, schedule);
    return schedule;
  }

  async updateSchedule(id: number, data: InsertSchedule): Promise<Schedule | undefined> {
    // `data` não traz `remindersSent`: o histórico de lembretes sobrevive à
    // edição da escala, senão remarcar o horário reenviaria tudo.
    const existing = this.schedules.get(id);
    if (!existing) return undefined;
    const updated: Schedule = { ...existing, ...data, notes: data.notes ?? null };
    this.schedules.set(id, updated);
    return updated;
  }

  async deleteSchedule(id: number): Promise<boolean> {
    return this.schedules.delete(id);
  }

  async claimReminder(scheduleId: number, key: string): Promise<boolean> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) return false;
    const sent = schedule.remindersSent ?? [];
    if (sent.includes(key)) return false;
    this.schedules.set(scheduleId, { ...schedule, remindersSent: [...sent, key] });
    return true;
  }
}

import { DynamoStorage } from "./storage-dynamo";

export const storage = process.env.NODE_ENV === "production"
  ? new DynamoStorage()   // Lambda + DynamoDB
  : new MemStorage();     // Dev local (sem AWS)
