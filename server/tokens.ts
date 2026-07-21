import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "crypto";
import type { User } from "@shared/schema";

// ─────────────────────────────────────────────────────────────────────────────
// Sessões via JWT assinado (HS256). Sem estado no servidor — funciona bem na
// Lambda, onde não há memória compartilhada entre invocações.
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_TTL = "12h";
const ISSUER = "bdn-comunicacao";

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
