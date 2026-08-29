import Constants from "expo-constants";
import { getItem, setItem, deleteItem } from "../utils/storage";

// API base URL: app.json extra.apiUrl is honoured when present (dev
// manifests always carry it). Release builds embed config at prebuild
// time, so this fallback is baked into the bundle as a plain constant.
const EXPO_API_URL = Constants.expoConfig?.extra?.apiUrl as string | undefined;

// Production API for release builds. https://api.matriq.com.ng works once
// the GCP firewall allows TCP 443 and DNS points at the matriq-server VM
// (e2-standard-4). Until then, dev builds use app.json extra.apiUrl
// (http://<vm-ip>/v1, kept in sync with the Caddyfile temporary-IP block),
// which works right now over the publicly open port 80. NOTE: the VM's
// ephemeral IP changes on restart — keep app.json extra.apiUrl in sync with
// the live instance (see caddy/Caddyfile).
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
    const raw = await getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as StoredTokens) : null;
  } catch {
    return null;
  }
}

async function saveTokens(tokens: StoredTokens): Promise<void> {
  await setItem(TOKEN_KEY, JSON.stringify(tokens));
}

export async function clearTokens(): Promise<void> {
  await deleteItem(TOKEN_KEY);
}

// ── Cached user profile ───────────────────────────────────────
// The last-known profile is stored on-device so the app can boot fully
// offline: the session is restored from disk and the profile renders
// immediately, then /me refreshes it in the background when a connection
// exists. Only an explicit sign-out or a server-rejected session clears it.

const CACHED_USER_KEY = "cached_user";

export async function saveCachedUser<T>(user: T): Promise<void> {
  await setItem(CACHED_USER_KEY, JSON.stringify(user));
}

export async function getCachedUser<T>(): Promise<T | null> {
  try {
    const raw = await getItem(CACHED_USER_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function clearCachedUser(): Promise<void> {
  await deleteItem(CACHED_USER_KEY);
}

// ── Session-expiry broadcast ────────────────────────────────
// When the refresh token can't be exchanged anymore, the API layer emits a
// global "session expired" event instead of leaving screens stranded with an
// inline 401 banner. AuthContext subscribes and clears the session, which
// makes the navigator redirect to the sign-in flow.

type SessionExpiredListener = () => void;
const sessionExpiredListeners = new Set<SessionExpiredListener>();

/** Subscribe to session expiry. Returns an unsubscribe function. */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(listener);
  return () => {
    sessionExpiredListeners.delete(listener);
  };
}

function emitSessionExpired(): void {
  sessionExpiredListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // A listener must never break the request that triggered the event.
    }
  });
}

/**
 * Decode the JWT `exp` claim (seconds). Returns null when the token isn't a
 * readable JWT — callers then treat it as valid and let the server decide.
 */
function jwtExpiry(token: string): number | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(b64)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    const payload = JSON.parse(json) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** True when the access token is missing, expired, or within `skewMs` of expiry. */
function isAccessTokenStale(token: string, skewMs = 60_000): boolean {
  const exp = jwtExpiry(token);
  if (exp === null) return false;
  return exp - Date.now() < skewMs;
}

// ── Errors ─────────────────────────────────────────────────────

/**
 * Error thrown by apiRequest. Carries the HTTP status and, when the backend
 * provides one, a stable machine-readable `code` (e.g. EMAIL_NOT_VERIFIED)
 * so screens can branch on it instead of parsing message text. Rate-limit
 * errors carry `retryAfterMs` so the UI can show an exact countdown.
 */
export class ApiError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly retryAfterMs?: number;
  /**
   * True ONLY when the server explicitly confirmed the session is dead (a
   * refresh token the server rejected). False when the token refresh couldn't
   * reach the server (offline) — the session is presumed still valid.
   */
  readonly sessionDead?: boolean;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
      retryAfterMs?: number;
      sessionDead?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.retryAfterMs = options.retryAfterMs;
    this.sessionDead = options.sessionDead;
  }
}

/**
 * Extract a human-readable message from a structured error body, which is
 * `{ statusCode, code, message, error: { message }, retryAfterMs? }`
 * (message may be a string or an array of validation messages). Falls back
 * to a generic HTTP message.
 */
function extractErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.message === "string") return b.message;
    if (Array.isArray(b.message)) {
      const msgs = b.message.filter((m): m is string => typeof m === "string");
      if (msgs.length > 0) return msgs.join(" ");
    }
    if (b.error && typeof b.error === "object") {
      const e = b.error as Record<string, unknown>;
      if (typeof e.message === "string") return e.message;
      if (Array.isArray(e.message)) {
        const msgs = e.message.filter(
          (m): m is string => typeof m === "string",
        );
        if (msgs.length > 0) return msgs.join(" ");
      }
    }
    if (typeof b.error === "string") return b.error;
  }
  return `HTTP ${status}`;
}

// ── HTTP client ────────────────────────────────────────────────

/**
 * Result of a refresh attempt. `sessionDead` is the important part: it is
 * ONLY true when the server explicitly rejected the refresh (invalid /
 * expired / revoked token) — never for a network failure. A network failure
 * keeps the stored tokens untouched so the app stays signed in offline and
 * retries later; it must not look like a dead session.
 */
