"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { useSession } from "@/components/SessionProvider";
import { listPayments, listFees } from "@/lib/api";
import type { AdminPayment, AdminFee } from "@/types/api";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  successful: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-600",
  refunded: "bg-purple-100 text-purple-800",
  disputed: "bg-orange-100 text-orange-800",
};

export default function PaymentsPage() {
  const router = useRouter();
  const { token } = useSession();
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [fees, setFees] = useState<AdminFee[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [p, f] = await Promise.all([
        listPayments(token, filter ? { status: filter } : {}),
        listFees(token),
      ]);
      setPayments(p.payments);
      setFees(f.fees);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token, filter]);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [p, f] = await Promise.all([
          listPayments(token, filter ? { status: filter } : {}),
          listFees(token),
        ]);
        if (!cancelled) {
          setPayments(p.payments);
          setFees(f.fees);
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
  }, [router, token, filter]);

  const totalCollected = fees.reduce((s, f) => s + f.collectedKobo, 0);
  const totalPaidCount = fees.reduce((s, f) => s + f.paidCount, 0);

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-white mb-6">Payments</h1>

      {/* Summary strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <p className="text-sm text-gray-400">Total Collected</p>
          <p className="text-2xl font-bold text-purple-400 mt-1">
            ₦{(totalCollected / 100).toLocaleString()}
          </p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <p className="text-sm text-gray-400">Successful Payments</p>
          <p className="text-2xl font-bold text-white mt-1">{totalPaidCount}</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <p className="text-sm text-gray-400">Active Fees</p>
          <p className="text-2xl font-bold text-white mt-1">{fees.length}</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <p className="text-sm text-gray-400">Total Fee Value</p>
          <p className="text-2xl font-bold text-white mt-1">
            ₦{(fees.reduce((s, f) => s + f.amountKobo, 0) / 100).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Fees table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-8">
        <h2 className="font-semibold text-white mb-4">Fees across associations</h2>
        {fees.length === 0 ? (
          <p className="text-gray-500 text-sm">No fees yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-800">
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
                  <tr key={f.id} className="border-b border-gray-800/50">
                    <td className="py-3 pr-4 text-gray-200">{f.name}</td>
                    <td className="py-3 pr-4 text-gray-400">
                      {f.association.name}
                    </td>
                    <td className="py-3 pr-4 text-gray-200">
                      ₦{(f.amountKobo / 100).toLocaleString()}
                    </td>
                    <td className="py-3 pr-4 text-gray-400">
                      {new Date(f.dueDate).toLocaleDateString()}
                    </td>
                    <td className="py-3 pr-4 text-gray-200">
                      {f.paidCount}/{f.paymentCount || "—"}
                    </td>
                    <td className="py-3 text-purple-400">
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
        <h2 className="font-semibold text-white">Recent payments</h2>
        <div className="flex gap-2">
          {["", "pending", "processing", "successful", "failed", "refunded", "disputed"].map(
            (s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filter === s
                    ? "bg-purple-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
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
            <div key={i} className="h-20 bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : payments.length === 0 ? (
        <div className="text-center py-16 bg-gray-900 rounded-xl border border-gray-800">
          <p className="text-gray-500">No payments match the filter</p>
        </div>
      ) : (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-800">
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
                  <tr key={p.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="py-3 px-4">
                      <p className="text-gray-200">{p.user.fullName}</p>
                      <p className="text-xs text-gray-500">{p.user.email}</p>
                    </td>
                    <td className="py-3 px-4 text-gray-300">{p.fee.name}</td>
                    <td className="py-3 px-4 text-gray-400">
                      {p.fee.association.name}
                    </td>
                    <td className="py-3 px-4 text-gray-200">
                      ₦{(p.amountKobo / 100).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                          STATUS_COLORS[p.status] ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-400">
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
