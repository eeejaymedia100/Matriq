import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { API_BASE, backendError, REFRESH_COOKIE, setAuthCookies } from "@/lib/session";

export async function POST() {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_COOKIE)?.value;

  if (!refreshToken) {
    return NextResponse.json({ error: "No session" }, { status: 401 });
  }

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: backendError(data, "Session expired") },
        { status: 401 },
      );
    }

    const response = NextResponse.json({ accessToken: data.accessToken });
    setAuthCookies(response, data.accessToken, data.refreshToken);
    return response;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Refresh failed" },
      { status: 500 },
    );
  }
}
