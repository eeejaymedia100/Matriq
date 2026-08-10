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
    if (!token) { router.push("/login"); return; }
    (async () => {
      try { setData(await getAnalytics(token)); } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, [router, token]);

  if (loading || !data) {
    return (
      <AdminLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-800 rounded w-48" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1,2,3].map(i => <div key={i} className="h-32 bg-gray-800 rounded-xl" />)}
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-white mb-6">Analytics</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <p className="text-sm text-gray-400">Total Revenue</p>
          <p className="text-3xl font-bold text-purple-400 mt-2">
            ₦{(data.totalRevenue / 100).toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 mt-1">across {data.totalAssociations} associations</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <p className="text-sm text-gray-400">Total Students</p>
          <p className="text-3xl font-bold text-white mt-2">{data.totalStudents.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">registered accounts</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <p className="text-sm text-gray-400">Avg Revenue / Association</p>
          <p className="text-3xl font-bold text-white mt-2">
            ₦{((data.totalRevenue / Math.max(data.associations.length, 1)) / 100).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="font-semibold text-white mb-4">Revenue by Association</h2>
        <div className="space-y-4">
          {data.associations.map((a) => (
            <div key={a.id} className="flex items-center justify-between">
              <div>
                <p className="text-gray-200 text-sm font-medium">{a.name}</p>
                <p className="text-gray-500 text-xs">{a.memberCount} members</p>
              </div>
              <p className="text-purple-400 font-medium text-sm">
                ₦{(a.totalCollected / 100).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
