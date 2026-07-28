import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "crypto";
import type { Response } from "express";
import type { User } from "@shared/schema";

// ─────────────────────────────────────────────────────────────────────────────
// Sessões via JWT assinado (HS256). Sem estado no servidor — funciona bem na
// Lambda, onde não há memória compartilhada entre invocações.
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_TTL = "12h";
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const ISSUER = "bdn-comunicacao";

// O token vive num cookie HttpOnly: JavaScript da página não consegue lê-lo,
// então um XSS (dependência comprometida, script de terceiro) não leva a sessão
// embora. Antes ele ficava no localStorage, onde qualquer script alcançava.
export const SESSION_COOKIE = "bdn_session";

function resolveSecret(): string {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;

  if (process.env.NODE_ENV === "production") {
    // Falha fechada: sem segredo forte não há como emitir sessões confiáveis
    throw new Error(
      "JWT_SECRET ausente ou muito curto (mínimo 32 caracteres). Configure a variável de ambiente da Lambda."
    );
  }

  // Dev: segredo efêmero — reiniciar o servidor invalida as sessões locais
  console.warn("[auth] JWT_SECRET não definido — usando segredo temporário (apenas dev)");
  return randomBytes(48).toString("hex");
}

const SECRET = resolveSecret();

// Impressão digital da senha atual: muda quando a senha muda, o que invalida
// todos os tokens emitidos antes da troca (sem precisar de lista de revogação).
function passwordFingerprint(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);
}

export interface TokenPayload {
  sub: string;
  pv: string;
}

export function signToken(user: User): string {
  return jwt.sign({ pv: passwordFingerprint(user.password) }, SECRET, {
    algorithm: "HS256",
    subject: String(user.id),
    issuer: ISSUER,
    expiresIn: TOKEN_TTL,
  });
}

export function verifyToken(token: string): TokenPayload | undefined {
  try {
    const payload = jwt.verify(token, SECRET, {
      algorithms: ["HS256"], // impede "alg: none" e confusão de algoritmo
      issuer: ISSUER,
    });
    if (typeof payload === "string" || !payload.sub || typeof payload.pv !== "string") {
      return undefined;
    }
    return { sub: payload.sub, pv: payload.pv };
  } catch {
    return undefined;
  }
}

// O token só vale enquanto a senha for a mesma de quando ele foi emitido
export function matchesCurrentPassword(payload: TokenPayload, user: User): boolean {
  return payload.pv === passwordFingerprint(user.password);
}

// sameSite "strict" é o que segura CSRF agora que o navegador manda o cookie
// sozinho: requisição vinda de outro site não carrega o cookie. Em dev o app
// roda em http://localhost, onde "secure" impediria o cookie de ser gravado.
function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
  };
}

export function setSessionCookie(res: Response, user: User): void {
  res.cookie(SESSION_COOKIE, signToken(user), { ...cookieOptions(), maxAge: TOKEN_TTL_MS });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}
