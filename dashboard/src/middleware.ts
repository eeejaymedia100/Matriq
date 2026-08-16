import { NextRequest, NextResponse } from "next/server";

const PROTECTED = [
  "/dashboard",
  "/verification",
  "/announcements",
  "/transparency",
  "/members",
  "/events",
  "/timetable",
  "/fees",
  "/checkin",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasAccess = request.cookies.get("matriq_at")?.value;
  const hasRefresh = request.cookies.get("matriq_rt")?.value;
  const authed = Boolean(hasAccess || hasRefresh);

  // Root → dashboard (dashboard handles redirect-to-login if unauthenticated)
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (!authed) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
