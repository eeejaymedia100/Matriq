import { NextResponse } from "next/server";

/** Container healthcheck endpoint — returns 200 when the server is up. */
export function GET() {
  return NextResponse.json({ ok: true });
}
