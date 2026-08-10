import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

// API base URL from app.json extra, overridable via app.config.js or environment.
// Default: https://api.matriq.app/v1 (production).
// Use app.json extra.apiUrl to change without recompiling.
const EXPO_API_URL = Constants.expoConfig?.extra?.apiUrl as string | undefined;

export const API_BASE = __DEV__
  ? (EXPO_API_URL ?? "http://10.0.2.2:3000/v1")
  : (EXPO_API_URL ?? "https://api.matriq.app/v1");

const TOKEN_KEY = "auth_tokens";

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

// ── Token storage ──────────────────────────────────────────────

async function getTokens(): Promise<StoredTokens | null> {
  try {
    const raw = await SecureStore.getItemAsync(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as StoredTokens) : null;
  } catch {
    return null;
  }
}

async function saveTokens(tokens: StoredTokens): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(tokens));
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

// ── HTTP client ────────────────────────────────────────────────

async function refreshAccessToken(): Promise<string | null> {
  const tokens = await getTokens();
  if (!tokens?.refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });

    if (!res.ok) {
      await clearTokens();
      return null;
    }

    const data = (await res.json()) as {
      accessToken: string;
      refreshToken: string;
    };
    await saveTokens({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    });
    return data.accessToken;
  } catch {
    await clearTokens();
    return null;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const tokens = await getTokens();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (tokens?.accessToken) {
    headers["Authorization"] = `Bearer ${tokens.accessToken}`;
  }

  let res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  // Auto-refresh on 401
  if (res.status === 401 && tokens?.refreshToken) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
      });
    }
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: { message: "Network error" } }))) as {
      error: { message: string };
    };
    throw new Error(err.error?.message ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ── Convenience methods ────────────────────────────────────────

export const api = {
  get: <T>(path: string) => apiRequest<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(path: string) =>
    apiRequest<T>(path, { method: "DELETE" }),
};

export { saveTokens, getTokens };
