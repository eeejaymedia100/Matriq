"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/components/SessionProvider";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { admin, logout } = useSession();

  const navItems = [
    { href: "/dashboard", label: "Overview" },
    { href: "/associations", label: "Associations" },
    { href: "/institutions", label: "Institutions" },
    { href: "/payments", label: "Payments" },
    { href: "/verification", label: "Verification" },
    { href: "/ai-moderation", label: "AI Moderation" },
    { href: "/vault-moderation", label: "Vault" },
    { href: "/resource-audit", label: "Resource Review" },
    { href: "/resource-rewards", label: "Rewards" },
    { href: "/users", label: "Users" },
    { href: "/admins", label: "Admins" },
    { href: "/security", label: "Security" },
    { href: "/banners", label: "Banners" },
    { href: "/waitlist", label: "Waitlist" },
    { href: "/analytics", label: "Analytics" },
    { href: "/audit-logs", label: "Audit Logs" },
  ];

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="min-h-screen bg-void">
      <nav className="bg-surface/95 backdrop-blur border-b border-line sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-6">
              <Link href="/dashboard" className="flex items-center gap-2.5">
                {/* Brand mark — the official uploaded logo */}
                <img src="/matriq-mark.png" alt="" className="w-7 h-7" aria-hidden />
                <span className="text-lg font-serif font-semibold text-text">
                  Matriq{" "}
                  <span className="text-muted text-sm font-sans font-normal">
                    Admin
                  </span>
                </span>
              </Link>
              <div className="hidden xl:flex gap-0.5">
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
              {admin && (
                <span className="hidden md:block text-sm text-muted">
                  {admin.email}
                </span>
              )}
              <button
                onClick={handleLogout}
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