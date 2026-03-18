import { useState, useCallback } from "react";

interface AuthUser {
  id: number;
  username: string;
  displayName: string;
}

let currentUser: AuthUser | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
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
    user: currentUser,
    login: (user: AuthUser) => {
      currentUser = user;
      notify();
    },
    logout: () => {
      currentUser = null;
      notify();
    },
    isAuthenticated: currentUser !== null,
  };
}
