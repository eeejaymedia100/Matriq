import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { API_BASE, clearAuthCookies, REFRESH_COOKIE } from "@/lib/session";

export async function POST() {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_COOKIE)?.value;

  // Best-effort server-side revocation; always clear local cookies.
  if (refreshToken) {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // Ignore — the cookie is being cleared regardless.
    }
  }

  const response = NextResponse.json({ ok: true });
  clearAuthCookies(response);
  return response;
}
