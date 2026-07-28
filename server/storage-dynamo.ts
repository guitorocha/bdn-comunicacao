import {
  DynamoDBClient,
  type DynamoDBClientConfig,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

import {
  type User, type InsertUser, type AdminCreateUser,
  type Request, type InsertRequest,
  type Subtask, type InsertSubtask,
  type Comment, type InsertComment,
  type Schedule, type InsertSchedule,
  type Unavailability, type InsertUnavailability, unavailabilityPeriod,
  type ScheduleRole,
  type UpdateProfile,
  type AuditEntry, type InsertAuditEntry,
} from "@shared/schema";

import type { IStorage } from "./storage";

// ─────────────────────────────────────────────────────────────────────────────
// DynamoDB client — em produção (Lambda) usa a IAM Role automaticamente.
// Em dev local, usa o profile configurado no AWS CLI (aws configure).
// ─────────────────────────────────────────────────────────────────────────────
const config: DynamoDBClientConfig = {
  region: process.env.DYNAMODB_REGION ?? "us-east-1",
};

const client = new DynamoDBClient(config);
const db = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

// Nomes das tabelas (injetados pelo Terraform via env vars na Lambda)
const TABLE_USERS    = process.env.TABLE_USERS    ?? "bdn-comunicacao-users";
const TABLE_REQUESTS = process.env.TABLE_REQUESTS ?? "bdn-comunicacao-requests";
const TABLE_SUBTASKS = process.env.TABLE_SUBTASKS ?? "bdn-comunicacao-subtasks";
const TABLE_COMMENTS = process.env.TABLE_COMMENTS ?? "bdn-comunicacao-comments";
const TABLE_SCHEDULES      = process.env.TABLE_SCHEDULES      ?? "bdn-comunicacao-schedules";
const TABLE_UNAVAILABILITY = process.env.TABLE_UNAVAILABILITY ?? "bdn-comunicacao-unavailability";
const TABLE_AUDIT          = process.env.TABLE_AUDIT          ?? "bdn-comunicacao-audit";

// Users created before the escalas/perfil features don't have all attributes
function normalizeUser(item: Record<string, unknown> | undefined): User | undefined {
  if (!item) return undefined;
  const user = item as User;
  return {
    ...user,
    roles: (item.roles as ScheduleRole[] | undefined) ?? [],
    email: user.email ?? null,
    phone: user.phone ?? null,
    cellName: user.cellName ?? null,
    cellLeaders: user.cellLeaders ?? null,
    // Contas anteriores à troca obrigatória não têm o atributo — não é para
    // barrar quem já escolheu a própria senha.
    mustChangePassword: user.mustChangePassword ?? false,
    // Idem para o bloqueio: sem o atributo, a conta está liberada e sem erros
    failedLoginCount: user.failedLoginCount ?? 0,
    lockedAt: user.lockedAt ?? null,
  };
}

// Indisponibilidades registradas antes do campo `period` bloqueavam o dia inteiro
function normalizeUnavailability(item: Record<string, unknown>): Unavailability {
  const entry = item as Unavailability;
  return { ...entry, period: unavailabilityPeriod(entry.period) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Geração de IDs únicos baseada em timestamp + random.
// DynamoDB não possui auto-increment nativo.
// Para o volume de uso (igreja local) isso é suficiente e seguro.
// ─────────────────────────────────────────────────────────────────────────────
// Profile fields start empty — the member fills them in on /usuarios
const emptyProfile = { email: null, phone: null, cellName: null, cellLeaders: null };

// Conta nova nasce liberada e sem histórico de erro
const unlocked = { failedLoginCount: 0, lockedAt: null };

function generateId(): number {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

// IDs de requests começam acima de 1000 para manter
// compatibilidade visual com o MemStorage (nextRequestId = 1000)
function generateRequestId(): number {
  return 1000 + (Date.now() % 1_000_000) * 1000 + Math.floor(Math.random() * 1000);
}

// ─────────────────────────────────────────────────────────────────────────────
// DynamoStorage — implementa IStorage usando DynamoDB
// ─────────────────────────────────────────────────────────────────────────────
export class DynamoStorage implements IStorage {

  // ── Users ────────────────────────────────────────────────────────────────

  async getUser(id: number): Promise<User | undefined> {
    const result = await db.send(new GetCommand({
      TableName: TABLE_USERS,
      Key: { id },
    }));
    return normalizeUser(result.Item);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.send(new QueryCommand({
      TableName: TABLE_USERS,
      IndexName: "username-index",
      KeyConditionExpression: "username = :u",
      ExpressionAttributeValues: { ":u": username },
      Limit: 1,
    }));
    return normalizeUser(result.Items?.[0]);
  }

  async createUser(data: InsertUser): Promise<User> {
    const user: User = {
      ...emptyProfile,
      ...unlocked,
      id: generateId(),
      ...data,
      isAdmin: false,
      roles: data.roles ?? [],
      mustChangePassword: false,
    };
    await db.send(new PutCommand({ TableName: TABLE_USERS, Item: user }));
    return user;
  }

  async createUserAdmin(data: AdminCreateUser & { mustChangePassword?: boolean }): Promise<User> {
    const user: User = {
      ...emptyProfile,
      ...unlocked,
      id: generateId(),
      ...data,
      isAdmin: data.isAdmin ?? false,
      roles: data.roles ?? [],
      mustChangePassword: data.mustChangePassword ?? false,
    };
    await db.send(new PutCommand({ TableName: TABLE_USERS, Item: user }));
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    const result = await db.send(new ScanCommand({ TableName: TABLE_USERS }));
    return (result.Items ?? []).map((item) => normalizeUser(item)!) as User[];
  }

  async deleteUser(id: number): Promise<boolean> {
    await db.send(new DeleteCommand({ TableName: TABLE_USERS, Key: { id } }));
    return true;
  }

  async updateUserAdmin(id: number, isAdmin: boolean): Promise<User | undefined> {
    const result = await db.send(new UpdateCommand({
      TableName: TABLE_USERS,
      Key: { id },
      UpdateExpression: "SET isAdmin = :a",
      ExpressionAttributeValues: { ":a": isAdmin },
      ConditionExpression: "attribute_exists(id)",
      ReturnValues: "ALL_NEW",
    }));
    return normalizeUser(result.Attributes);
  }

  async updateUserRoles(id: number, roles: ScheduleRole[]): Promise<User | undefined> {
    // "roles" é palavra reservada no DynamoDB — usa alias #r
    const result = await db.send(new UpdateCommand({
      TableName: TABLE_USERS,
      Key: { id },
      UpdateExpression: "SET #r = :r",
      ExpressionAttributeNames: { "#r": "roles" },
      ExpressionAttributeValues: { ":r": roles },
      ConditionExpression: "attribute_exists(id)",
      ReturnValues: "ALL_NEW",
    }));
    return normalizeUser(result.Attributes);
  }

  async updateUserProfile(id: number, profile: UpdateProfile): Promise<User | undefined> {
    const result = await db.send(new UpdateCommand({
      TableName: TABLE_USERS,
      Key: { id },
      UpdateExpression: "SET #dn = :dn, #em = :em, #ph = :ph, #cn = :cn, #cl = :cl",
      ExpressionAttributeNames: {
        "#dn": "displayName",
        "#em": "email",
        "#ph": "phone",
        "#cn": "cellName",
        "#cl": "cellLeaders",
      },
      ExpressionAttributeValues: {
        ":dn": profile.displayName,
        ":em": profile.email || null,
        ":ph": profile.phone || null,
        ":cn": profile.cellName || null,
        ":cl": profile.cellLeaders || null,
      },
      ConditionExpression: "attribute_exists(id)",
      ReturnValues: "ALL_NEW",
    }));
    return normalizeUser(result.Attributes);
  }

  async updateUserPassword(id: number, password: string, mustChangePassword = false): Promise<User | undefined> {
    const result = await db.send(new UpdateCommand({
      TableName: TABLE_USERS,
      Key: { id },
      UpdateExpression: "SET #p = :p, #m = :m",
      ExpressionAttributeNames: { "#p": "password", "#m": "mustChangePassword" },
      ExpressionAttributeValues: { ":p": password, ":m": mustChangePassword },
      ConditionExpression: "attribute_exists(id)",
      ReturnValues: "ALL_NEW",
    }));
    return normalizeUser(result.Attributes);
  }

  async updateUserLockState(
    id: number,
    state: { failedLoginCount: number; lockedAt: string | null },
  ): Promise<User | undefined> {
    const result = await db.send(new UpdateCommand({
      TableName: TABLE_USERS,
      Key: { id },
      UpdateExpression: "SET #f = :f, #l = :l",
      ExpressionAttributeNames: { "#f": "failedLoginCount", "#l": "lockedAt" },
      ExpressionAttributeValues: { ":f": state.failedLoginCount, ":l": state.lockedAt },
      ConditionExpression: "attribute_exists(id)",
      ReturnValues: "ALL_NEW",
    }));
    return normalizeUser(result.Attributes);
  }

  // ── Auditoria ─────────────────────────────────────────────────────────────
  // Append-only: só há escrita e leitura. Nada aqui é atualizado ou apagado — a
  // IAM da Lambda também não concede DeleteItem nesta tabela.

  async createAuditEntry(entry: InsertAuditEntry): Promise<AuditEntry> {
    const record: AuditEntry = { id: generateId(), at: new Date().toISOString(), ...entry };
    await db.send(new PutCommand({ TableName: TABLE_AUDIT, Item: record }));
    return record;
  }

  async getRecentAuditEntries(limit: number): Promise<AuditEntry[]> {
    // Scan + ordenação em memória: no volume desta igreja a tabela é pequena.
    // Se um dia crescer, o caminho é um GSI por dia (hash "at" truncado).
    const result = await db.send(new ScanCommand({ TableName: TABLE_AUDIT }));
    const items = (result.Items ?? []) as AuditEntry[];
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  }

  // ── Requests ─────────────────────────────────────────────────────────────

  async getRequest(id: number): Promise<Request | undefined> {
    const result = await db.send(new GetCommand({
      TableName: TABLE_REQUESTS,
      Key: { id },
    }));
    return result.Item as Request | undefined;
  }

  async getAllRequests(): Promise<Request[]> {
    const result = await db.send(new ScanCommand({ TableName: TABLE_REQUESTS }));
    const items = (result.Items ?? []) as Request[];
    return items.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async createRequest(data: InsertRequest): Promise<Request> {
    const request: Request = {
      id: generateRequestId(),
      ...data,
      status: "pendente",
      createdAt: new Date().toISOString(),
    };
    await db.send(new PutCommand({ TableName: TABLE_REQUESTS, Item: request }));
    return request;
  }

  async updateRequestStatus(id: number, status: string): Promise<Request | undefined> {
    // Nota: "status" é palavra reservada no DynamoDB — usa alias #s
    const result = await db.send(new UpdateCommand({
      TableName: TABLE_REQUESTS,
      Key: { id },
      UpdateExpression: "SET #s = :s",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":s": status },
      ConditionExpression: "attribute_exists(id)",
      ReturnValues: "ALL_NEW",
    }));
    return result.Attributes as Request | undefined;
  }

  async getRequestsByMinistryAndDate(
    ministry: string,
    eventDate: string
  ): Promise<Request[]> {
    // Usa o GSI "ministry-date-index" criado no Terraform (dynamodb.tf)
    const result = await db.send(new QueryCommand({
      TableName: TABLE_REQUESTS,
      IndexName: "ministry-date-index",
      KeyConditionExpression: "ministry = :m AND eventDate = :d",
      FilterExpression: "#s <> :cancelled",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":m": ministry,
        ":d": eventDate,
        ":cancelled": "cancelada",
      },
    }));
    return (result.Items ?? []) as Request[];
  }

  // ── Subtasks ──────────────────────────────────────────────────────────────

  async getSubtasksByRequest(requestId: number): Promise<Subtask[]> {
    const result = await db.send(new QueryCommand({
      TableName: TABLE_SUBTASKS,
      IndexName: "requestId-index",
      KeyConditionExpression: "requestId = :r",
      ExpressionAttributeValues: { ":r": requestId },
    }));
    const items = (result.Items ?? []) as Subtask[];
    return items.sort((a, b) => a.id - b.id);
  }

  async createSubtask(data: InsertSubtask): Promise<Subtask> {
    const subtask: Subtask = {
      id: generateId(),
      ...data,
      completed: data.completed ?? false,
      createdAt: new Date().toISOString(),
    };
    await db.send(new PutCommand({ TableName: TABLE_SUBTASKS, Item: subtask }));
    return subtask;
  }

  async toggleSubtask(id: number): Promise<Subtask | undefined> {
    // Lê o valor atual de "completed" e inverte
    const current = await db.send(new GetCommand({
      TableName: TABLE_SUBTASKS,
      Key: { id },
    }));
    if (!current.Item) return undefined;

    const result = await db.send(new UpdateCommand({
      TableName: TABLE_SUBTASKS,
      Key: { id },
      UpdateExpression: "SET completed = :c",
      ExpressionAttributeValues: { ":c": !current.Item.completed },
      ConditionExpression: "attribute_exists(id)",
      ReturnValues: "ALL_NEW",
    }));
    return result.Attributes as Subtask | undefined;
  }

  async deleteSubtask(id: number): Promise<boolean> {
    await db.send(new DeleteCommand({ TableName: TABLE_SUBTASKS, Key: { id } }));
    return true;
  }

  // ── Comments ──────────────────────────────────────────────────────────────

  async getCommentsByRequest(requestId: number): Promise<Comment[]> {
    const result = await db.send(new QueryCommand({
      TableName: TABLE_COMMENTS,
      IndexName: "requestId-index",
      KeyConditionExpression: "requestId = :r",
      ExpressionAttributeValues: { ":r": requestId },
    }));
    const items = (result.Items ?? []) as Comment[];
    return items.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  async createComment(data: InsertComment): Promise<Comment> {
    const comment: Comment = {
      id: generateId(),
      ...data,
      createdAt: new Date().toISOString(),
    };
    await db.send(new PutCommand({ TableName: TABLE_COMMENTS, Item: comment }));
    return comment;
  }

  // ── Unavailability ────────────────────────────────────────────────────────

  async getAllUnavailability(): Promise<Unavailability[]> {
    const result = await db.send(new ScanCommand({ TableName: TABLE_UNAVAILABILITY }));
    const items = (result.Items ?? []).map(normalizeUnavailability);
    return items.sort((a, b) => a.date.localeCompare(b.date));
  }

  async getUnavailabilityByUser(userId: number): Promise<Unavailability[]> {
    const result = await db.send(new QueryCommand({
      TableName: TABLE_UNAVAILABILITY,
      IndexName: "userId-index",
      KeyConditionExpression: "userId = :u",
      ExpressionAttributeValues: { ":u": userId },
    }));
    const items = (result.Items ?? []).map(normalizeUnavailability);
    return items.sort((a, b) => a.date.localeCompare(b.date));
  }

  async createUnavailability(data: InsertUnavailability): Promise<Unavailability> {
    const sameDate = (await this.getUnavailabilityByUser(data.userId))
      .filter((u) => u.date === data.date);
    // "Dia inteiro" já cobre qualquer período pedido depois
    const wholeDay = sameDate.find((u) => u.period === "dia");
    if (wholeDay) return wholeDay;
    const duplicate = sameDate.find((u) => u.period === data.period);
    if (duplicate) return duplicate;
    // ...e, quando chega, absorve os períodos já registrados naquele dia
    if (data.period === "dia") {
      await Promise.all(sameDate.map((u) => this.deleteUnavailability(u.id)));
    }

    const entry: Unavailability = {
      id: generateId(),
      ...data,
      createdAt: new Date().toISOString(),
    };
    await db.send(new PutCommand({ TableName: TABLE_UNAVAILABILITY, Item: entry }));
    return entry;
  }

  async getUnavailabilityEntry(id: number): Promise<Unavailability | undefined> {
    const result = await db.send(new GetCommand({ TableName: TABLE_UNAVAILABILITY, Key: { id } }));
    return result.Item ? normalizeUnavailability(result.Item) : undefined;
  }

  async deleteUnavailability(id: number): Promise<boolean> {
    await db.send(new DeleteCommand({ TableName: TABLE_UNAVAILABILITY, Key: { id } }));
    return true;
  }

  // ── Schedules ─────────────────────────────────────────────────────────────

  async getAllSchedules(): Promise<Schedule[]> {
    const result = await db.send(new ScanCommand({ TableName: TABLE_SCHEDULES }));
    const items = (result.Items ?? []) as Schedule[];
    return items.sort((a, b) =>
      `${a.eventDate} ${a.eventTime}`.localeCompare(`${b.eventDate} ${b.eventTime}`)
    );
  }

  async getSchedule(id: number): Promise<Schedule | undefined> {
    const result = await db.send(new GetCommand({ TableName: TABLE_SCHEDULES, Key: { id } }));
    return result.Item as Schedule | undefined;
  }

  async createSchedule(data: InsertSchedule): Promise<Schedule> {
    const schedule: Schedule = {
      id: generateId(),
      ...data,
      notes: data.notes ?? null,
      createdAt: new Date().toISOString(),
    };
    await db.send(new PutCommand({ TableName: TABLE_SCHEDULES, Item: schedule }));
    return schedule;
  }

  async updateSchedule(id: number, data: InsertSchedule): Promise<Schedule | undefined> {
    const current = await db.send(new GetCommand({ TableName: TABLE_SCHEDULES, Key: { id } }));
    if (!current.Item) return undefined;
    const updated: Schedule = {
      ...(current.Item as Schedule),
      ...data,
      notes: data.notes ?? null,
    };
    await db.send(new PutCommand({ TableName: TABLE_SCHEDULES, Item: updated }));
    return updated;
  }

  async deleteSchedule(id: number): Promise<boolean> {
    await db.send(new DeleteCommand({ TableName: TABLE_SCHEDULES, Key: { id } }));
    return true;
  }
}
