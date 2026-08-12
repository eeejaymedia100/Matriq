import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

// API base URL: app.json extra.apiUrl is honoured when present (dev
// manifests always carry it). Release builds embed config at prebuild
// time, so this fallback is baked into the bundle as a plain constant.
const EXPO_API_URL = Constants.expoConfig?.extra?.apiUrl as string | undefined;

// Production API for release builds. https://api.matriq.com.ng works once
// the GCP firewall allows TCP 443 and DNS points at the matriq-server VM
// (35.204.163.157, e2-standard-4). Until then, dev builds use app.json
// extra.apiUrl (http://35.204.163.157/v1), which works right now over the
// publicly open port 80.
const TEST_API_URL = "https://api.matriq.com.ng/v1";

// Release builds embed this constant at prebuild time; dev builds honour
// app.json extra.apiUrl (kept in sync below) so development keeps working
// while the production HTTPS domain is being wired up.
export const API_BASE = __DEV__
  ? (EXPO_API_URL ?? TEST_API_URL)
  : TEST_API_URL;

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

// ── Errors ─────────────────────────────────────────────────────

/**
 * Error thrown by apiRequest. Carries the HTTP status and, when the backend
 * provides one, a stable machine-readable `code` (e.g. EMAIL_NOT_VERIFIED)
 * so screens can branch on it instead of parsing message text.
 */
export class ApiError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(
    message: string,
    options: { status?: number; code?: string } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
  }
}

/**
 * Extract a human-readable message from a NestJS error body, which is
 * `{ message, error, statusCode }` (message may be a string or an array of
 * validation messages). Falls back to a generic HTTP message.
 */
function extractErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.message === "string") return b.message;
    if (b.error && typeof b.error === "object") {
      const e = b.error as Record<string, unknown>;
      if (typeof e.message === "string") return e.message;
    }
    if (typeof b.error === "string") return b.error;
  }
  return `HTTP ${status}`;
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
    const body = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const code = typeof body?.code === "string" ? body.code : undefined;
    throw new ApiError(extractErrorMessage(body, res.status), {
      status: res.status,
      code,
    });
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
