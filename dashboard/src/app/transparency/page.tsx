"use client";

import { useEffect, useState, FormEvent } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useSession } from "@/components/SessionProvider";
import { getDashboardStats, updateTransparency } from "@/lib/api";

export default function TransparencyPage() {
  const { status, token, associationId } = useSession();
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [breakdown, setBreakdown] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (status !== "authenticated" || !token || !associationId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getDashboardStats(associationId, token);
        if (!cancelled) {
          setStats(data as unknown as Record<string, unknown>);
        }
      } catch (err) {
        console.error(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, token, associationId]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!token || !associationId) return;
    setSaving(true);
    try {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(breakdown);
      } catch {
        parsed = { description: breakdown };
      }
      await updateTransparency(associationId, parsed, token);
      setMessage("Transparency updated");
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Failed to save",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardLayout>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Fund Transparency
      </h1>

      {message && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 mb-6 text-sm">
          {message}
          <button onClick={() => setMessage("")} className="ml-2">×</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">
            Edit Breakdown
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            President-only. Enter a JSON object describing where dues go (e.g.
            {"{\"materials\": 30, \"events\": 20, \"welfare\": 25, \"admin\": 25}"}).
          </p>
          <form onSubmit={handleSave} className="space-y-4">
            <textarea
              value={breakdown}
              onChange={(e) => setBreakdown(e.target.value)}
              rows={6}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-purple-500 outline-none"
              placeholder='{"materials": 30, "events": 20}'
            />
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-purple-700 text-white rounded-lg text-sm font-medium hover:bg-purple-800 disabled:bg-purple-400 transition-colors"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </form>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">
            Current Summary
          </h2>
          {stats ? (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Total Collected</span>
                <span className="font-medium text-gray-900">
                  ₦{((stats.totalCollectedKobo as number || 0) / 100).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total Members</span>
                <span className="font-medium text-gray-900">
                  {stats.totalMembers as number}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Payment Rate</span>
                <span className="font-medium text-gray-900">
                  {(stats.paymentRate as number || 0).toFixed(1)}%
                </span>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">Loading...</p>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
