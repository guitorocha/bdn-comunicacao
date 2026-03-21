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

// ─────────────────────────────────────────────────────────────────────────────
// Geração de IDs únicos baseada em timestamp + random.
// DynamoDB não possui auto-increment nativo.
// Para o volume de uso (igreja local) isso é suficiente e seguro.
// ─────────────────────────────────────────────────────────────────────────────
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
    return result.Item as User | undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.send(new QueryCommand({
      TableName: TABLE_USERS,
      IndexName: "username-index",
      KeyConditionExpression: "username = :u",
      ExpressionAttributeValues: { ":u": username },
      Limit: 1,
    }));
    return result.Items?.[0] as User | undefined;
  }

  async createUser(data: InsertUser): Promise<User> {
    const user: User = { id: generateId(), ...data, isAdmin: false };
    await db.send(new PutCommand({ TableName: TABLE_USERS, Item: user }));
    return user;
  }

  async createUserAdmin(data: AdminCreateUser): Promise<User> {
    const user: User = {
      id: generateId(),
      ...data,
      isAdmin: data.isAdmin ?? false,
    };
    await db.send(new PutCommand({ TableName: TABLE_USERS, Item: user }));
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    const result = await db.send(new ScanCommand({ TableName: TABLE_USERS }));
    return (result.Items ?? []) as User[];
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
    return result.Attributes as User | undefined;
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
}
