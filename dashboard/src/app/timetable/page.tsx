"use client";

import { useCallback, useEffect, useState, FormEvent } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useSession } from "@/components/SessionProvider";
import { getTimetableUpdates, createTimetableUpdate } from "@/lib/api";

interface TimetableUpdate {
  id: string;
  title: string;
  body: string;
  department: string | null;
  level: string | null;
  createdAt: string;
  author: { name: string; role: string };
}

/**
 * Timetable updates (spec §2): an executive or class rep pushes a change
 * ("GST 202 moved to 2pm") scoped by department + level. Students in that
 * exact scope see it in their Timetable instantly + get a branded in-app
 * notification. Blank scope = everyone.
 */
export default function TimetablePage() {
  const { status, token, associationId } = useSession();
  const [updates, setUpdates] = useState<TimetableUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [department, setDepartment] = useState("");
  const [level, setLevel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!token || !associationId) return;
    try {
      const data = await getTimetableUpdates(associationId, token);
      setUpdates(data.updates);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token, associationId]);

  useEffect(() => {
    if (status !== "authenticated" || !token || !associationId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getTimetableUpdates(associationId, token);
        if (!cancelled) setUpdates(data.updates);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, token, associationId]);

  async function handlePush(e: FormEvent) {
    e.preventDefault();
    if (!token || !associationId) return;
    setSubmitting(true);
    try {
      await createTimetableUpdate(
        associationId,
        {
          title,
          body,
          department: department.trim() || undefined,
          level: level.trim() || undefined,
        },
        token,
      );
      setMessage(
        "Update pushed — students in scope see it now and got a notification.",
      );
      setTitle("");
      setBody("");
      setDepartment("");
      setLevel("");
      void load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to push update");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardLayout>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Timetable Updates
      </h1>

      {message && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 mb-6 text-sm">
          {message}
          <button onClick={() => setMessage("")} className="ml-2">×</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Push form */}
        <form
          onSubmit={handlePush}
          className="bg-white rounded-xl border border-gray-200 p-6 space-y-4"
        >
          <h2 className="font-semibold text-gray-900">Push a change</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Short title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={140}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
              placeholder="GST 202 moved to 2pm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Details
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              rows={3}
              maxLength={500}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
              placeholder="Moved from the old hall to Lecture Theatre C — same day, 2pm."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Department{" "}
                <span className="text-gray-400 font-normal">(blank = all)</span>
              </label>
              <input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                placeholder="Computer Science"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Level <span className="text-gray-400 font-normal">(blank = all)</span>
              </label>
              <input
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                placeholder="200"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2 bg-purple-700 text-white rounded-lg text-sm font-medium hover:bg-purple-800 disabled:bg-purple-400 transition-colors"
          >
            {submitting ? "Pushing…" : "Push update"}
          </button>
        </form>

        {/* Recent updates */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Recent updates</h2>
          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : updates.length === 0 ? (
            <p className="text-gray-500 text-sm">No updates pushed yet.</p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {updates.map((u) => (
                <div key={u.id} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-gray-800">
                      {u.title}
                    </p>
                    {u.department || u.level ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700">
                        {u.department || "*"} · {u.level || "*"}
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-200 text-gray-600">
                        Everyone
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600">{u.body}</p>
                  <p className="text-[10px] text-gray-400 mt-2">
                    {u.author.name} ({u.author.role}) ·{" "}
                    {new Date(u.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
