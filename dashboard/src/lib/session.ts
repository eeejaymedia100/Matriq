import { NextResponse } from "next/server";

/**
 * Server-side session helpers.
 *
 * Tokens live in httpOnly, sameSite cookies — never in localStorage. The access
 * token is returned to the client (in memory) only because the browser must sign
 * API requests with it; the refresh token never leaves the server.
 */

export const ACCESS_COOKIE = "matriq_at";
export const REFRESH_COOKIE = "matriq_rt";
export const ACCESS_TTL = 15 * 60; // 15 minutes
export const REFRESH_TTL = 7 * 24 * 60 * 60; // 7 days

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/v1";

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export function setAuthCookies(
  res: NextResponse,
  accessToken: string,
  refreshToken: string,
) {
  res.cookies.set(ACCESS_COOKIE, accessToken, cookieOptions(ACCESS_TTL));
  res.cookies.set(REFRESH_COOKIE, refreshToken, cookieOptions(REFRESH_TTL));
}

export function clearAuthCookies(res: NextResponse) {
  res.cookies.set(ACCESS_COOKIE, "", { ...cookieOptions(0), maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, "", { ...cookieOptions(0), maxAge: 0 });
}

/** Extract the backend's error message from any common error shape. */
export function backendError(data: unknown, fallback: string): string {
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    const message = d.message;
    if (typeof message === "string") return message;
    if (Array.isArray(message)) return message.join(", ");
    const nested = d.error as Record<string, unknown> | undefined;
    if (nested && typeof nested.message === "string") return nested.message;
  }
  return fallback;
}