interface RefreshResult {
  accessToken: string | null;
  sessionDead: boolean;
}

/**
 * Exchange the refresh token for a fresh access token. Concurrent callers
 * share one in-flight request (the backend rotates refresh tokens, so two
 * parallel refreshes would invalidate each other).
 *
 * - Server rejection → tokens cleared, `{ accessToken: null, sessionDead: true }`.
 * - Network failure → tokens KEPT (still signed in, just offline),
 *   `{ accessToken: null, sessionDead: false }`.
 * - No stored tokens → `{ accessToken: null, sessionDead: false }` (nothing
 *   to clear; the caller decides).
 */
let refreshPromise: Promise<RefreshResult> | null = null;

async function refreshAccessToken(): Promise<RefreshResult> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async (): Promise<RefreshResult> => {
    const tokens = await getTokens();
    if (!tokens?.refreshToken) {
      return { accessToken: null, sessionDead: false };
    }

    let res: Response;
    try {
      res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
    } catch {
      // Offline / DNS failure — the session is still valid on the server;
      // just can't be refreshed right now. Keep everything.
      return { accessToken: null, sessionDead: false };
    }

    if (!res.ok) {
      // The server rejected the refresh — the session is genuinely over.
      await clearTokens();
      return { accessToken: null, sessionDead: true };
    }

    try {
      const data = (await res.json()) as {
        accessToken: string;
        refreshToken: string;
      };
      await saveTokens({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });
      return { accessToken: data.accessToken, sessionDead: false };
    } catch {
      // Malformed success body — treat as a transient failure, keep tokens.
      return { accessToken: null, sessionDead: false };
    }
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

/**
 * True when an API error means the session itself is over (the server
 * explicitly confirmed it — a rejected refresh token). A plain 401 is NOT
 * enough to sign the user out: if the token refresh hit a network failure
 * while offline, the session may still be valid on the server, so the signed-
 * in state must be kept (see refreshAccessToken's "network failure keeps the
 * tokens" rule).
 */
export function isSessionDeadError(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    err.status === 401 &&
    err.sessionDead === true
  );
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const tokens = await getTokens();
  // Multipart bodies need fetch to set the boundary itself — never force
  // application/json on a FormData body.
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string>),
  };

  if (tokens?.accessToken) {
    headers["Authorization"] = `Bearer ${tokens.accessToken}`;
  }

  let res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  // Whether the server confirmed the session is gone. Stays false on a
  // network failure during refresh — the session is still valid offline.
  let confirmedDead = false;

  // Global 401 interceptor: exchange the refresh token in the background and
  // retry the failed request once, transparently. A failed exchange (or a
  // second 401 with the fresh token) means the session is gone for good —
  // broadcast it so the app redirects to sign-in instead of stranding the
  // screen with an inline error banner.
  if (res.status === 401) {
    const { accessToken, sessionDead } = await refreshAccessToken();
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
      res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
      });
      if (res.status === 401) {
        confirmedDead = true;
        await clearTokens();
        emitSessionExpired();
      }
    } else if (sessionDead) {
      confirmedDead = true;
      await clearTokens();
      emitSessionExpired();
    }
    // else: refresh hit a network problem — the session is still valid on
    // the server, so DON'T sign the user out (confirmedDead stays false).
    // The original 401 error propagates to the caller, but isSessionDeadError
    // correctly reports the session as NOT dead.
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const code = typeof body?.code === "string" ? body.code : undefined;
    const retryAfterMs =
      typeof body?.retryAfterMs === "number" ? body.retryAfterMs : undefined;
    throw new ApiError(extractErrorMessage(body, res.status), {
      status: res.status,
      code,
      retryAfterMs,
      sessionDead: confirmedDead,
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
  /** Multipart upload (FormData body — Content-Type boundary handled by fetch). */
  upload: <T>(path: string, formData: FormData) =>
    apiRequest<T>(path, { method: "POST", body: formData }),
};

/**
 * Authorization header for direct (non-JSON) downloads — e.g. the Vault's
 * streaming file endpoint. Returns null when there's no session so callers
 * can fall back to an error.
 *
 * Refreshes first when the access token is expired or nearly so, so a
 * long-running download can't open with a stale token and 401 mid-stream.
 * A failed refresh broadcasts session expiry (the app redirects to sign-in)
 * and returns null.
 */
export async function authHeaders(): Promise<Record<string, string> | null> {
  const tokens = await getTokens();
  if (!tokens?.accessToken) return null;

  if (isAccessTokenStale(tokens.accessToken)) {
    const { accessToken, sessionDead } = await refreshAccessToken();
    if (!accessToken) {
      // Only a genuinely dead session signs the user out; being offline just
      // means this download can't run right now.
      if (sessionDead) {
        await clearTokens();
        emitSessionExpired();
      }
      return null;
    }
    return { Authorization: `Bearer ${accessToken}` };
  }

  return { Authorization: `Bearer ${tokens.accessToken}` };
}

export { saveTokens, getTokens };
