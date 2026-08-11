"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { useSession } from "@/components/SessionProvider";
import { listVerificationRequests } from "@/lib/api";
import type { AdminVerificationRequest } from "@/types/api";

export default function VerificationPage() {
  const router = useRouter();
  const { token } = useSession();
  const [requests, setRequests] = useState<AdminVerificationRequest[]>([]);
  const [filter, setFilter] = useState<string>("pending");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await listVerificationRequests(
          token,
          filter === "all" ? undefined : filter,
        );
        if (!cancelled) setRequests(data.requests);
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

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">
          Identity Verification
        </h1>
        <div className="flex gap-2">
          {["pending", "approved", "rejected", "all"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-purple-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-16 bg-gray-900 rounded-xl border border-gray-800">
          <p className="text-gray-500">
            No {filter === "all" ? "" : filter} verification requests
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => (
            <div
              key={req.id}
              className="bg-gray-900 rounded-xl border border-gray-800 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-white truncate">
                      {req.user.fullName}
                    </h3>
                    <span
                      className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                        req.status === "pending"
                          ? "bg-yellow-100 text-yellow-800"
                          : req.status === "approved"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                      }`}
                    >
                      {req.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-gray-500">
                    <div>
                      <span className="font-medium text-gray-400">
                        Association:
                      </span>{" "}
                      {req.association.name}
                    </div>
                    <div>
                      <span className="font-medium text-gray-400">Email:</span>{" "}
                      {req.user.email}
                    </div>
                    <div>
                      <span className="font-medium text-gray-400">
                        {req.user.registrationType === "staylite"
                          ? "Matric:"
                          : "JAMB:"}
                      </span>{" "}
                      {req.user.matricNumber || req.user.jambNumber || "—"}
                    </div>
                    <div>
                      <span className="font-medium text-gray-400">Dept:</span>{" "}
                      {req.user.department}
                    </div>
                  </div>
                  {req.rejectionReason && (
                    <p className="text-sm text-red-400 mt-2">
                      Rejection reason: {req.rejectionReason}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
