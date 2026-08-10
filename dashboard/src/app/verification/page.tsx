"use client";

import { useCallback, useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useSession } from "@/components/SessionProvider";
import {
  getVerificationRequests,
  getVerificationDocument,
  approveVerification,
  rejectVerification,
} from "@/lib/api";
import type { VerificationRequest } from "@/types/api";

export default function VerificationPage() {
  const { status, token, associationId } = useSession();
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected">(
    "pending",
  );
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<{
    mimeType: string;
    dataUri: string;
    name: string;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const loadRequests = useCallback(async () => {
    if (!token || !associationId) return;
    try {
      const data = await getVerificationRequests(
        associationId,
        token,
        filter === "pending" ? "pending" : undefined,
      );
      // Filter client-side for non-pending
      setRequests(
        filter === "pending"
          ? data.requests
          : data.requests.filter((r) => r.status === filter),
      );
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token, associationId, filter]);

  useEffect(() => {
    if (status !== "authenticated" || !token || !associationId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getVerificationRequests(
          associationId,
          token,
          filter === "pending" ? "pending" : undefined,
        );
        if (!cancelled) {
          setRequests(
            filter === "pending"
              ? data.requests
              : data.requests.filter((r) => r.status === filter),
          );
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
  }, [filter, status, token, associationId]);

  async function handleViewDocument(req: VerificationRequest) {
    if (!token || !associationId) return;
    try {
      const doc = await getVerificationDocument(req.id, associationId, token);
      setSelectedDoc({
        mimeType: doc.mimeType,
        dataUri: doc.dataUri,
        name: req.documentOriginalName,
      });
    } catch (err) {
      console.error(err);
    }
  }

  async function handleApprove(reqId: string) {
    if (!token || !associationId) return;
    setActionLoading(reqId);
    try {
      const result = await approveVerification(reqId, associationId, token);
      setMessage(result.message);
      loadRequests();
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Approve failed",
      );
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(reqId: string) {
    if (!token || !associationId || !rejectReason.trim()) return;
    setActionLoading(reqId);
    try {
      const result = await rejectVerification(
        reqId,
        associationId,
        rejectReason,
        token,
      );
      setMessage(result.message);
      setRejectingId(null);
      setRejectReason("");
      loadRequests();
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Reject failed",
      );
    } finally {
      setActionLoading(null);
    }
  }

  function getStatusBadge(status: string) {
    const colors: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800",
      approved: "bg-green-100 text-green-800",
      rejected: "bg-red-100 text-red-800",
    };
    return (
      <span
        className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
          colors[status] || ""
        }`}
      >
        {status}
      </span>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Identity Verification
        </h1>
        <div className="flex gap-2">
          {(["pending", "approved", "rejected"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-purple-700 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {message && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 mb-6 text-sm">
          {message}
          <button
            onClick={() => setMessage("")}
            className="ml-2 text-green-500 hover:text-green-700"
          >
            ×
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 bg-gray-100 rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500">No {filter} verification requests</p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => (
            <div
              key={req.id}
              className="bg-white rounded-xl border border-gray-200 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-gray-900 truncate">
                      {req.user.fullName}
                    </h3>
                    {getStatusBadge(req.status)}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-gray-500">
                    <div>
                      <span className="font-medium text-gray-600">Email:</span>{" "}
                      {req.user.email}
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">
                        {req.user.registrationType === "staylite"
                          ? "Matric:"
                          : "JAMB:"}
                      </span>{" "}
                      {req.user.matricNumber || req.user.jambNumber || "—"}
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Dept:</span>{" "}
                      {req.user.department}
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Level:</span>{" "}
                      {req.user.level}
                    </div>
                  </div>
                  {req.rejectionReason && (
                    <p className="text-sm text-red-600 mt-2">
                      Rejection reason: {req.rejectionReason}
                    </p>
                  )}
                </div>

                {req.status === "pending" && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleViewDocument(req)}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      View Doc
                    </button>
                    <button
                      onClick={() => handleApprove(req.id)}
                      disabled={actionLoading === req.id}
                      className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-400 transition-colors"
                    >
                      {actionLoading === req.id ? "..." : "Approve"}
                    </button>
                    <button
                      onClick={() => setRejectingId(req.id)}
                      className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>

              {/* Reject reason modal inline */}
              {rejectingId === req.id && (
                <div className="mt-4 p-4 bg-red-50 rounded-lg border border-red-200">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rejection reason (required)
                  </label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none"
                    placeholder="e.g. ID card is blurry, please re-upload"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleReject(req.id)}
                      disabled={actionLoading === req.id || !rejectReason.trim()}
                      className="px-4 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-400"
                    >
                      {actionLoading === req.id ? "..." : "Confirm Reject"}
                    </button>
                    <button
                      onClick={() => {
                        setRejectingId(null);
                        setRejectReason("");
                      }}
                      className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Document viewer modal */}
      {selectedDoc && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedDoc(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-gray-900">
                {selectedDoc.name}
              </h3>
              <button
                onClick={() => setSelectedDoc(null)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ×
              </button>
            </div>
            <div className="p-4 flex items-center justify-center">
              {selectedDoc.mimeType.startsWith("image/") ? (
                /* eslint-disable-next-line @next/next/no-img-element -- data-URI previews can't use next/image */
                <img
                  src={selectedDoc.dataUri}
                  alt={selectedDoc.name}
                  className="max-w-full max-h-[60vh] rounded-lg object-contain"
                />
              ) : (
                <p className="text-gray-500">
                  Cannot preview this file type ({selectedDoc.mimeType})
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
