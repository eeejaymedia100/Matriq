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
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-xl" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-6">
          {error}
        </div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Total Members"
              value={stats.totalMembers.toString()}
              sub={`${stats.confirmedMembers} confirmed`}
            />
            <StatCard
              label="Total Collected"
              value={`₦${(stats.totalCollected / 100).toLocaleString()}`}
            />
            <StatCard
              label="Payment Rate"
              value={`${stats.paymentRate.toFixed(1)}%`}
            />
            <StatCard
              label="Pending"
              value={stats.pendingPayments.toString()}
              sub={`${stats.successfulPayments} successful`}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Top Payers</h2>
              {stats.topPayers.length === 0 ? (
                <p className="text-gray-500 text-sm">No payments yet</p>
              ) : (
                <div className="space-y-3">
                  {stats.topPayers.slice(0, 10).map((payer, i) => (
                    <div
                      key={payer.userId}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-400 w-6">
                          {i + 1}
                        </span>
                        <span className="text-sm text-gray-800">
                          {payer.userName}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-purple-700">
                        ₦{(payer.totalPaid / 100).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-4">
                Quick Actions
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <ActionButton
                  label="Review IDs"
                  href="/verification"
                  icon="🪪"
                />
                <ActionButton
                  label="Post Update"
                  href="/announcements"
                  icon="📢"
                />
                <ActionButton
                  label="Transparency"
                  href="/transparency"
                  icon="💰"
                />
                <ActionButton label="Scan QR" href="#" icon="📱" />
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
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function ActionButton({
  label,
  href,
  icon,
}: {
  label: string;
  href: string;
  icon: string;
}) {
  return (
    <a
      href={href}
      className="flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-colors text-center"
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </a>
  );
}
