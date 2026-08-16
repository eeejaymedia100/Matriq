"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { useSession } from "@/components/SessionProvider";
import { getAnalytics, createBroadcast } from "@/lib/api";
import type { AnalyticsData } from "@/types/api";

/**
 * Admin Overview (spec §1). Renders the real analytics shape from
 * GET /admin/analytics (headline counts, association breakdown, most-active
 * courses, Vault activity) plus the platform-wide broadcast composer.
 */
export default function AdminDashboardPage() {
  const router = useRouter();
  const { token } = useSession();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const [bcTitle, setBcTitle] = useState("");
  const [bcBody, setBcBody] = useState("");
  const [bcSending, setBcSending] = useState(false);
  const [bcMsg, setBcMsg] = useState<{ ok: boolean; text: string } | null>(null);

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

  const sendBroadcast = async () => {
    if (!token || bcSending) return;
    setBcSending(true);
    setBcMsg(null);
    try {
      await createBroadcast(
        { title: bcTitle.trim(), body: bcBody.trim() },
        token,
      );
      setBcMsg({ ok: true, text: "Broadcast sent to every student's notification feed." });
      setBcTitle("");
      setBcBody("");
    } catch (err) {
      setBcMsg({
        ok: false,
        text: err instanceof Error ? err.message : "Broadcast failed",
      });
    } finally {
      setBcSending(false);
    }
  };

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
              label="Total Students"
              value={data.totalStudents.toLocaleString()}
              sub="registered accounts"
            />
            <AdminStatCard
              label="Associations"
              value={data.totalAssociations.toString()}
              sub={`${data.activeAssociations} active`}
            />
            <AdminStatCard
              label="Dues Collected"
              value={`₦${(data.totalCollectedKobo / 100).toLocaleString()}`}
              sub={`${data.successfulPayments} successful payments`}
            />
            <AdminStatCard
              label="Vault Uploads"
              value={data.vaultActivity.totalUploads.toLocaleString()}
              sub={`${data.vaultActivity.pendingModeration} awaiting review · ${data.vaultActivity.contributionsThisWeek} this week`}
            />
          </div>

          {/* Growth over time (spec §1) */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-white">
                  Active-user trend
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  New student signups — last 6 weeks
                </p>
              </div>
              <div className="flex gap-4 text-sm">
                <span className="text-gray-400">
                  7 days:{" "}
                  <span className="font-semibold text-white">
                    {data.signupsLast7Days}
                  </span>
                </span>
                <span className="text-gray-400">
                  30 days:{" "}
                  <span className="font-semibold text-white">
                    {data.signupsLast30Days}
                  </span>
                </span>
              </div>
            </div>
            <div className="flex items-end gap-3 h-32">
              {data.signupsSeries.map((w) => {
                const max = Math.max(
                  1,
                  ...data.signupsSeries.map((x) => x.count),
                );
                const h = Math.round((w.count / max) * 100);
                return (
                  <div key={w.weekStart} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-gray-400 font-medium">
                      {w.count}
                    </span>
                    <div
                      className="w-full rounded-t-md bg-purple-500/80"
                      style={{ height: `${Math.max(h, 4)}%` }}
                    />
                    <span className="text-[10px] text-gray-500">
                      {new Date(w.weekStart + "T00:00:00").toLocaleDateString(
                        undefined,
                        { month: "short", day: "numeric" },
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Association breakdown */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
              <h2 className="font-semibold text-white mb-4">
                Association Breakdown
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left py-2 text-gray-400 font-medium">Name</th>
                      <th className="text-left py-2 text-gray-400 font-medium">Code</th>
                      <th className="text-right py-2 text-gray-400 font-medium">Members</th>
                      <th className="text-right py-2 text-gray-400 font-medium">Collected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.associations.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-4 text-gray-500 text-center">
                          No active associations yet.
                        </td>
                      </tr>
                    ) : (
                      data.associations.map((a) => (
                        <tr key={a.id} className="border-b border-gray-800/50">
                          <td className="py-3 text-gray-200">{a.name}</td>
                          <td className="py-3 text-gray-400">{a.shortCode}</td>
                          <td className="py-3 text-right text-gray-300">{a.memberCount}</td>
                          <td className="py-3 text-right text-purple-400 font-medium">
                            ₦{(a.totalCollected / 100).toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Broadcast composer (spec §1) */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
              <h2 className="font-semibold text-white mb-1">
                Platform Broadcast
              </h2>
              <p className="text-sm text-gray-400 mb-4">
                Goes to every student's in-app notification feed — outages, new
                features, anything app-wide.
              </p>
              <div className="space-y-3">
                <input
                  value={bcTitle}
                  onChange={(e) => setBcTitle(e.target.value)}
                  placeholder="Title (e.g. Scheduled maintenance tonight)"
                  maxLength={140}
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 outline-none"
                />
                <textarea
                  value={bcBody}
                  onChange={(e) => setBcBody(e.target.value)}
                  placeholder="Message"
                  maxLength={500}
                  rows={3}
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 outline-none resize-none"
                />
                <button
                  onClick={() => void sendBroadcast()}
                  disabled={bcSending || !bcTitle.trim() || !bcBody.trim()}
                  className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                >
                  {bcSending ? "Sending…" : "Send broadcast"}
                </button>
                {bcMsg ? (
                  <p
                    className={`text-sm rounded-lg px-3 py-2 ${
                      bcMsg.ok
                        ? "bg-green-900/40 text-green-400"
                        : "bg-red-900/40 text-red-400"
                    }`}
                  >
                    {bcMsg.text}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {/* Usage analytics (spec §1) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
              <h2 className="font-semibold text-white mb-4">
                Most-Active Courses
              </h2>
              {data.topCourses.length === 0 ? (
                <p className="text-sm text-gray-500">No Vault uploads yet.</p>
              ) : (
                <div className="space-y-3">
                  {data.topCourses.map((c) => (
                    <div key={c.courseCode} className="flex items-center justify-between">
                      <div>
                        <p className="text-gray-200 text-sm font-medium">{c.courseCode}</p>
                        <p className="text-gray-500 text-xs">
                          {c.uploads} upload{c.uploads === 1 ? "" : "s"} ·{" "}
                          {c.downloads} download{c.downloads === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-purple-500 rounded-full"
                            style={{
                              width: `${Math.min(
                                100,
                                (c.downloads / Math.max(1, data.topCourses[0].downloads)) * 100,
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
              <h2 className="font-semibold text-white mb-4">Vault Contribution Activity</h2>
              <div className="grid grid-cols-3 gap-4">
                <VaultMiniStat label="Total" value={data.vaultActivity.totalUploads} />
                <VaultMiniStat label="Pending review" value={data.vaultActivity.pendingModeration} />
                <VaultMiniStat label="This week" value={data.vaultActivity.contributionsThisWeek} />
              </div>
              <p className="text-sm text-gray-400 mt-4">
                Moderate the queue from the{" "}
                <a href="/vault-moderation" className="text-purple-400 hover:underline">
                  Vault moderation page
                </a>
                .
              </p>
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

function VaultMiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-4 text-center">
      <p className="text-2xl font-bold text-white">{value.toLocaleString()}</p>
      <p className="text-xs text-gray-400 mt-1">{label}</p>
    </div>
  );
}
