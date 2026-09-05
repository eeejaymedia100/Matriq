"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { useSession } from "@/components/SessionProvider";
import { listVerificationRequests, fetchVerificationDocument } from "@/lib/api";
import type { AdminVerificationRequest } from "@/types/api";

export default function VerificationPage() {
  const router = useRouter();
  const { token } = useSession();
  const [requests, setRequests] = useState<AdminVerificationRequest[]>([]);
  const [filter, setFilter] = useState<string>("pending");
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<AdminVerificationRequest | null>(null);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [docMime, setDocMime] = useState<string | null>(null);
  const [docName, setDocName] = useState<string | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  const openDocument = async (req: AdminVerificationRequest) => {
    if (!token) return;
    setViewing(req);
    setDocUrl(null);
    setDocError(null);
    setDocLoading(true);
    try {
      const { blob, mimeType, fileName } = await fetchVerificationDocument(
        token,
        req.id,
      );
      setDocMime(mimeType);
      setDocName(fileName);
      if (mimeType.startsWith("image/")) {
        setDocUrl(URL.createObjectURL(blob));
      } else {
        // Non-image (e.g. a PDF) — offer the download instead.
        const url = URL.createObjectURL(blob);
        setDocUrl(url);
      }
    } catch (err) {
      setDocError(err instanceof Error ? err.message : "Couldn't load the document");
    } finally {
      setDocLoading(false);
    }
  };

  const closeDocument = () => {
    setViewing(null);
    setDocUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const downloadDocument = () => {
    if (!docUrl) return;
    const a = document.createElement("a");
    a.href = docUrl;
    a.download = docName ?? "verification-document";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

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
        <h1 className="text-2xl font-bold text-text">
          Identity Verification
        </h1>
        <div className="flex gap-2">
          {["pending", "approved", "rejected", "all"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-lime text-ink"
                  : "bg-surfaceAlt text-muted hover:bg-surfaceAlt"
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
            <div key={i} className="h-24 bg-surfaceAlt rounded-xl animate-pulse" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-16 bg-surface rounded-xl border border-line">
          <p className="text-muted">
            No {filter === "all" ? "" : filter} verification requests
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => (
            <div
              key={req.id}
              className="bg-surface rounded-xl border border-line p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-text truncate">
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
                  <button
                    onClick={() => void openDocument(req)}
                    className="mt-1 px-3 py-1.5 text-xs bg-surfaceAlt hover:bg-surfaceAlt text-text rounded-lg border border-line transition-colors"
                  >
                    View document
                  </button>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-muted">
                    <div>
                      <span className="font-medium text-muted">
                        Association:
                      </span>{" "}
                      {req.association.name}
                    </div>
                    <div>
                      <span className="font-medium text-muted">Email:</span>{" "}
                      {req.user.email}
                    </div>
                    <div>
                      <span className="font-medium text-muted">
                        {req.user.registrationType === "staylite"
                          ? "Matric:"
                          : "JAMB:"}
                      </span>{" "}
                      {req.user.matricNumber || req.user.jambNumber || "—"}
                    </div>
                    <div>
                      <span className="font-medium text-muted">Dept:</span>{" "}
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

      {/* Document viewer modal */}
      {viewing ? (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={closeDocument}
        >
          <div
            className="bg-surface rounded-xl border border-line max-w-2xl w-full max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <div className="min-w-0">
                <p className="text-text font-semibold truncate">
                  {viewing.user.fullName}
                </p>
                <p className="text-xs text-muted truncate">
                  {docName ?? viewing.documentOriginalName} · {viewing.association.name}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {docUrl && !docMime?.startsWith("image/") ? (
                  <button
                    onClick={downloadDocument}
                    className="px-3 py-1.5 text-sm bg-lime hover:brightness-110 text-ink rounded-lg transition-colors"
                  >
                    Download
                  </button>
                ) : null}
                <button
                  onClick={closeDocument}
                  className="px-3 py-1.5 text-sm bg-surfaceAlt hover:bg-surfaceAlt text-textSecondary rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="p-5">
              {docLoading ? (
                <div className="h-64 bg-surfaceAlt rounded-lg animate-pulse" />
              ) : docError ? (
                <p className="text-sm text-red-400">{docError}</p>
              ) : docUrl ? (
                docMime?.startsWith("image/") ? (
                  <div className="bg-void rounded-lg p-2 flex justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element -- blob URL can't use next/image */}
                    <img
                      src={docUrl}
                      alt={viewing.user.fullName}
                      className="max-h-[65vh] rounded object-contain"
                    />
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-sm text-muted mb-4">
                      This document isn&apos;t an image — download it to review.
                    </p>
                    <button
                      onClick={downloadDocument}
                      className="px-4 py-2 text-sm bg-lime hover:brightness-110 text-ink rounded-lg transition-colors"
                    >
                      Download {docName}
                    </button>
                  </div>
                )
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </AdminLayout>
  );
}
