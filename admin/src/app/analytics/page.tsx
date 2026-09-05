"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { useSession } from "@/components/SessionProvider";
import { getAnalytics } from "@/lib/api";
import type { AnalyticsData } from "@/types/api";

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const { token } = useSession();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    (async () => {
      try {
        setData(await getAnalytics(token));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [router, token]);

  if (loading || !data) {
    return (
      <AdminLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-surfaceAlt rounded w-48" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-surfaceAlt rounded-xl" />
            ))}
          </div>
        </div>
      </AdminLayout>
    );
  }

  const avgPerAssoc =
    data.totalAssociations > 0
      ? data.totalCollectedKobo / data.totalAssociations
      : 0;

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-text mb-6">Analytics</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-surface rounded-xl border border-line p-5">
          <p className="text-sm text-muted">Dues Collected</p>
          <p className="text-3xl font-bold text-lime mt-2">
            ₦{(data.totalCollectedKobo / 100).toLocaleString()}
          </p>
          <p className="text-xs text-muted mt-1">
            across {data.totalAssociations} associations
          </p>
        </div>
        <div className="bg-surface rounded-xl border border-line p-5">
          <p className="text-sm text-muted">Total Students</p>
          <p className="text-3xl font-bold text-text mt-2">
            {data.totalStudents.toLocaleString()}
          </p>
          <p className="text-xs text-muted mt-1">registered accounts</p>
        </div>
        <div className="bg-surface rounded-xl border border-line p-5">
          <p className="text-sm text-muted">Avg Collected / Association</p>
          <p className="text-3xl font-bold text-text mt-2">
            ₦{(avgPerAssoc / 100).toLocaleString()}
          </p>
          <p className="text-xs text-muted mt-1">
            {data.successfulPayments} successful payments
          </p>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-line p-6">
        <h2 className="font-semibold text-text mb-4">Revenue by Association</h2>
        {data.associationRevenue.length === 0 ? (
          <p className="text-sm text-muted">No collections yet.</p>
        ) : (
          <div className="space-y-4">
            {data.associationRevenue.map((a) => (
              <div key={a.associationId} className="flex items-center justify-between">
                <div>
                  <p className="text-text text-sm font-medium">{a.name}</p>
                  <p className="text-muted text-xs">
                    {data.associations.find((x) => x.id === a.associationId)
                      ?.memberCount ?? 0}{" "}
                    members
                  </p>
                </div>
                <p className="text-lime font-medium text-sm">
                  ₦{(a.totalKobo / 100).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
