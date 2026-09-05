"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { useSession } from "@/components/SessionProvider";
import { searchUsers, cancelUserDeletion } from "@/lib/api";
import type { AdminUser } from "@/types/api";

export default function UsersPage() {
  const router = useRouter();
  const { token } = useSession();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await searchUsers(token, search || undefined);
        if (!cancelled) setUsers(data.users);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, token, search]);

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-text">Students</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(query.trim());
          }}
          className="flex gap-2"
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, matric…"
            className="px-4 py-2 bg-surfaceAlt border border-line rounded-lg text-sm text-text placeholder:text-muted focus:border-lime outline-none w-72"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-lime hover:brightness-110 text-ink rounded-lg text-sm font-medium transition-colors"
          >
            Search
          </button>
        </form>
      </div>

      {message && (
        <div className="bg-green-900/50 border border-green-700 text-green-300 rounded-xl px-4 py-3 mb-6 text-sm">
          {message}
          <button onClick={() => setMessage("")} className="ml-2">×</button>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-surfaceAlt rounded-xl animate-pulse" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-16 bg-surface rounded-xl border border-line">
          <p className="text-muted">
            {search ? "No students match your search" : "Search for students to get started"}
          </p>
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-line overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-line">
                  <th className="py-3 px-4 font-medium">Student</th>
                  <th className="py-3 px-4 font-medium">Matric / JAMB</th>
                  <th className="py-3 px-4 font-medium">Dept</th>
                  <th className="py-3 px-4 font-medium">Level</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium">Joined</th>
                  <th className="py-3 px-4 font-medium">Deletion</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-line/50 hover:bg-surfaceAlt/30 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <p className="text-text">{u.fullName}</p>
                      <p className="text-xs text-muted">{u.email}</p>
                    </td>
                    <td className="py-3 px-4 text-muted">
                      {u.matricNumber || u.jambNumber || "—"}
                    </td>
                    <td className="py-3 px-4 text-muted">{u.department}</td>
                    <td className="py-3 px-4 text-muted">{u.level}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                          u.emailVerified
                            ? "bg-green-100 text-green-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {u.emailVerified ? "Email verified" : "Unverified"}
                      </span>{" "}
                      <span
                        className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ml-1 ${
                          u.matricStatus === "confirmed"
                            ? "bg-green-100 text-green-800"
                            : "bg-surfaceAlt text-textSecondary"
                        }`}
                      >
                        {u.matricStatus ?? "—"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-muted">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">
                      {u.deletionScheduledAt ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-red-900/50 text-red-300">
                            {new Date(u.deletionScheduledAt).toLocaleDateString()}
                          </span>
                          <button
                            onClick={async () => {
                              if (
                                !window.confirm(
                                  `Cancel the scheduled deletion for ${u.fullName}? The account is restored immediately.`,
                                )
                              )
                                return;
                              setActioning(u.id);
                              try {
                                const res = await cancelUserDeletion(u.id, token!);
                                setMessage(res.message);
                                setUsers((prev) =>
                                  prev.map((x) =>
                                    x.id === u.id
                                      ? { ...x, deletionScheduledAt: null }
                                      : x,
                                  ),
                                );
                              } catch (err) {
                                setMessage(
                                  err instanceof Error
                                    ? err.message
                                    : "Failed to cancel deletion",
                                );
                              } finally {
                                setActioning(null);
                              }
                            }}
                            disabled={actioning === u.id}
                            className="px-2 py-1 text-xs rounded-lg bg-lime hover:brightness-110 text-ink disabled:opacity-50 transition-colors"
                          >
                            {actioning === u.id ? "…" : "Cancel"}
                          </button>
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
