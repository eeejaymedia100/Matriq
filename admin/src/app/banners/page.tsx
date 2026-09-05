"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { useSession } from "@/components/SessionProvider";
import {
  listBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  reorderBanners,
} from "@/lib/api";
import type { Banner } from "@/types/api";

interface FormState {
  title: string;
  body: string;
  linkLabel: string;
  linkUrl: string;
  published: boolean;
  startsAt: string; // datetime-local value
  endsAt: string; // datetime-local value
}

const EMPTY_FORM: FormState = {
  title: "",
  body: "",
  linkLabel: "",
  linkUrl: "",
  published: false,
  startsAt: "",
  endsAt: "",
};

/** Convert "2026-09-10T14:30" (datetime-local) → ISO string or null. */
function toIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

const inputCls =
  "w-full bg-surfaceAlt border border-line rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-lime";
const labelCls = "block text-xs font-medium text-muted mb-1";

export default function BannersPage() {
  const router = useRouter();
  const { token } = useSession();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await listBanners(token);
      setBanners(data.banners);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load banners");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    void load();
  }, [router, token, load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  const openEdit = (b: Banner) => {
    setEditing(b);
    setForm({
      title: b.title,
      body: b.body,
      linkLabel: b.linkLabel ?? "",
      linkUrl: b.linkUrl ?? "",
      published: b.published,
      startsAt: toLocalInput(b.startsAt),
      endsAt: toLocalInput(b.endsAt),
    });
    setFormError(null);
  };

  const submit = async () => {
    if (!token || !form.title.trim() || !form.body.trim()) {
      setFormError("Title and body are required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const payload = {
      title: form.title.trim(),
      body: form.body.trim(),
      linkLabel: form.linkLabel.trim() || undefined,
      linkUrl: form.linkUrl.trim() || undefined,
      published: form.published,
      startsAt: toIso(form.startsAt),
      endsAt: toIso(form.endsAt),
    };
    try {
      if (editing) {
        await updateBanner(editing.id, payload, token);
      } else {
        await createBanner(
          { ...payload, sortOrder: banners.length },
          token,
        );
      }
      setForm(EMPTY_FORM);
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (b: Banner) => {
    if (!token) return;
    try {
      await updateBanner(b.id, { published: !b.published }, token);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const remove = async (b: Banner) => {
    if (!token) return;
    if (!window.confirm(`Delete banner “${b.title}”? This can't be undone.`)) {
      return;
    }
    try {
      await deleteBanner(b.id, token);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  /** Swap this banner with the one above/below (dir = -1 up, +1 down). */
  const move = async (index: number, dir: -1 | 1) => {
    if (!token) return;
    const target = index + dir;
    if (target < 0 || target >= banners.length) return;
    const next = banners.map((b, i) => ({
      ...b,
      sortOrder:
        i === index ? banners[target].sortOrder : i === target ? banners[index].sortOrder : b.sortOrder,
    }));
    setBanners(next);
    try {
      const res = await reorderBanners(
        next.map((b) => ({ id: b.id, sortOrder: b.sortOrder })),
        token,
      );
      setBanners(res.banners);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reorder failed");
      await load();
    }
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text">Home Banners</h1>
          <p className="text-sm text-muted mt-1">
            Lightweight announcement strip shown on students' Home screen.
            Published banners appear in sort order, only inside their schedule
            window.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-lime text-ink hover:brightness-110 transition-colors"
        >
          + New banner
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-red-900/40 border border-red-700 rounded-xl p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Create / edit form */}
      {(editing || form.title || form.body || form.startsAt || form.endsAt) && (
        <div className="mb-8 bg-surface rounded-xl border border-line p-6">
          <h2 className="text-lg font-semibold text-text mb-4">
            {editing ? `Edit — ${editing.title}` : "New banner"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Title *</label>
              <input
                className={inputCls}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Exam timetable released"
              />
            </div>
            <div>
              <label className={labelCls}>Body *</label>
              <input
                className={inputCls}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="Short line students see on Home"
              />
            </div>
            <div>
              <label className={labelCls}>Action label (optional)</label>
              <input
                className={inputCls}
                value={form.linkLabel}
                onChange={(e) => setForm({ ...form, linkLabel: e.target.value })}
                placeholder="e.g. View"
              />
            </div>
            <div>
              <label className={labelCls}>Action URL (optional, http(s))</label>
              <input
                className={inputCls}
                value={form.linkUrl}
                onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
                placeholder="https://…"
              />
            </div>
            <div>
              <label className={labelCls}>Starts at (optional)</label>
              <input
                type="datetime-local"
                className={inputCls}
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Ends at (optional)</label>
              <input
                type="datetime-local"
                className={inputCls}
                value={form.endsAt}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
              />
            </div>
          </div>
          <div className="flex items-center gap-6 mt-4">
            <label className="flex items-center gap-2 text-sm text-textSecondary cursor-pointer">
              <input
                type="checkbox"
                checked={form.published}
                onChange={(e) => setForm({ ...form, published: e.target.checked })}
                className="w-4 h-4 accent-lime"
              />
              Published
            </label>
            <div className="flex gap-3 ml-auto">
              <button
                onClick={() => {
                  setEditing(null);
                  setForm(EMPTY_FORM);
                  setFormError(null);
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-surfaceAlt text-textSecondary hover:bg-surfaceAlt transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-lime text-ink hover:brightness-110 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving…" : editing ? "Save changes" : "Create banner"}
              </button>
            </div>
          </div>
          {formError && (
            <p className="mt-3 text-sm text-red-300">{formError}</p>
          )}
        </div>
      )}

      {/* Banner list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 bg-surfaceAlt rounded-xl animate-pulse" />
          ))}
        </div>
      ) : banners.length === 0 ? (
        <div className="text-center py-16 bg-surface rounded-xl border border-line">
          <p className="text-muted">No banners yet — create the first one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {banners.map((b, index) => (
            <div
              key={b.id}
              className="bg-surface rounded-xl border border-line p-4 flex items-start gap-4"
            >
              {/* Reorder */}
              <div className="flex flex-col gap-1 pt-1">
                <button
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  className="w-7 h-7 rounded-lg bg-surfaceAlt text-textSecondary hover:bg-surfaceAlt disabled:opacity-30 text-sm"
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  onClick={() => move(index, 1)}
                  disabled={index === banners.length - 1}
                  className="w-7 h-7 rounded-lg bg-surfaceAlt text-textSecondary hover:bg-surfaceAlt disabled:opacity-30 text-sm"
                  aria-label="Move down"
                >
                  ↓
                </button>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-text">{b.title}</span>
                  {b.live ? (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Live
                    </span>
                  ) : b.published ? (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                      Scheduled
                    </span>
                  ) : (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-surfaceAlt text-textSecondary">
                      Draft
                    </span>
                  )}
                  <span className="text-xs text-muted">order {b.sortOrder}</span>
                </div>
                <p className="text-sm text-muted mt-1">{b.body}</p>
                <p className="text-xs text-muted mt-1">
                  {b.linkLabel && b.linkUrl
                    ? `${b.linkLabel} → ${b.linkUrl}`
                    : "No action"}
                  {" · "}
                  {b.startsAt
                    ? `from ${new Date(b.startsAt).toLocaleString()}`
                    : "no start"}
                  {" · "}
                  {b.endsAt
                    ? `until ${new Date(b.endsAt).toLocaleString()}`
                    : "no end"}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => togglePublish(b)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    b.published
                      ? "bg-surfaceAlt text-textSecondary hover:bg-surfaceAlt"
                      : "bg-green-700 text-text hover:bg-green-600"
                  }`}
                >
                  {b.published ? "Unpublish" : "Publish"}
                </button>
                <button
                  onClick={() => openEdit(b)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surfaceAlt text-textSecondary hover:bg-surfaceAlt transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => remove(b)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-900/50 text-red-200 hover:bg-red-900 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}