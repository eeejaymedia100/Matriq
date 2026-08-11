"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { useSession } from "@/components/SessionProvider";
import { listAiDocuments, moderateAiDocument } from "@/lib/api";
import type { AiDocument } from "@/types/api";

export default function AiModerationPage() {
  const router = useRouter();
  const { token } = useSession();
  const [documents, setDocuments] = useState<AiDocument[]>([]);
  const [filter, setFilter] = useState<string>("pending");
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    const data = await listAiDocuments(
      token,
      filter === "all" ? undefined : filter,
    );
    setDocuments(data.documents);
  }, [token, filter]);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await listAiDocuments(
          token,
          filter === "all" ? undefined : filter,
        );
        if (!cancelled) setDocuments(data.documents);
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

  async function handleModerate(id: string, status: "approved" | "rejected") {
    if (!token) return;
    setActionId(id);
    try {
      const result = await moderateAiDocument(id, status, token);
      setMessage(result.message);
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionId(null);
    }
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">AI Study Material</h1>
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

      {message && (
        <div className="bg-green-900/50 border border-green-700 text-green-300 rounded-xl px-4 py-3 mb-6 text-sm">
          {message}
          <button onClick={() => setMessage("")} className="ml-2">
            ×
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-16 bg-gray-900 rounded-xl border border-gray-800">
          <p className="text-gray-500">No {filter === "all" ? "" : filter} documents</p>
        </div>
      ) : (
        <div className="space-y-4">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="bg-gray-900 rounded-xl border border-gray-800 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-gray-700 text-gray-200">
                      {doc.sourceType}
                    </span>
                    {doc.courseCode && (
                      <span className="text-sm font-semibold text-purple-300">
                        {doc.courseCode}
                      </span>
                    )}
                    <span
                      className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                        doc.moderationStatus === "pending"
                          ? "bg-yellow-100 text-yellow-800"
                          : doc.moderationStatus === "approved"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                      }`}
                    >
                      {doc.moderationStatus}
                    </span>
                  </div>
                  <p className="text-gray-300 text-sm line-clamp-3 whitespace-pre-wrap">
                    {doc.contentChunk.slice(0, 400)}
                    {doc.contentChunk.length > 400 ? "…" : ""}
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    {doc.submitter?.fullName ?? "Unknown"} ·{" "}
                    {doc.submitter?.email ?? ""} ·{" "}
                    {doc.association?.name ?? "General"} ·{" "}
                    {new Date(doc.createdAt).toLocaleString()}
                  </p>
                </div>

                {doc.moderationStatus === "pending" && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleModerate(doc.id, "approved")}
                      disabled={actionId === doc.id}
                      className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-400 transition-colors"
                    >
                      {actionId === doc.id ? "..." : "Approve"}
                    </button>
                    <button
                      onClick={() => handleModerate(doc.id, "rejected")}
                      disabled={actionId === doc.id}
                      className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-400 transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
