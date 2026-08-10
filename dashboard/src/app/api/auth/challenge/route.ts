import { NextResponse } from "next/server";
import { API_BASE, backendError, setAuthCookies } from "@/lib/session";

export async function POST(request: Request) {
  let challengeToken: string;
  let code: string;
  try {
    const body = await request.json();
    challengeToken = String(body.challengeToken ?? "");
    code = String(body.code ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const res = await fetch(`${API_BASE}/auth/mfa/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeToken, code }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: backendError(data, "Invalid authentication code") },
        { status: res.status },
      );
    }

    const response = NextResponse.json({ user: data.user });
    setAuthCookies(response, data.accessToken, data.refreshToken);
    return response;
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Verification failed. Try again.",
      },
      { status: 500 },
    );
  }
}
