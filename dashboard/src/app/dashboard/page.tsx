"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useSession } from "@/components/SessionProvider";
import { getDashboardStats } from "@/lib/api";
import type { DashboardStats } from "@/types/api";

export default function DashboardPage() {
  const { status, token, associationId } = useSession();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status !== "authenticated" || !token || !associationId) return;

    (async () => {
      try {
        const data = await getDashboardStats(associationId, token);
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [status, token, associationId]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-line rounded w-48" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-line rounded-xl" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <h1 className="text-2xl font-serif font-semibold text-text mb-6">
        Overview
      </h1>

      {error && (
        <div className="bg-errorBg border border-error/30 text-error rounded-xl px-4 py-3 mb-6">
          {error}
        </div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Total Members"
              value={stats.totalMembers.toLocaleString()}
              sub={`${stats.confirmedMembers.toLocaleString()} verified`}
            />
            <StatCard
              label="Total Collected"
              value={`₦${(stats.totalCollectedKobo / 100).toLocaleString()}`}
            />
            <StatCard
              label="Payment Rate"
              value={`${stats.paymentRate.toFixed(1)}%`}
            />
            <StatCard
              label="Pending"
              value={stats.pendingPayments.toLocaleString()}
              sub={`${stats.successfulPayments.toLocaleString()} successful`}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-surface rounded-xl border border-line p-6">
              <h2 className="font-semibold text-text mb-4">Top payers</h2>
              {stats.topPayers.length === 0 ? (
                <p className="text-muted text-sm">
                  No payments yet. Dues collected here will rank members
                  automatically.
                </p>
              ) : (
                <div className="space-y-3">
                  {stats.topPayers.slice(0, 10).map((payer, i) => (
                    <div
                      key={payer.userId ?? `deleted-${i}`}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-muted w-6">
                          {i + 1}
                        </span>
                        <span className="text-sm text-text">{payer.name}</span>
                      </div>
                      <span className="text-sm font-semibold text-lime">
                        ₦{(payer.totalPaidKobo / 100).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-surface rounded-xl border border-line p-6">
              <h2 className="font-semibold text-text mb-4">Quick actions</h2>
              <div className="grid grid-cols-2 gap-3">
                <ActionButton label="Manage Dues" href="/fees" />
                <ActionButton label="Event Check-in" href="/checkin" />
                <ActionButton label="Review IDs" href="/verification" />
                <ActionButton label="Post Update" href="/announcements" />
                <ActionButton label="Transparency" href="/transparency" />
              </div>
            </div>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-surface rounded-xl border border-line p-5">
      <p className="text-sm text-muted mb-1">{label}</p>
      <p className="text-2xl font-bold text-text">{value}</p>
      {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
    </div>
  );
}

function ActionButton({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      className="flex items-center justify-between p-4 rounded-xl border border-line hover:border-lime/40 hover:bg-surfaceAlt transition text-left"
    >
      <span className="text-sm font-medium text-text">{label}</span>
      <span className="text-lime">→</span>
    </a>
  );
}
