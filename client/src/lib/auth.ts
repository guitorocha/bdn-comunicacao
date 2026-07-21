import { useState, useCallback } from "react";
import type { ScheduleRole } from "@shared/schema";

interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  isAdmin: boolean;
  roles: ScheduleRole[];
  email?: string | null;
  phone?: string | null;
  cellName?: string | null;
  cellLeaders?: string | null;
}

interface StoredSession {
  user: AuthUser;
}

// A sessão em si vive num cookie HttpOnly emitido pelo servidor — o navegador
// o envia sozinho e nenhum script consegue lê-lo. Aqui fica só o usuário, que
// é dado de exibição (nome, papéis, flag de admin) e não dá acesso a nada:
// quem manda é sempre o cookie, revalidado no servidor a cada request.
const STORAGE_KEY = "bdn-auth-user-v2";
// Chaves antigas guardavam o token de sessão em texto puro — apaga na primeira
// carga do app novo, para não deixar credencial parada no localStorage.
const LEGACY_STORAGE_KEYS = ["bdn-auth-session", "bdn-auth-user"];

function loadStoredSession(): StoredSession | null {
  try {
    LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.user?.id !== "number") return null;
    return { user: { ...parsed.user, roles: parsed.user.roles ?? [] } };
  } catch {
    return null;
  }
}

let session: StoredSession | null = loadStoredSession();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function persist() {
  if (session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
  notify();
}

export function getCurrentUser(): AuthUser | null {
  return session?.user ?? null;
}

// Chamado quando o servidor recusa o cookie (expirado, senha trocada, conta
// removida): derruba a sessão local para o app voltar ao login.
export function clearSession() {
  if (!session) return;
  session = null;
  persist();
}

export function useAuth() {
  const [, setTick] = useState(0);

  const subscribe = useCallback(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);

  // Subscribe on mount
  useState(() => {
    const unsub = subscribe();
    return unsub;
  });

  return {
    user: session?.user ?? null,
    login: (user: AuthUser) => {
      session = { user: { ...user, roles: user.roles ?? [] } };
      persist();
    },
    // Keeps the stored user in sync after the member edits their profile
    updateUser: (patch: Partial<AuthUser>) => {
      if (!session) return;
      session = {
        ...session,
        user: { ...session.user, ...patch, roles: patch.roles ?? session.user.roles },
      };
      persist();
    },
    logout: () => {
      session = null;
      persist();
    },
    isAuthenticated: session !== null,
  };
}
