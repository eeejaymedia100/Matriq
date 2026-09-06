"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { useSession } from "@/components/SessionProvider";
import {
  listResourceQueue,
  getResourceReviewDetail,
  decideResourceSubmission,
  setResourceReviewerNotes,
  retryResourceSubmission,
  fetchResourceFile,
} from "@/lib/api";
import type { ResourceQueueItem, ResourceReviewDetail } from "@/types/api";

const RISK_STYLES: Record<string, string> = {
  green: "bg-green-500",
  yellow: "bg-yellow-400",
  red: "bg-red-500",
};

const RECO_STYLES: Record<string, string> = {
  approve: "bg-green-100 text-green-800",
  review: "bg-yellow-100 text-yellow-800",
  reject: "bg-red-100 text-red-800",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function ScoreBar({ label, value, inverse }: { label: string; value: number; inverse?: boolean }) {
  // "Inverse" scores (risk-flavored) read better with the lime bar reserved
  // for positive signals; risk bars use amber.
  const good = inverse ? value < 40 : value >= 55;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted">{label}</span>
        <span className="text-text font-medium">{value}</span>
      </div>
      <div className="h-1.5 bg-void rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${good ? "bg-lime" : "bg-yellow-500"}`}
          style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

export default function ResourceAuditPage() {
  const router = useRouter();
  const { token } = useSession();

  const [items, setItems] = useState<ResourceQueueItem[]>([]);
  const [statusFilter, setStatusFilter] = useState("pending_human_review");
  const [riskFilter, setRiskFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ResourceReviewDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);

  const [previewFile, setPreviewFile] = useState<{ blob: Blob; mimeType: string; fileName: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const revokePreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!token) {
      router.push("/login");
    }
  }, [router, token]);

  const loadQueue = useCallback(async () => {
    if (!token) return;
    try {
      const data = await listResourceQueue(token, {
        status: statusFilter === "all" ? undefined : statusFilter,
        risk: riskFilter || undefined,
      });
      setItems(data.items);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't load the queue");
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, riskFilter]);

  useEffect(() => {
    setLoading(true);
    void loadQueue();
  }, [loadQueue]);

  const openDetail = useCallback(
    async (id: string) => {
      if (!token) return;
      setSelectedId(id);
      setDetailLoading(true);
      setPreviewFile(null);
      setPreviewError(null);
      setReason("");
      setPreviewUrl(null);
      revokePreviewUrl();
      try {
        const data = await getResourceReviewDetail(token, id);
        setDetail(data);
        setNotes(data.reviewerNotes ?? "");
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Couldn't load the submission");
      } finally {
        setDetailLoading(false);
      }
    },
    [token, revokePreviewUrl],
  );

  const loadPreview = useCallback(async () => {
    if (!token || !detail) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const file = await fetchResourceFile(token, detail.id);
      setPreviewFile(file);
      revokePreviewUrl();
      previewUrlRef.current = URL.createObjectURL(file.blob);
      setPreviewUrl(previewUrlRef.current);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Couldn't load the document");
    } finally {
      setPreviewLoading(false);
    }
  }, [token, detail]);

  useEffect(() => {
    return () => revokePreviewUrl();
  }, [revokePreviewUrl]);

  async function decide(decision: "approved" | "rejected" | "needs_information") {
    if (!token || !detail) return;
    if (decision !== "approved" && !reason.trim()) {
      setMessage("A reason is required to reject or request information.");
      return;
    }
    setActionId(detail.id);
    try {
      await decideResourceSubmission(token, detail.id, decision, reason.trim() || "approved after review");
      setMessage(
        decision === "approved"
          ? "Approved — reward evaluation and library processing are running."
          : decision === "rejected"
            ? "Rejected — the submission can no longer reach the library unless reopened."
            : "Marked as needing information — the submission is paused.",
      );
      setDetail(null);
      setSelectedId(null);
      await loadQueue();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionId(null);
    }
  }

  async function saveNotes() {
    if (!token || !detail) return;
    try {
      await setResourceReviewerNotes(token, detail.id, notes);
      setMessage("Reviewer notes saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't save notes");
    }
  }

  async function retry() {
    if (!token || !detail) return;
    setActionId(detail.id);
    try {
      await retryResourceSubmission(token, detail.id);
      setMessage("Retry queued — the pipeline resumes from the current stage.");
      await openDetail(detail.id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setActionId(null);
    }
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text">Resource Review</h1>
          <p className="text-sm text-muted mt-1">
            Every submission needs your approval before it enters the library. The AI recommendation is an
            assistant, not a decision.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            ["pending_human_review", "Pending"],
            ["rejected", "Rejected"],
            ["published", "Published"],
            ["failed", "Failed"],
            ["all", "All"],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === value ? "bg-lime text-ink" : "bg-surfaceAlt text-muted hover:text-text"
              }`}
            >
              {label}
            </button>
          ))}
          {(["", "green", "yellow", "red"] as const).map((r) => (
            <button
              key={r || "any"}
              onClick={() => setRiskFilter(r)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                riskFilter === r ? "bg-lime text-ink" : "bg-surfaceAlt text-muted hover:text-text"
              }`}
            >
              {r ? r.toUpperCase() : "Any risk"}
            </button>
          ))}
        </div>
      </div>

      {message && (
        <div className="bg-surfaceAlt border border-line text-text rounded-xl px-4 py-3 mb-6 text-sm flex justify-between items-start">
          <span>{message}</span>
          <button onClick={() => setMessage("")} aria-label="Dismiss">×</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Queue */}
        <div className="lg:col-span-2 space-y-3">
          {loading ? (
            [1, 2, 3].map((i) => <div key={i} className="h-24 bg-surfaceAlt rounded-xl animate-pulse" />)
          ) : items.length === 0 ? (
            <div className="text-center py-16 bg-surface rounded-xl border border-line">
              <p className="text-muted">
                {statusFilter === "pending_human_review"
                  ? "Queue is clear — nothing is waiting for review."
                  : "No submissions match this filter."}
              </p>
            </div>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                onClick={() => void openDetail(item.id)}
                className={`w-full text-left bg-surface rounded-xl border p-4 transition-colors ${
                  selectedId === item.id ? "border-lime" : "border-line hover:border-line-strong"
                }`}
              >
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${RISK_STYLES[item.riskLevel ?? ""] ?? "bg-surfaceAlt"}`}
                    title={`Risk: ${item.riskLevel ?? "unknown"}`}
                  />
                  <span className="text-sm font-bold text-lime">{item.courseCode}</span>
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      RECO_STYLES[item.aiRecommendation ?? ""] ?? "bg-surfaceAlt text-muted"
                    }`}
                  >
                    AI: {item.aiRecommendation ?? "—"}
                    {item.aiConfidence != null ? ` ${item.aiConfidence}%` : ""}
                  </span>
                  {item.duplicateOfId && (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      duplicate {item.duplicateSimilarity ?? 100}%
                    </span>
                  )}
                </div>
                <p className="text-text text-sm font-medium truncate">{item.fileName}</p>
                <p className="text-xs text-muted mt-1">
                  {item.student.fullName} · {item.materialType.replace(/_/g, " ")}
                  {item.pageCount ? ` · ${item.pageCount}p` : ""} · {formatBytes(item.fileSize)}
                </p>
                <p className="text-xs text-muted mt-0.5">
                  via {item.source} · {new Date(item.submittedAt).toLocaleString()}
                </p>
              </button>
            ))
          )}
        </div>

        {/* Detail */}
        <div className="lg:col-span-3">
          {!selectedId ? (
            <div className="text-center py-24 bg-surface rounded-xl border border-line">
              <p className="text-muted">Select a submission from the queue to review it.</p>
            </div>
          ) : detailLoading || !detail ? (
            <div className="h-96 bg-surfaceAlt rounded-xl animate-pulse" />
          ) : (
            <div className="bg-surface rounded-xl border border-line p-6 space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span
                      className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                        RISK_STYLES[detail.riskLevel ?? ""]
                          ? `${RISK_STYLES[detail.riskLevel ?? ""]} text-ink`
                          : "bg-surfaceAlt text-muted"
                      }`}
                    >
                      {detail.riskLevel ?? "unassessed"} risk
                    </span>
                    <span className="text-xs text-muted">{detail.auditStatus.replace(/_/g, " ")}</span>
                    {detail.duplicateOfId && (
                      <span className="text-xs text-red-400">
                        duplicates {detail.duplicateOfId.slice(0, 8)}… ({detail.duplicateSimilarity ?? 100}%)
                      </span>
                    )}
                  </div>
                  <p className="text-text font-semibold">{detail.fileName}</p>
                  <p className="text-xs text-muted mt-1">
                    Declared: {detail.courseCode} · {detail.materialType.replace(/_/g, " ")}
                    {detail.level ? ` · ${detail.level} level` : ""}
                    {detail.academicSession ? ` · ${detail.academicSession}` : ""} · {formatBytes(detail.fileSize)}
                  </p>
                  <p className="text-xs text-muted mt-0.5">
                    {detail.student.fullName} ({detail.student.matricNumber ?? "no matric"}) ·{" "}
                    {detail.student.email}
                  </p>
                </div>
                <a
                  href={detail.documentPreviewUrl}
                  onClick={(e) => {
                    e.preventDefault();
                    void loadPreview();
                  }}
                  className="px-3 py-1.5 text-sm rounded-lg border border-line bg-surfaceAlt text-text hover:text-lime transition-colors"
                >
                  {previewLoading ? "Loading…" : "View document"}
                </a>
              </div>

              {/* Document preview */}
              {previewError && <p className="text-sm text-red-400">{previewError}</p>}
              {previewFile && previewFile.mimeType.startsWith("image/") && (
                <div className="bg-void rounded-lg p-2 flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element -- blob URL can't use next/image */}
                  <img
                    src={previewUrl ?? ""}
                    alt={previewFile.fileName}
                    className="max-h-96 rounded object-contain"
                  />
                </div>
              )}
              {previewFile && !previewFile.mimeType.startsWith("image/") && (
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted">{previewFile.mimeType}</span>
                  <a
                    href={URL.createObjectURL(previewFile.blob)}
                    download={previewFile.fileName}
                    className="text-lime hover:underline"
                  >
                    Download original
                  </a>
                </div>
              )}

              {/* Validation + quality */}
              {detail.validation && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted mb-2">
                    Deterministic validation — verdict: {detail.validation.verdict}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {detail.validation.checks.map((c) => (
                      <span
                        key={c.name}
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs ${
                          c.verdict === "ok"
                            ? "bg-green-100 text-green-800"
                            : c.verdict === "warning"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800"
                        }`}
                      >
                        {c.name}: {c.verdict}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {detail.quality && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  {[
                    ["Pages", detail.quality.pageCount],
                    ["Chars/page", detail.quality.textDensityCharsPerPage],
                    ["Blank pages", `${Math.round(detail.quality.blankPageRatio * 100)}%`],
                    ["Repeated pages", `${Math.round(detail.quality.repeatedPageRatio * 100)}%`],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="bg-void rounded-lg p-3">
                      <p className="text-muted">{k}</p>
                      <p className="text-text font-semibold mt-0.5">{String(v)}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* AI report */}
              {detail.aiAuditReport ? (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted mb-2">
                    AI audit — assistant recommendation, never the decision
                    {detail.aiProvider ? ` · ${detail.aiProvider}/${detail.aiModel}` : ""}
                  </p>
                  {detail.aiAuditReport.scores && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mb-3">
                      <ScoreBar label="Academic relevance" value={detail.aiAuditReport.scores.academicRelevance} />
                      <ScoreBar label="Readability" value={detail.aiAuditReport.scores.readability} />
                      <ScoreBar label="Completeness" value={detail.aiAuditReport.scores.completeness} />
                      <ScoreBar label="Metadata match" value={detail.aiAuditReport.scores.metadataMatch} />
                      <ScoreBar label="Duplicate probability" value={detail.aiAuditReport.scores.duplicateProbability} inverse />
                      <ScoreBar label="Copyright risk" value={detail.aiAuditReport.scores.copyrightRisk} inverse />
                      <ScoreBar label="Suspicious content" value={detail.aiAuditReport.scores.suspiciousContentRisk} inverse />
                      <ScoreBar label="Reward abuse risk" value={detail.aiAuditReport.scores.rewardAbuseRisk} inverse />
                    </div>
                  )}
                  {(detail.aiAuditReport.reasons?.length ?? 0) > 0 && (
                    <ul className="text-xs text-textSecondary list-disc pl-4 space-y-1">
                      {detail.aiAuditReport.reasons?.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  )}
                  {(detail.aiAuditReport.contradictions?.length ?? 0) > 0 && (
                    <div className="mt-3 bg-red-950/40 border border-red-800 rounded-lg p-3">
                      <p className="text-xs font-semibold text-red-300 mb-1">Contradictions</p>
                      <ul className="text-xs text-red-200 list-disc pl-4 space-y-1">
                        {detail.aiAuditReport.contradictions?.map((c, i) => <li key={i}>{c}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted">
                  No AI report on this submission{detail.failure.reason ? ` — ${detail.failure.reason.replace(/_/g, " ")}` : ""}.
                </p>
              )}

              {/* Failure info + retry */}
              {detail.failure.reason && detail.auditStatus === "failed" && (
                <div className="bg-surfaceAlt rounded-lg p-3 text-xs text-muted">
                  <p className="font-semibold text-text mb-1">Pipeline failure</p>
                  <p>{detail.failure.lastStageError}</p>
                  <button
                    onClick={() => void retry()}
                    disabled={actionId === detail.id}
                    className="mt-2 px-3 py-1.5 rounded-lg bg-lime text-ink text-sm font-medium disabled:opacity-50"
                  >
                    {actionId === detail.id ? "Retrying…" : "Retry pipeline"}
                  </button>
                </div>
              )}

              {/* Reviewer notes */}
              <div>
                <label htmlFor="reviewer-notes" className="text-xs uppercase tracking-wide text-muted block mb-2">
                  Reviewer notes (private)
                </label>
                <textarea
                  id="reviewer-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-void border border-line rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-lime"
                  placeholder="Context for future reviewers…"
                />
                <button
                  onClick={() => void saveNotes()}
                  className="mt-2 px-3 py-1.5 text-sm rounded-lg border border-line bg-surfaceAlt text-text hover:text-lime transition-colors"
                >
                  Save notes
                </button>
              </div>

              {/* Decision */}
              <div className="border-t border-line pt-4">
                <label htmlFor="decision-reason" className="text-xs uppercase tracking-wide text-muted block mb-2">
                  Decision reason (required to reject or request info)
                </label>
                <input
                  id="decision-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-void border border-line rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-lime mb-3"
                  placeholder="Shown to the student for rejects / info requests"
                />
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => void decide("approved")}
                    disabled={actionId === detail.id}
                    className="px-4 py-2 text-sm bg-green-600 text-text rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors font-medium"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => void decide("needs_information")}
                    disabled={actionId === detail.id}
                    className="px-4 py-2 text-sm bg-yellow-600 text-text rounded-lg hover:bg-yellow-700 disabled:opacity-50 transition-colors font-medium"
                  >
                    Needs information
                  </button>
                  <button
                    onClick={() => void decide("rejected")}
                    disabled={actionId === detail.id}
                    className="px-4 py-2 text-sm bg-red-600 text-text rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors font-medium"
                  >
                    Reject
                  </button>
                </div>
                <p className="text-xs text-muted mt-3">
                  Approval still runs reward evaluation and library processing separately — approval alone
                  publishes nothing until those stages succeed.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
