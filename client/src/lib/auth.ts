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
  token: string;
  user: AuthUser;
}

const STORAGE_KEY = "bdn-auth-session";
const LEGACY_STORAGE_KEY = "bdn-auth-user";

function loadStoredSession(): StoredSession | null {
  try {
    // Sessões antigas guardavam só o usuário (sem token) — não valem mais
    localStorage.removeItem(LEGACY_STORAGE_KEY);

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.token !== "string" || typeof parsed?.user?.id !== "number") return null;
    return { token: parsed.token, user: { ...parsed.user, roles: parsed.user.roles ?? [] } };
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

// Used by the API client to attach the auth header
export function getCurrentUser(): AuthUser | null {
  return session?.user ?? null;
}

export function getAuthToken(): string | null {
  return session?.token ?? null;
}

// Chamado quando o servidor recusa o token (expirado, senha trocada, conta
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
    token: session?.token ?? null,
    login: (user: AuthUser, token: string) => {
      session = { token, user: { ...user, roles: user.roles ?? [] } };
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
    // Trocar a senha invalida o token antigo — o servidor devolve um novo
    setToken: (token: string) => {
      if (!session) return;
      session = { ...session, token };
      persist();
    },
    logout: () => {
      session = null;
      persist();
    },
    isAuthenticated: session !== null,
  };
}
