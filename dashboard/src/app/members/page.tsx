"use client";

import { useCallback, useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useSession } from "@/components/SessionProvider";
import { getMembers } from "@/lib/api";

interface MemberRow {
  userId: string;
  membershipStatus: "live" | "pending";
  joinedAt: string;
  verification: "pending" | "approved" | "rejected" | null;
  verifiedAt: string | null;
  user: {
    id: string;
    fullName: string;
    email: string;
    registrationType: string;
    matricNumber: string | null;
    jambNumber: string | null;
    department: string;
    level: string;
  };
}

/**
 * Member roster (spec §2): who's verified, who's pending, who hasn't
 * submitted — with basic search.
 */
export default function MembersPage() {
  const { status, token, associationId } = useSession();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(
    async (q?: string) => {
      if (!token || !associationId) return;
      try {
        const data = await getMembers(associationId, token, q);
        setMembers(data.members);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [token, associationId],
  );

  useEffect(() => {
    if (status !== "authenticated" || !token || !associationId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getMembers(associationId, token);
        if (!cancelled) setMembers(data.members);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, token, associationId]);

  const verifiedCount = members.filter(
    (m) => m.verification === "approved",
  ).length;
  const pendingCount = members.filter(
    (m) => m.verification === "pending",
  ).length;
  const noneCount = members.filter((m) => m.verification === null).length;

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Members</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(query.trim());
            void load(query.trim() || undefined);
          }}
          className="flex gap-2"
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, matric…"
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none w-64"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-purple-700 text-white rounded-lg text-sm font-medium hover:bg-purple-800 transition-colors"
          >
            Search
          </button>
          {search && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSearch("");
                void load(undefined);
              }}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">Verified</p>
          <p className="text-2xl font-bold text-green-600">{verifiedCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">Pending review</p>
          <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">Not submitted</p>
          <p className="text-2xl font-bold text-gray-400">{noneCount}</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500">
            {search ? "No members match your search" : "No members yet"}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-3 px-4 font-medium">Student</th>
                  <th className="py-3 px-4 font-medium">Matric / JAMB</th>
                  <th className="py-3 px-4 font-medium">Dept · Level</th>
                  <th className="py-3 px-4 font-medium">Verification</th>
                  <th className="py-3 px-4 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr
                    key={m.userId}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <p className="text-gray-900 font-medium">{m.user.fullName}</p>
                      <p className="text-xs text-gray-400">{m.user.email}</p>
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {m.user.matricNumber || m.user.jambNumber || "—"}
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {m.user.department} · L{m.user.level}
                    </td>
                    <td className="py-3 px-4">
                      {m.verification === "approved" ? (
                        <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Verified
                        </span>
                      ) : m.verification === "pending" ? (
                        <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          Pending
                        </span>
                      ) : m.verification === "rejected" ? (
                        <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Rejected
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          Not submitted
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-400">
                      {new Date(m.joinedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
