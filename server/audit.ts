import type { Request } from "express";
import { storage } from "./storage";
import type { AuditAction, User } from "@shared/schema";

// ─────────────────────────────────────────────────────────────────────────────
// Trilha de auditoria. Grava quem fez o quê, com quem e de onde — o suficiente
// para reconstruir um incidente depois. Nunca senha, nunca token.
// ─────────────────────────────────────────────────────────────────────────────

// Com "trust proxy" ligado, req.ip já é o cliente real e não o CloudFront.
function clientIp(req: Request): string | null {
  return req.ip ?? null;
}

interface AuditInput {
  action: AuditAction;
  actor?: Pick<User, "id" | "username"> | null;
  target?: Pick<User, "id" | "username"> | null;
  // Nome digitado no login quando a conta nem existe — não há usuário a apontar
  targetName?: string | null;
  detail?: string | null;
}

// A auditoria nunca derruba a operação que ela registra: se a gravação falhar,
// o login (ou o reset, ou a exclusão) segue e o erro vai só para o log.
export async function recordAudit(req: Request, input: AuditInput): Promise<void> {
  try {
    await storage.createAuditEntry({
      action: input.action,
      actorId: input.actor?.id ?? null,
      actorName: input.actor?.username ?? null,
      targetId: input.target?.id ?? null,
      targetName: input.target?.username ?? input.targetName ?? null,
      ip: clientIp(req),
      detail: input.detail ?? null,
    });
  } catch (err) {
    console.error("[audit] falha ao gravar entrada:", err);
  }
}
