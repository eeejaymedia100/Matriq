import { NextResponse } from "next/server";

/**
 * Server-side session helpers for the admin console.
 *
 * The admin backend issues a short-lived access token only (no refresh token —
 * deliberately smaller surface). The token lives in an httpOnly, sameSite
 * cookie; it is handed to the browser in memory solely so API requests can be
 * signed with it.
 */

export const ACCESS_COOKIE = "matriq_admin_at";
export const ACCESS_TTL = 15 * 60; // 15 minutes (matches backend expiry)

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

export function setAccessCookie(res: NextResponse, accessToken: string) {
  res.cookies.set(ACCESS_COOKIE, accessToken, cookieOptions(ACCESS_TTL));
}

export function clearAuthCookies(res: NextResponse) {
  res.cookies.set(ACCESS_COOKIE, "", { ...cookieOptions(0), maxAge: 0 });
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
