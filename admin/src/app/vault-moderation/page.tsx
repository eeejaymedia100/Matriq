"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { useSession } from "@/components/SessionProvider";
import {
  listVaultItems,
  moderateVaultItem,
  getVaultItemText,
  fetchVaultItemFile,
} from "@/lib/api";
import type { AdminVaultItem, VaultTextPreview } from "@/types/api";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function VaultModerationPage() {
  const router = useRouter();
  const { token } = useSession();
  const [items, setItems] = useState<AdminVaultItem[]>([]);
  const [filter, setFilter] = useState<string>("pending");
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<VaultTextPreview | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<{
    blob: Blob;
    mimeType: string;
    fileName: string;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const revokePreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  const clearPreview = useCallback(() => {
    setPreviewingId(null);
    setPreview(null);
    setPreviewFile(null);
    setPreviewError(null);
    revokePreviewUrl();
    setPreviewImageUrl(null);
  }, [revokePreviewUrl]);

  const togglePreview = async (item: AdminVaultItem) => {
    if (!token) return;
    if (previewingId === item.id) {
      clearPreview();
      return;
    }
    setPreviewingId(item.id);
    setPreview(null);
    setPreviewFile(null);
    setPreviewError(null);
    setPreviewLoading(true);
    try {
      const [text, file] = await Promise.all([
        getVaultItemText(token, item.id),
        fetchVaultItemFile(token, item.id),
      ]);
      setPreview(text);
      setPreviewFile(file);
      if (file.mimeType.startsWith("image/")) {
        revokePreviewUrl();
        previewUrlRef.current = URL.createObjectURL(file.blob);
        setPreviewImageUrl(previewUrlRef.current);
      }
    } catch (err) {
      setPreviewError(
        err instanceof Error ? err.message : "Couldn't load the preview",
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const downloadOriginal = (file: {
    blob: Blob;
    mimeType: string;
    fileName: string;
  }) => {
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 4000);
  };

  useEffect(() => {
    // Revoke any live object URL when the page unmounts.
    return () => revokePreviewUrl();
  }, [revokePreviewUrl]);

  const load = useCallback(async () => {
    if (!token) return;
    const data = await listVaultItems(
      token,
      filter === "all" ? undefined : filter,
    );
    setItems(data.items);
  }, [token, filter]);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await listVaultItems(
          token,
          filter === "all" ? undefined : filter,
        );
        if (!cancelled) setItems(data.items);
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
      const result = await moderateVaultItem(id, status, token);
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
        <h1 className="text-2xl font-bold text-white">Vault Moderation</h1>
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
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-gray-900 rounded-xl border border-gray-800">
          <p className="text-gray-500">
            No {filter === "all" ? "" : filter} vault items
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-gray-900 rounded-xl border border-gray-800 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <span className="text-sm font-bold text-purple-300">
                      {item.courseCode}
                    </span>
                    <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-gray-700 text-gray-200">
                      {item.type === "past_question" ? "Past question" : "Material"}
                    </span>
                    <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-gray-800 text-gray-400">
                      {item.visibility}
                    </span>
                    <span
                      className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                        item.moderationStatus === "pending"
                          ? "bg-yellow-100 text-yellow-800"
                          : item.moderationStatus === "approved"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                      }`}
                    >
                      {item.moderationStatus}
                    </span>
                  </div>
                  <p className="text-gray-200 font-medium">{item.title}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    {item.originalName} · {formatBytes(item.sizeBytes)}
                    {item.hasCompanion ? " · light copy" : ""} ·{" "}
                    {item.downloads} downloads
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {item.user?.fullName ?? "Unknown"} ({item.user?.email ?? ""}) ·{" "}
                    {item.association?.name ?? "General"} ·{" "}
                    {new Date(item.createdAt).toLocaleString()}
                  </p>
                  {item.rejectionReason && (
                    <p className="text-xs text-red-400 mt-1">
                      Reason: {item.rejectionReason}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => void togglePreview(item)}
                    disabled={previewLoading && previewingId === item.id}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      previewingId === item.id
                        ? "bg-purple-600 border-purple-600 text-white"
                        : "bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700"
                    }`}
                  >
                    {previewingId === item.id ? "Close" : "Preview"}
                  </button>
                  {item.moderationStatus === "pending" && (
                    <>
                      <button
                        onClick={() => handleModerate(item.id, "approved")}
                        disabled={actionId === item.id}
                        className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-400 transition-colors"
                      >
                        {actionId === item.id ? "..." : "Approve"}
                      </button>
                      <button
                        onClick={() => handleModerate(item.id, "rejected")}
                        disabled={actionId === item.id}
                        className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-400 transition-colors"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Inline preview — see the actual content before deciding */}
              {previewingId === item.id ? (
                <div className="mt-4 border-t border-gray-800 pt-4">
                  {previewLoading ? (
                    <div className="h-20 bg-gray-800 rounded-lg animate-pulse" />
                  ) : previewError ? (
                    <p className="text-sm text-red-400">{previewError}</p>
                  ) : (
                    <div className="space-y-3">
                      {previewImageUrl && (
                        <div className="bg-gray-950 rounded-lg p-2 flex justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element -- blob URL can't use next/image */}
                          <img
                            src={previewImageUrl}
                            alt={item.originalName}
                            className="max-h-80 rounded object-contain"
                          />
                        </div>
                      )}
                      {preview?.text ? (
                        <div>
                          <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">
                            {preview.source === "pdf" ? "Text layer" : "OCR text"}
                          </p>
                          <p className="text-sm text-gray-300 whitespace-pre-wrap bg-gray-950 rounded-lg p-3 max-h-72 overflow-y-auto leading-relaxed">
                            {preview.text}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">
                          {previewFile?.mimeType.startsWith("image/") || preview?.source === "none"
                            ? "No readable text in this file."
                            : "No readable text found."}
                        </p>
                      )}
                      {previewFile && !previewFile.mimeType.startsWith("image/") && (
                        <button
                          onClick={() => downloadOriginal(previewFile)}
                          className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg border border-gray-700 transition-colors"
                        >
                          Download original ({previewFile.fileName})
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
