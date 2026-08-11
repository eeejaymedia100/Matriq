"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { useSession } from "@/components/SessionProvider";
import { listWaitlist, getWaitlistStats } from "@/lib/api";
import type { WaitlistEntry, WaitlistStats } from "@/types/api";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  invited: "bg-blue-100 text-blue-800",
  joined: "bg-green-100 text-green-800",
};

export default function WaitlistPage() {
  const router = useRouter();
  const { token } = useSession();
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [stats, setStats] = useState<WaitlistStats | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (c?: string) => {
      if (!token) return;
      try {
        const [wl, st] = await Promise.all([
          listWaitlist(token, c ?? undefined),
          stats ? Promise.resolve(stats) : getWaitlistStats(token),
        ]);
        setEntries(wl.entries);
        setCursor(wl.pagination.cursor);
        setHasMore(wl.pagination.hasMore);
        if (!stats) setStats(st);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token],
  );

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [wl, st] = await Promise.all([
          listWaitlist(token),
          getWaitlistStats(token),
        ]);
        if (!cancelled) {
          setEntries(wl.entries);
          setCursor(wl.pagination.cursor);
          setHasMore(wl.pagination.hasMore);
          setStats(st);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, token]);

  const goToPage = (c: string | null) => {
    if (!c) return;
    setLoading(true);
    load(c);
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Waitlist</h1>
        <span className="text-sm text-gray-400">
          {entries.length} shown
        </span>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <p className="text-sm text-gray-400">Total Signups</p>
          <p className="text-2xl font-bold text-purple-400 mt-1">
            {stats?.total ?? "—"}
          </p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <p className="text-sm text-gray-400">Today</p>
          <p className="text-2xl font-bold text-white mt-1">
            {stats?.today ?? "—"}
          </p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <p className="text-sm text-gray-400">Pending</p>
          <p className="text-2xl font-bold text-yellow-400 mt-1">
            {stats?.pending ?? "—"}
          </p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <p className="text-sm text-gray-400">Invited</p>
          <p className="text-2xl font-bold text-blue-400 mt-1">
            {stats?.invited ?? "—"}
          </p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <p className="text-sm text-gray-400">Joined</p>
          <p className="text-2xl font-bold text-green-400 mt-1">
            {stats?.joined ?? "—"}
          </p>
        </div>
      </div>

      {/* Entries table */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 bg-gray-900 rounded-xl border border-gray-800">
          <p className="text-gray-500">No waitlist signups yet</p>
        </div>
      ) : (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-800">
                  <th className="py-3 px-4 font-medium">Email</th>
                  <th className="py-3 px-4 font-medium">Name</th>
                  <th className="py-3 px-4 font-medium">Source</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium">Signed Up</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
                  >
                    <td className="py-3 px-4 text-gray-200">{e.email}</td>
                    <td className="py-3 px-4 text-gray-400">
                      {e.fullName || "—"}
                    </td>
                    <td className="py-3 px-4 text-gray-400">{e.source}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                          STATUS_COLORS[e.status] ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {e.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-400">
                      {new Date(e.createdAt).toLocaleDateString()}{" "}
                      {new Date(e.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div className="p-4 border-t border-gray-800 flex justify-center">
              <button
                onClick={() => goToPage(cursor)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-800 text-gray-200 hover:bg-gray-700 transition-colors"
              >
                Load more
              </button>
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
