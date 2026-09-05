"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { useSession } from "@/components/SessionProvider";
import { listPayments, listFees, listAssociations } from "@/lib/api";
import type {
  AdminPayment,
  AdminFee,
  Association,
} from "@/types/api";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  successful: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-surfaceAlt text-textSecondary",
  refunded: "bg-limeSoft text-lime",
  disputed: "bg-orange-100 text-orange-800",
};

export default function PaymentsPage() {
  const router = useRouter();
  const { token } = useSession();
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [fees, setFees] = useState<AdminFee[]>([]);
  const [associations, setAssociations] = useState<Association[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [assocFilter, setAssocFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [p, f, a] = await Promise.all([
          listPayments(
            token,
            filter
              ? { status: filter, associationId: assocFilter || undefined }
              : { associationId: assocFilter || undefined },
          ),
          listFees(token, assocFilter || undefined),
          listAssociations(token),
        ]);
        if (!cancelled) {
          setPayments(p.payments);
          setFees(f.fees);
          setAssociations(a.associations);
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
  }, [router, token, filter, assocFilter]);

  const totalCollected = fees.reduce((s, f) => s + f.collectedKobo, 0);
  const totalPaidCount = fees.reduce((s, f) => s + f.paidCount, 0);

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-text mb-6">Payments</h1>

      {/* Association drill-down (platform-wide default, per-association view) */}
      <div className="flex items-center gap-3 mb-6">
        <label className="text-sm text-muted">Association</label>
        <select
          value={assocFilter}
          onChange={(e) => setAssocFilter(e.target.value)}
          className="px-4 py-2 bg-surfaceAlt border border-line rounded-lg text-sm text-text focus:border-lime outline-none"
        >
          <option value="">All associations</option>
          {associations.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.shortCode})
            </option>
          ))}
        </select>
        {assocFilter ? (
          <span className="text-xs text-muted">
            Showing {associations.find((a) => a.id === assocFilter)?.name ?? "this association"} only
          </span>
        ) : null}
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-surface rounded-xl border border-line p-5">
          <p className="text-sm text-muted">Total Collected</p>
          <p className="text-2xl font-bold text-lime mt-1">
            ₦{(totalCollected / 100).toLocaleString()}
          </p>
        </div>
        <div className="bg-surface rounded-xl border border-line p-5">
          <p className="text-sm text-muted">Successful Payments</p>
          <p className="text-2xl font-bold text-text mt-1">{totalPaidCount}</p>
        </div>
        <div className="bg-surface rounded-xl border border-line p-5">
          <p className="text-sm text-muted">Active Fees</p>
          <p className="text-2xl font-bold text-text mt-1">{fees.length}</p>
        </div>
        <div className="bg-surface rounded-xl border border-line p-5">
          <p className="text-sm text-muted">Total Fee Value</p>
          <p className="text-2xl font-bold text-text mt-1">
            ₦{(fees.reduce((s, f) => s + f.amountKobo, 0) / 100).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Fees table */}
      <div className="bg-surface rounded-xl border border-line p-6 mb-8">
        <h2 className="font-semibold text-text mb-4">Fees across associations</h2>
        {fees.length === 0 ? (
          <p className="text-muted text-sm">No fees yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-line">
                  <th className="py-2 pr-4 font-medium">Fee</th>
                  <th className="py-2 pr-4 font-medium">Association</th>
                  <th className="py-2 pr-4 font-medium">Amount</th>
                  <th className="py-2 pr-4 font-medium">Due</th>
                  <th className="py-2 pr-4 font-medium">Paid</th>
                  <th className="py-2 font-medium">Collected</th>
                </tr>
              </thead>
              <tbody>
                {fees.map((f) => (
                  <tr key={f.id} className="border-b border-line/50">
                    <td className="py-3 pr-4 text-text">{f.name}</td>
                    <td className="py-3 pr-4 text-muted">
                      {f.association.name}
                    </td>
                    <td className="py-3 pr-4 text-text">
                      ₦{(f.amountKobo / 100).toLocaleString()}
                    </td>
                    <td className="py-3 pr-4 text-muted">
                      {new Date(f.dueDate).toLocaleDateString()}
                    </td>
                    <td className="py-3 pr-4 text-text">
                      {f.paidCount}/{f.paymentCount || "—"}
                    </td>
                    <td className="py-3 text-lime">
                      ₦{(f.collectedKobo / 100).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payments list */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-text">Recent payments</h2>
        <div className="flex gap-2">
          {["", "pending", "processing", "successful", "failed", "refunded", "disputed"].map(
            (s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filter === s
                    ? "bg-lime text-ink"
                    : "bg-surfaceAlt text-muted hover:bg-surfaceAlt"
                }`}
              >
                {s === "" ? "All" : s}
              </button>
            ),
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-surfaceAlt rounded-xl animate-pulse" />
          ))}
        </div>
      ) : payments.length === 0 ? (
        <div className="text-center py-16 bg-surface rounded-xl border border-line">
          <p className="text-muted">No payments match the filter</p>
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-line overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-line">
                  <th className="py-3 px-4 font-medium">Student</th>
                  <th className="py-3 px-4 font-medium">Fee</th>
                  <th className="py-3 px-4 font-medium">Association</th>
                  <th className="py-3 px-4 font-medium">Amount</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-line/50 hover:bg-surfaceAlt/30 transition-colors">
                    <td className="py-3 px-4">
                      <p className="text-text">{p.user.fullName}</p>
                      <p className="text-xs text-muted">{p.user.email}</p>
                    </td>
                    <td className="py-3 px-4 text-textSecondary">{p.fee.name}</td>
                    <td className="py-3 px-4 text-muted">
                      {p.fee.association.name}
                    </td>
                    <td className="py-3 px-4 text-text">
                      ₦{(p.amountKobo / 100).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                          STATUS_COLORS[p.status] ?? "bg-surfaceAlt text-textSecondary"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-muted">
                      {new Date(p.createdAt).toLocaleDateString()}
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
