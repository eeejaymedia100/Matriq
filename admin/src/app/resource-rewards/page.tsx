"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { useSession } from "@/components/SessionProvider";
import {
  listResourceRewards,
  markResourceRewardPaid,
  disputeResourceReward,
  getResourceLeaderboard,
  getResourceCampaign,
} from "@/lib/api";
import type {
  ResourceRewardRow,
  ResourceLeaderboardRow,
  ResourceCampaignConfig,
} from "@/types/api";

const STATES = ["", "pending", "eligible", "processing", "paid", "rejected", "disputed"];

const STATE_STYLES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  eligible: "bg-green-100 text-green-800",
  processing: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  disputed: "bg-red-100 text-red-800",
};

export default function ResourceRewardsPage() {
  const router = useRouter();
  const { token } = useSession();

  const [rewards, setRewards] = useState<ResourceRewardRow[]>([]);
  const [board, setBoard] = useState<ResourceLeaderboardRow[]>([]);
  const [campaign, setCampaign] = useState<ResourceCampaignConfig | null>(null);
  const [stateFilter, setStateFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [payoutRef, setPayoutRef] = useState("");
  const [payoutMethod, setPayoutMethod] = useState<"airtime" | "bank_transfer">("airtime");

  useEffect(() => {
    if (!token) router.push("/login");
  }, [router, token]);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [r, b, c] = await Promise.all([
        listResourceRewards(token, stateFilter || undefined),
        getResourceLeaderboard(token),
        getResourceCampaign(token),
      ]);
      setRewards(r.items);
      setBoard(b.items);
      setCampaign(c);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't load rewards");
    } finally {
      setLoading(false);
    }
  }, [token, stateFilter]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  async function markPaid(id: string) {
    if (!token) return;
    if (!payoutRef.trim()) {
      setMessage("Enter the payout reference (transaction ID, transfer receipt…) first.");
      return;
    }
    setBusyId(id);
    try {
      await markResourceRewardPaid(token, id, payoutMethod, payoutRef.trim());
      setMessage(`Reward marked paid via ${payoutMethod.replace("_", " ")}.`);
      setPayoutRef("");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't record the payout");
    } finally {
      setBusyId(null);
    }
  }

  async function dispute(id: string) {
    if (!token) return;
    setBusyId(id);
    try {
      await disputeResourceReward(token, id, "flagged from rewards console");
      setMessage("Reward moved to disputed.");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't dispute the reward");
    } finally {
      setBusyId(null);
    }
  }

  const actionable = rewards.filter((r) => r.state === "pending" || r.state === "eligible" || r.state === "processing");

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text">Rewards</h1>
        <p className="text-sm text-muted mt-1">
          Payouts are manual in V1. Only approved, qualifying resources ever reach this ledger.
        </p>
      </div>

      {message && (
        <div className="bg-surfaceAlt border border-line text-text rounded-xl px-4 py-3 mb-6 text-sm flex justify-between items-start">
          <span>{message}</span>
          <button onClick={() => setMessage("")} aria-label="Dismiss">×</button>
        </div>
      )}

      {/* Campaign summary */}
      {campaign && (
        <div className="bg-surface rounded-xl border border-line p-5 mb-6">
          <div className="flex items-center gap-3 flex-wrap mb-3">
            <p className="text-text font-semibold">{campaign.name}</p>
            <span
              className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                campaign.active ? "bg-green-100 text-green-800" : "bg-surfaceAlt text-muted"
              }`}
            >
              {campaign.active ? "active" : "inactive"}
            </span>
            <span className="text-xs text-muted">{campaign.pointsPerApproved} point per approved resource</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {campaign.tiers.map((t) => (
              <div key={t.id} className="bg-void rounded-lg p-3">
                <p className="text-xs text-muted">{t.label}</p>
                <p className="text-text text-sm font-medium mt-0.5">
                  {t.kind.replace("_", " ")} · {t.value ?? "—"}
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted mt-3">Tiers are configured via RESOURCE_AUDIT_CAMPAIGN_CONFIG (env).</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Rewards ledger */}
        <div className="lg:col-span-2">
          <div className="flex gap-2 flex-wrap mb-4">
            {STATES.map((s) => (
              <button
                key={s || "all"}
                onClick={() => setStateFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  stateFilter === s ? "bg-lime text-ink" : "bg-surfaceAlt text-muted hover:text-text"
                }`}
              >
                {s || "All"}
              </button>
            ))}
          </div>

          {loading ? (
            [1, 2, 3].map((i) => <div key={i} className="h-20 bg-surfaceAlt rounded-xl animate-pulse mb-3" />)
          ) : rewards.length === 0 ? (
            <div className="text-center py-16 bg-surface rounded-xl border border-line">
              <p className="text-muted">No rewards in this state yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rewards.map((r) => (
                <div key={r.id} className="bg-surface rounded-xl border border-line p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            STATE_STYLES[r.state] ?? "bg-surfaceAlt text-muted"
                          }`}
                        >
                          {r.state}
                        </span>
                        <span className="text-xs text-muted">{r.tierId} tier · {r.pointsAtEarn} pts</span>
                      </div>
                      <p className="text-text text-sm font-medium mt-1">{r.student.fullName}</p>
                      <p className="text-xs text-muted">{r.student.email}</p>
                      {r.note && <p className="text-xs text-muted mt-1">{r.note}</p>}
                      {r.paidAt && (
                        <p className="text-xs text-muted mt-1">
                          Paid {new Date(r.paidAt).toLocaleString()} via {r.payoutMethod} ({r.payoutRef})
                        </p>
                      )}
                    </div>
                    {(r.state === "pending" || r.state === "eligible" || r.state === "processing") && (
                      <div className="flex flex-col gap-2 items-stretch">
                        <div className="flex gap-2">
                          <select
                            value={payoutMethod}
                            onChange={(e) => setPayoutMethod(e.target.value as "airtime" | "bank_transfer")}
                            className="bg-void border border-line rounded-lg px-2 py-1.5 text-xs text-text"
                            aria-label="Payout method"
                          >
                            <option value="airtime">airtime</option>
                            <option value="bank_transfer">bank transfer</option>
                          </select>
                        </div>
                        <input
                          value={payoutRef}
                          onChange={(e) => setPayoutRef(e.target.value)}
                          placeholder="Payout reference"
                          className="bg-void border border-line rounded-lg px-2 py-1.5 text-xs text-text w-44"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => void markPaid(r.id)}
                            disabled={busyId === r.id}
                            className="px-3 py-1.5 text-xs bg-green-600 text-text rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
                          >
                            {busyId === r.id ? "…" : "Mark paid"}
                          </button>
                          <button
                            onClick={() => void dispute(r.id)}
                            disabled={busyId === r.id}
                            className="px-3 py-1.5 text-xs border border-line bg-surfaceAlt text-muted hover:text-text rounded-lg disabled:opacity-50"
                          >
                            Dispute
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {actionable.length > 0 && (
            <p className="text-xs text-muted mt-3">{actionable.length} reward(s) awaiting payout action.</p>
          )}
        </div>

        {/* Leaderboard */}
        <div>
          <div className="bg-surface rounded-xl border border-line p-5">
            <p className="text-sm font-semibold text-text mb-3">Leaderboard</p>
            <p className="text-xs text-muted mb-3">
              Ranked by approved contribution points — never raw upload counts.
            </p>
            {board.length === 0 ? (
              <p className="text-sm text-muted py-6 text-center">No qualifying contributions yet.</p>
            ) : (
              <ol className="space-y-2">
                {board.map((row) => (
                  <li key={row.studentId} className="flex items-center justify-between text-sm">
                    <span className="text-text truncate">
                      <span className="text-muted mr-2">#{row.rank}</span>
                      {row.name}
                    </span>
                    <span className="text-lime font-medium">{row.points} pts</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
