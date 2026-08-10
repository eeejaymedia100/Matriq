import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ACCESS_COOKIE, API_BASE, clearAuthCookies } from "@/lib/session";

interface AdminIdentity {
  id: string;
  email: string;
}

async function fetchMe(accessToken: string): Promise<AdminIdentity | null> {
  try {
    const res = await fetch(`${API_BASE}/admin/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as AdminIdentity;
  } catch {
    return null;
  }
}

export async function GET() {
  const store = await cookies();
  const accessToken = store.get(ACCESS_COOKIE)?.value;

  if (!accessToken) {
    return NextResponse.json(
      { authenticated: false, error: "Not signed in" },
      { status: 401 },
    );
  }

  const admin = await fetchMe(accessToken);
  if (!admin) {
    const response = NextResponse.json(
      { authenticated: false, error: "Session expired" },
      { status: 401 },
    );
    clearAuthCookies(response);
    return response;
  }

  return NextResponse.json({
    authenticated: true,
    admin,
    token: accessToken,
  });
}
