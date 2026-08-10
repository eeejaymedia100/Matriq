import { NextResponse } from "next/server";
import { API_BASE, backendError, setAuthCookies } from "@/lib/session";

export async function POST(request: Request) {
  let email: string;
  let password: string;
  try {
    const body = await request.json();
    email = String(body.email ?? "");
    password = String(body.password ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: backendError(data, "Login failed") },
        { status: res.status },
      );
    }

    // Step 1 of MFA: no tokens yet — hand the challenge to the client.
    if (data.mfaRequired) {
      return NextResponse.json({
        mfaRequired: true,
        challengeToken: data.challengeToken,
      });
    }

    const response = NextResponse.json({
      user: data.user,
    });
    setAuthCookies(response, data.accessToken, data.refreshToken);
    return response;
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Login failed. Try again.",
      },
      { status: 500 },
    );
  }
}
