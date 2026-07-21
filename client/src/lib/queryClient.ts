import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { clearSession, getAuthToken } from "./auth";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Token expirado/inválido: encerra a sessão local para o app voltar ao login
function handleUnauthorized(res: Response) {
  if (res.status === 401) clearSession();
}

async function throwIfResNotOk(res: Response) {
  if (res.ok) return;
  const text = await res.text();
  // A API responde erros como { message }: usa isso no toast em vez do corpo cru
  let message = text || res.statusText;
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.message === "string") message = parsed.message;
  } catch {
    // corpo não é JSON — mantém o texto original
  }
  throw new Error(message);
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(),
    },
    body: data ? JSON.stringify(data) : undefined,
  });

  handleUnauthorized(res);
  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(`${API_BASE}${queryKey.join("/")}`, {
      headers: authHeaders(),
    });

    handleUnauthorized(res);

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
