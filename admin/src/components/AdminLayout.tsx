"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/components/SessionProvider";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { admin, logout } = useSession();

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: "⚡" },
    { href: "/associations", label: "Associations", icon: "🏛️" },
    { href: "/analytics", label: "Analytics", icon: "📈" },
    { href: "/audit-logs", label: "Audit Logs", icon: "📋" },
  ];

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-8">
              <Link href="/dashboard" className="text-xl font-bold text-white">
                Matriq <span className="text-gray-400 text-sm font-normal">Admin</span>
              </Link>
              <div className="hidden sm:flex gap-1">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      pathname.startsWith(item.href)
                        ? "bg-gray-700 text-white"
                        : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                    }`}
                  >
                    <span className="mr-1.5">{item.icon}</span>
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4">
              {admin && (
                <span className="hidden md:block text-sm text-gray-400">
                  {admin.email}
                </span>
              )}
              <button
                onClick={handleLogout}
                className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
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