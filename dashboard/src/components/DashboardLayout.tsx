"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "./SessionProvider";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { status, user, executives, associationId, selectAssociation, logout } =
    useSession();

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white border-b border-gray-200 h-16" />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-48" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-gray-200 rounded-xl" />
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Your session has expired.</p>
          <Link
            href="/login"
            className="px-4 py-2 bg-purple-700 text-white rounded-lg text-sm font-medium hover:bg-purple-800 transition-colors"
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-white p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-purple-900 mb-1">
                Select association
              </h1>
              <p className="text-gray-500 text-sm">
                You are an executive of multiple associations. Pick one to
                continue.
              </p>
            </div>
            <div className="space-y-3">
              {executives.map((e) => (
                <button
                  key={e.id}
                  onClick={() => selectAssociation(e.associationId)}
                  className="w-full flex items-center justify-between p-4 rounded-xl border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-colors text-left"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {e.associationName}
                    </p>
                    <p className="text-xs text-gray-400">
                      {e.shortCode} · {e.role}
                    </p>
                  </div>
                  <span className="text-purple-700">→</span>
                </button>
              ))}
            </div>
            <button
              onClick={logout}
              className="w-full mt-6 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const navItems = [
    { href: "/dashboard", label: "Overview", icon: "📊" },
    { href: "/fees", label: "Dues", icon: "💳" },
    { href: "/verification", label: "Verification", icon: "🪪" },
    { href: "/announcements", label: "Announcements", icon: "📢" },
    { href: "/transparency", label: "Transparency", icon: "💰" },
  ];

  const currentAssociation = executives.find(
    (e) => e.associationId === associationId,
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-8">
              <Link
                href="/dashboard"
                className="text-xl font-bold text-purple-900"
              >
                Matriq
              </Link>
              <div className="hidden sm:flex gap-1">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      pathname.startsWith(item.href)
                        ? "bg-purple-100 text-purple-900"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <span className="mr-1.5">{item.icon}</span>
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden md:block text-right">
                <p className="text-sm font-medium text-gray-800">
                  {user?.fullName}
                </p>
                {currentAssociation && (
                  <p className="text-xs text-gray-400">
                    {currentAssociation.associationName}
                  </p>
                )}
              </div>
              {executives.length > 1 && associationId && (
                <button
                  onClick={() => selectAssociation("")}
                  className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                  title="Switch association"
                >
                  Switch
                </button>
              )}
              <button
                onClick={logout}
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Logout
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
