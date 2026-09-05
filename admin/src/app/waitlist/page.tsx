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
        <h1 className="text-2xl font-bold text-text">Waitlist</h1>
        <span className="text-sm text-muted">
          {entries.length} shown
        </span>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-surface rounded-xl border border-line p-5">
          <p className="text-sm text-muted">Total Signups</p>
          <p className="text-2xl font-bold text-lime mt-1">
            {stats?.total ?? "—"}
          </p>
        </div>
        <div className="bg-surface rounded-xl border border-line p-5">
          <p className="text-sm text-muted">Today</p>
          <p className="text-2xl font-bold text-text mt-1">
            {stats?.today ?? "—"}
          </p>
        </div>
        <div className="bg-surface rounded-xl border border-line p-5">
          <p className="text-sm text-muted">Pending</p>
          <p className="text-2xl font-bold text-yellow-400 mt-1">
            {stats?.pending ?? "—"}
          </p>
        </div>
        <div className="bg-surface rounded-xl border border-line p-5">
          <p className="text-sm text-muted">Invited</p>
          <p className="text-2xl font-bold text-blue-400 mt-1">
            {stats?.invited ?? "—"}
          </p>
        </div>
        <div className="bg-surface rounded-xl border border-line p-5">
          <p className="text-sm text-muted">Joined</p>
          <p className="text-2xl font-bold text-green-400 mt-1">
            {stats?.joined ?? "—"}
          </p>
        </div>
      </div>

      {/* Entries table */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-surfaceAlt rounded-xl animate-pulse" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 bg-surface rounded-xl border border-line">
          <p className="text-muted">No waitlist signups yet</p>
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-line overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-line">
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
                    className="border-b border-line/50 hover:bg-surfaceAlt/30 transition-colors"
                  >
                    <td className="py-3 px-4 text-text">{e.email}</td>
                    <td className="py-3 px-4 text-muted">
                      {e.fullName || "—"}
                    </td>
                    <td className="py-3 px-4 text-muted">{e.source}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                          STATUS_COLORS[e.status] ?? "bg-surfaceAlt text-textSecondary"
                        }`}
                      >
                        {e.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-muted">
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
            <div className="p-4 border-t border-line flex justify-center">
              <button
                onClick={() => goToPage(cursor)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-surfaceAlt text-text hover:bg-surfaceAlt transition-colors"
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
