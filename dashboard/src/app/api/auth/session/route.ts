import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ACCESS_COOKIE,
  API_BASE,
  clearAuthCookies,
  REFRESH_COOKIE,
  setAuthCookies,
} from "@/lib/session";

async function fetchMe(accessToken: string) {
  const res = await fetch(`${API_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as Record<string, unknown>;
}

export async function GET() {
  const store = await cookies();
  let accessToken = store.get(ACCESS_COOKIE)?.value;
  const refreshToken = store.get(REFRESH_COOKIE)?.value;

  if (!accessToken && !refreshToken) {
    return NextResponse.json(
      { authenticated: false, error: "Not signed in" },
      { status: 401 },
    );
  }

  // 1. Try the access token as-is.
  let user = accessToken ? await fetchMe(accessToken) : null;

  // 2. Access token expired/invalid → rotate via the refresh token.
  if (!user && refreshToken) {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const newAccessToken: string | undefined = data?.accessToken;
        const newRefreshToken: string | undefined = data?.refreshToken;
        if (newAccessToken && newRefreshToken) {
          accessToken = newAccessToken;
          user = await fetchMe(newAccessToken);
          if (user) {
            const sessionResponse = NextResponse.json({
              authenticated: true,
              user,
              token: accessToken,
            });
            setAuthCookies(sessionResponse, newAccessToken, newRefreshToken);
            return sessionResponse;
          }
        }
      }
    } catch {
      // fall through to 401
    }
  }

  // 3. No valid session.
  if (!user) {
    const response = NextResponse.json(
      { authenticated: false, error: "Session expired" },
      { status: 401 },
    );
    clearAuthCookies(response);
    return response;
  }

  return NextResponse.json({ authenticated: true, user, token: accessToken });
}
