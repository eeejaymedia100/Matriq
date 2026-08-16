"use client";

import { useCallback, useEffect, useState, FormEvent } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useSession } from "@/components/SessionProvider";
import { getFeesOverview, createFee, getFeeRoster } from "@/lib/api";
import type { Fee } from "@/types/api";

interface FeeRoster {
  fee: { id: string; name: string; amountKobo: number; dueDate: string; session: string };
  memberCount: number;
  paidCount: number;
  unpaidCount: number;
  paid: Array<{
    paymentId: string;
    amountKobo: number;
    method: string | null;
    paidAt: string | null;
    user: { id: string; fullName: string; email: string; matricNumber: string | null; level: string; department: string };
  }>;
  unpaid: Array<{
    id: string;
    fullName: string;
    email: string;
    matricNumber: string | null;
    level: string;
    department: string;
  }>;
}

export default function FeesPage() {
  const { status, token, associationId } = useSession();
  const [fees, setFees] = useState<Fee[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [amountNaira, setAmountNaira] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [session, setSession] = useState(
    `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`,
  );
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [roster, setRoster] = useState<FeeRoster | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);

  const loadFees = useCallback(async () => {
    if (!token || !associationId) return;
    try {
      const data = await getFeesOverview(associationId, token);
      setFees(data.fees);
      setMemberCount(data.memberCount);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load fees");
    } finally {
      setLoading(false);
    }
  }, [token, associationId]);

  useEffect(() => {
    if (status !== "authenticated" || !token || !associationId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getFeesOverview(associationId, token);
        if (!cancelled) {
          setFees(data.fees);
          setMemberCount(data.memberCount);
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
  }, [status, token, associationId]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!token || !associationId) return;
    const amountNairaNum = Number(amountNaira);
    if (!Number.isFinite(amountNairaNum) || amountNairaNum <= 0) {
      setMessage("Enter a valid amount in Naira");
      return;
    }
    setSubmitting(true);
    try {
      await createFee(
        associationId,
        {
          name,
          amountKobo: Math.round(amountNairaNum * 100),
          dueDate,
          session,
        },
        token,
      );
      setMessage("Dues created! Members have been notified.");
      setShowForm(false);
      setName("");
      setAmountNaira("");
      setDueDate("");
      loadFees();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to create dues");
    } finally {
      setSubmitting(false);
    }
  }

  const totalExpected = fees.reduce((s, f) => s + f.expectedKobo, 0);
  const totalCollected = fees.reduce((s, f) => s + f.collectedKobo, 0);

  async function openRoster(feeId: string) {
    if (!token || !associationId) return;
    setRosterLoading(true);
    try {
      const data = await getFeeRoster(associationId, feeId, token);
      setRoster(data);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load roster");
    } finally {
      setRosterLoading(false);
    }
  }

  function exportCsv() {
    if (!roster) return;
    const esc = (v: string | null | undefined) =>
      `"${(v ?? "").replace(/"/g, '""')}"`;
    const rows: string[] = [
      ["name", "email", "matric", "department", "level", "status", "amount", "paid_at"].join(","),
      ...roster.paid.map((p) =>
        [
          esc(p.user.fullName),
          esc(p.user.email),
          esc(p.user.matricNumber),
          esc(p.user.department),
          esc(p.user.level),
          "PAID",
          p.amountKobo / 100,
          p.paidAt ? new Date(p.paidAt).toISOString() : "",
        ].join(","),
      ),
      ...roster.unpaid.map((u) =>
        [
          esc(u.fullName),
          esc(u.email),
          esc(u.matricNumber),
          esc(u.department),
          esc(u.level),
          "UNPAID",
          "",
          "",
        ].join(","),
      ),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dues-roster-${roster.fee.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dues & Fees</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-purple-700 text-white rounded-lg text-sm font-medium hover:bg-purple-800 transition-colors"
        >
          {showForm ? "Cancel" : "New Dues"}
        </button>
      </div>

      {message && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 mb-6 text-sm">
          {message}
          <button onClick={() => setMessage("")} className="ml-2">
            ×
          </button>
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white rounded-xl border border-gray-200 p-6 mb-6 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dues name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                placeholder="e.g. Session Dues 2026/2027"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount (₦)
              </label>
              <input
                type="number"
                value={amountNaira}
                onChange={(e) => setAmountNaira(e.target.value)}
                required
                min={1}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                placeholder="5000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Due date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Session
              </label>
              <input
                value={session}
                onChange={(e) => setSession(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                placeholder="2026/2027"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2 bg-purple-700 text-white rounded-lg text-sm font-medium hover:bg-purple-800 disabled:bg-purple-400 transition-colors"
          >
            {submitting ? "Creating..." : "Create Dues"}
          </button>
        </form>
      )}

      {/* Collection summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">Active members</p>
          <p className="text-2xl font-bold text-gray-900">{memberCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">Total expected</p>
          <p className="text-2xl font-bold text-gray-900">
            ₦{(totalExpected / 100).toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">Total collected</p>
          <p className="text-2xl font-bold text-purple-700">
            ₦{(totalCollected / 100).toLocaleString()}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : fees.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500">No dues created yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {fees.map((f) => {
            const pct =
              f.expectedKobo > 0
                ? Math.round((f.collectedKobo / f.expectedKobo) * 100)
                : 0;
            return (
              <div
                key={f.id}
                className="bg-white rounded-xl border border-gray-200 p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{f.name}</h3>
                    <p className="text-xs text-gray-400">
                      {f.session} · due {new Date(f.dueDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">
                      ₦{(f.amountKobo / 100).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-400">
                      {f.paidCount} of {memberCount} paid
                    </p>
                  </div>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-600 rounded-full transition-all"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
                  <span>
                    Collected: ₦{(f.collectedKobo / 100).toLocaleString()} (
                    {pct}%)
                  </span>
                  <span>
                    Expected: ₦{(f.expectedKobo / 100).toLocaleString()}
                  </span>
                </div>
                <div className="mt-3">
                  <button
                    onClick={() => void openRoster(f.id)}
                    className="px-3 py-1.5 text-xs border border-purple-200 text-purple-700 rounded-lg hover:bg-purple-50 transition-colors"
                  >
                    Who's paid / who hasn't
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Roster modal */}
      {roster && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setRoster(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-semibold text-gray-900">{roster.fee.name}</h3>
                <p className="text-xs text-gray-400">
                  {roster.paidCount} paid · {roster.unpaidCount} unpaid of{" "}
                  {roster.memberCount} members
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={exportCsv}
                  className="px-3 py-1.5 text-xs bg-purple-700 text-white rounded-lg hover:bg-purple-800 transition-colors"
                >
                  Export CSV
                </button>
                <button
                  onClick={() => setRoster(null)}
                  className="text-gray-400 hover:text-gray-600 text-xl"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {rosterLoading ? (
                <div className="h-24 bg-gray-100 rounded-lg animate-pulse" />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">
                      Paid ({roster.paid.length})
                    </h4>
                    <div className="space-y-2">
                      {roster.paid.length === 0 ? (
                        <p className="text-sm text-gray-400">No one yet</p>
                      ) : (
                        roster.paid.map((p) => (
                          <div
                            key={p.paymentId}
                            className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-2"
                          >
                            <div>
                              <p className="text-sm font-medium text-gray-800">
                                {p.user.fullName}
                              </p>
                              <p className="text-xs text-gray-400">
                                {p.user.matricNumber || p.user.email}
                              </p>
                            </div>
                            <p className="text-xs text-gray-500">
                              {p.paidAt
                                ? new Date(p.paidAt).toLocaleDateString()
                                : "—"}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-2">
                      Unpaid ({roster.unpaid.length})
                    </h4>
                    <div className="space-y-2">
                      {roster.unpaid.length === 0 ? (
                        <p className="text-sm text-gray-400">Everyone has paid 🎉</p>
                      ) : (
                        roster.unpaid.map((u) => (
                          <div
                            key={u.id}
                            className="flex items-center justify-between bg-red-50 rounded-lg px-3 py-2"
                          >
                            <div>
                              <p className="text-sm font-medium text-gray-800">
                                {u.fullName}
                              </p>
                              <p className="text-xs text-gray-400">
                                {u.matricNumber || u.email}
                              </p>
                            </div>
                            <p className="text-xs text-gray-500">L{u.level}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
