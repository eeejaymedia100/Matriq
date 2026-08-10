"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { useSession } from "@/components/SessionProvider";
import { getAnalytics } from "@/lib/api";
import type { AnalyticsData } from "@/types/api";

export default function AdminDashboardPage() {
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

  if (loading) {
    return (
      <AdminLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-800 rounded w-48" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 bg-gray-800 rounded-xl" />
            ))}
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-white mb-6">Admin Overview</h1>

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <AdminStatCard
              label="Total Associations"
              value={data.totalAssociations.toString()}
              sub={`${data.activeAssociations} active`}
            />
            <AdminStatCard
              label="Total Students"
              value={data.totalStudents.toLocaleString()}
            />
            <AdminStatCard
              label="Total Revenue"
              value={`₦${(data.totalRevenue / 100).toLocaleString()}`}
            />
            <AdminStatCard
              label="Associations"
              value={data.associations.length.toString()}
              sub="total"
            />
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h2 className="font-semibold text-white mb-4">
              Association Breakdown
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left py-2 text-gray-400 font-medium">
                      Name
                    </th>
                    <th className="text-left py-2 text-gray-400 font-medium">
                      Code
                    </th>
                    <th className="text-left py-2 text-gray-400 font-medium">
                      Status
                    </th>
                    <th className="text-right py-2 text-gray-400 font-medium">
                      Members
                    </th>
                    <th className="text-right py-2 text-gray-400 font-medium">
                      Collected
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.associations.map((a) => (
                    <tr key={a.id} className="border-b border-gray-800/50">
                      <td className="py-3 text-gray-200">{a.name}</td>
                      <td className="py-3 text-gray-400">{a.shortCode}</td>
                      <td className="py-3">
                        <span
                          className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                            a.status === "active"
                              ? "bg-green-900/50 text-green-400"
                              : "bg-red-900/50 text-red-400"
                          }`}
                        >
                          {a.status}
                        </span>
                      </td>
                      <td className="py-3 text-right text-gray-300">
                        {a.memberCount}
                      </td>
                      <td className="py-3 text-right text-purple-400 font-medium">
                        ₦{(a.totalCollected / 100).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  );
}

function AdminStatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <p className="text-sm text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}
