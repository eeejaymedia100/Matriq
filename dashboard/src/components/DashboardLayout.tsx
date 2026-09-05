"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "./SessionProvider";

/**
 * Association Dashboard shell — the Matriq dark system.
 *
 * One idea: this is the same product as the phone app. Void-black surfaces,
 * one lime accent, Inter for data, Playfair for the wordmark. No purple, no
 * emoji icons, no stock SaaS look. Every color comes from the tokens in
 * globals.css — nothing hard-coded here.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { status, user, executives, associationId, selectAssociation, logout } =
    useSession();

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-void">
        <nav className="bg-surface border-b border-line h-16" />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-line rounded w-48" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-line rounded-xl" />
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-void">
        <div className="text-center">
          <p className="text-muted mb-4">Your session has expired.</p>
          <Link
            href="/login"
            className="px-4 py-2 bg-lime text-ink rounded-lg text-sm font-semibold hover:brightness-110 transition"
          >
            Sign in again
          </Link>
        </div>
      </div>
    );
  }

  // Multiple executive roles but no association selected → picker.
  if (executives.length > 1 && !associationId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-void p-4">
        <div className="w-full max-w-md">
          <div className="bg-surface rounded-2xl border border-line p-8">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-semibold text-text mb-1 font-serif">
                Select association
              </h1>
              <p className="text-muted text-sm">
                You're an executive of multiple associations. Pick one to
                continue.
              </p>
            </div>
            <div className="space-y-3">
              {executives.map((e) => (
                <button
                  key={e.id}
                  onClick={() => selectAssociation(e.associationId)}
                  className="w-full flex items-center justify-between p-4 rounded-xl border border-line hover:border-lime/40 hover:bg-surfaceAlt transition text-left"
                >
                  <div>
                    <p className="font-medium text-text">{e.associationName}</p>
                    <p className="text-xs text-muted">
                      {e.shortCode} · {e.role}
                    </p>
                  </div>
                  <span className="text-lime">→</span>
                </button>
              ))}
            </div>
            <button
              onClick={logout}
              className="w-full mt-6 text-sm text-muted hover:text-text transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const navItems = [
    { href: "/dashboard", label: "Overview" },
    { href: "/members", label: "Members" },
    { href: "/fees", label: "Dues" },
    { href: "/verification", label: "Verification" },
    { href: "/announcements", label: "Announcements" },
    { href: "/events", label: "Events" },
    { href: "/checkin", label: "Check-in" },
    { href: "/timetable", label: "Timetable" },
    { href: "/transparency", label: "Transparency" },
  ];

  const currentAssociation = executives.find(
    (e) => e.associationId === associationId,
  );

  return (
    <div className="min-h-screen bg-void">
      <nav className="bg-surface/95 backdrop-blur border-b border-line sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-6">
              <Link href="/dashboard" className="flex items-center gap-2.5">
                {/* Brand mark — the official uploaded logo */}
                <img
                  src="/matriq-mark.png"
                  alt=""
                  className="w-7 h-7"
                  aria-hidden
                />
                <span className="text-lg font-serif font-semibold text-text">
                  Matriq
                </span>
              </Link>
              <div className="hidden lg:flex gap-0.5">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                      pathname.startsWith(item.href)
                        ? "bg-surfaceAlt text-lime"
                        : "text-muted hover:text-text hover:bg-surfaceAlt"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden md:block text-right">
                <p className="text-sm font-medium text-text">{user?.fullName}</p>
                {currentAssociation && (
                  <p className="text-xs text-muted">
                    {currentAssociation.associationName}
                  </p>
                )}
              </div>
              {executives.length > 1 && associationId && (
                <button
                  onClick={() => selectAssociation("")}
                  className="text-sm text-muted hover:text-text transition"
                  title="Switch association"
                >
                  Switch
                </button>
              )}
              <button
                onClick={logout}
                className="text-sm text-muted hover:text-text transition"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
