"use client";

import { useCallback, useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { useSession } from "@/components/SessionProvider";
import {
  listAssociations,
  createAssociation,
  updateAssociationStatus,
  listInstitutions,
} from "@/lib/api";
import type { Association, InstitutionCascade } from "@/types/api";

export default function AdminAssociationsPage() {
  const router = useRouter();
  const { token } = useSession();
  const [associations, setAssociations] = useState<Association[]>([]);
  const [institutions, setInstitutions] = useState<InstitutionCascade[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [institutionId, setInstitutionId] = useState("");
  const [faculty, setFaculty] = useState("");
  const [department, setDepartment] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const selectedInstitution = institutions.find((i) => i.id === institutionId);
  const selectedFaculty = selectedInstitution?.faculties.find(
    (f) => f.name === faculty,
  );

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [a, i] = await Promise.all([
        listAssociations(token),
        listInstitutions(token),
      ]);
      setAssociations(a.associations);
      setInstitutions(i.institutions);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    (async () => {
      try {
        const [a, i] = await Promise.all([
          listAssociations(token),
          listInstitutions(token),
        ]);
        setAssociations(a.associations);
        setInstitutions(i.institutions);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [router, token]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    try {
      await createAssociation(
        {
          name,
          shortCode,
          institutionId: institutionId || undefined,
          faculty,
          department: department || undefined,
          whatsappNumber,
          email: loginEmail || undefined,
          password: loginPassword || undefined,
        },
        token,
      );
      setMessage("Association created");
      setShowForm(false);
      setName("");
      setShortCode("");
      setInstitutionId("");
      setFaculty("");
      setDepartment("");
      setWhatsappNumber("");
      setLoginEmail("");
      setLoginPassword("");
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(a: Association) {
    if (!token) return;
    const newStatus = a.status === "active" ? "suspended" : "active";
    try {
      await updateAssociationStatus(a.id, newStatus as "active" | "suspended", token);
      setMessage(`${a.name} ${newStatus === "active" ? "reactivated" : "suspended"}`);
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed");
    }
  }

  if (!token) return null;

  if (loading) {
    return (
      <AdminLayout>
        <div className="space-y-3">
          <div className="h-8 bg-surfaceAlt rounded w-48 animate-pulse" />
          {[1,2,3,4,5].map(i => (
            <div key={i} className="h-12 bg-surfaceAlt rounded-lg animate-pulse" />
          ))}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-text">Associations</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-lime text-ink rounded-lg text-sm font-semibold hover:brightness-110 transition-colors"
        >
          {showForm ? "Cancel" : "New Association"}
        </button>
      </div>

      {message && (
        <div className="bg-green-900/50 border border-green-700 text-green-300 rounded-xl px-4 py-3 mb-6 text-sm">
          {message}
          <button onClick={() => setMessage("")} className="ml-2">×</button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-surface rounded-xl border border-line p-6 mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-textSecondary mb-1">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required
                className="w-full px-4 py-2 bg-surfaceAlt border border-line rounded-lg text-sm text-text focus:border-lime outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-textSecondary mb-1">Short Code</label>
              <input value={shortCode} onChange={(e) => setShortCode(e.target.value)} required
                className="w-full px-4 py-2 bg-surfaceAlt border border-line rounded-lg text-sm text-text focus:border-lime outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-textSecondary mb-1">
                Institution <span className="text-muted">(optional)</span>
              </label>
              <select
                value={institutionId}
                onChange={(e) => {
                  setInstitutionId(e.target.value);
                  setFaculty("");
                  setDepartment("");
                }}
                className="w-full px-4 py-2 bg-surfaceAlt border border-line rounded-lg text-sm text-text focus:border-lime outline-none"
              >
                <option value="">Any institution (platform-wide)</option>
                {institutions.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.shortName ?? i.type})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-textSecondary mb-1">
                Faculty <span className="text-muted">{institutionId ? "(from selected institution)" : "(free text)"}</span>
              </label>
              {institutionId ? (
                <select
                  value={faculty}
                  onChange={(e) => {
                    setFaculty(e.target.value);
                    setDepartment("");
                  }}
                  required
                  className="w-full px-4 py-2 bg-surfaceAlt border border-line rounded-lg text-sm text-text focus:border-lime outline-none"
                >
                  <option value="">Select a faculty</option>
                  {selectedInstitution?.faculties.map((f) => (
                    <option key={f.id} value={f.name}>{f.name}</option>
                  ))}
                </select>
              ) : (
                <input value={faculty} onChange={(e) => setFaculty(e.target.value)} required
                  className="w-full px-4 py-2 bg-surfaceAlt border border-line rounded-lg text-sm text-text focus:border-lime outline-none" />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-textSecondary mb-1">
                Department <span className="text-muted">(optional — blank = faculty-wide)</span>
              </label>
              {faculty && selectedFaculty ? (
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full px-4 py-2 bg-surfaceAlt border border-line rounded-lg text-sm text-text focus:border-lime outline-none"
                >
                  <option value="">Entire faculty</option>
                  {selectedFaculty.departments.map((d) => (
                    <option key={d.id} value={d.name}>{d.name}</option>
                  ))}
                </select>
              ) : (
                <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Optional"
                  className="w-full px-4 py-2 bg-surfaceAlt border border-line rounded-lg text-sm text-text focus:border-lime outline-none" />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-textSecondary mb-1">WhatsApp</label>
              <input value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} required
                className="w-full px-4 py-2 bg-surfaceAlt border border-line rounded-lg text-sm text-text focus:border-lime outline-none" />
            </div>
          </div>

          <div className="border-t border-line pt-4">
            <p className="text-sm font-medium text-textSecondary mb-1">
              Association dashboard login <span className="text-muted">(optional)</span>
            </p>
            <p className="text-xs text-muted mb-3">
              Set a custom email + password and the association can sign into its own dashboard. Leave blank to manage it via executive roles only.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-textSecondary mb-1">Login email</label>
                <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="naas@matriq.app"
                  className="w-full px-4 py-2 bg-surfaceAlt border border-line rounded-lg text-sm text-text focus:border-lime outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-textSecondary mb-1">Password</label>
                <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="w-full px-4 py-2 bg-surfaceAlt border border-line rounded-lg text-sm text-text focus:border-lime outline-none" />
              </div>
            </div>
          </div>

          {institutionId && (
            <p className="text-xs text-muted">
              Students registered at {selectedInstitution?.name} in {faculty || "…"}
              {department ? ` / ${department}` : ""} will be auto-added as members and notified that they can now pay dues.
            </p>
          )}

          <button type="submit" disabled={submitting}
            className="px-6 py-2 bg-lime text-ink rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-40 transition-colors">
            {submitting ? "Creating..." : "Create Association"}
          </button>
        </form>
      )}

      <div className="bg-surface rounded-xl border border-line overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="text-left py-3 px-4 text-muted font-medium">Name</th>
              <th className="text-left py-3 px-4 text-muted font-medium">Code</th>
              <th className="text-left py-3 px-4 text-muted font-medium">Status</th>
              <th className="text-left py-3 px-4 text-muted font-medium">Target</th>
              <th className="text-left py-3 px-4 text-muted font-medium">Login</th>
              <th className="text-right py-3 px-4 text-muted font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {associations.map((a) => {
              const inst = institutions.find((i) => i.id === a.institutionId);
              return (
                <tr key={a.id} className="border-b border-line/50">
                  <td className="py-3 px-4 text-text">{a.name}</td>
                  <td className="py-3 px-4 text-muted">{a.shortCode}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                      a.status === "active" ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400"
                    }`}>{a.status}</span>
                  </td>
                  <td className="py-3 px-4 text-muted">
                    {inst ? (
                      <span className="block text-xs">
                        <span className="text-textSecondary">{inst.name}</span>
                        <span className="text-muted"> · {a.faculty}{a.department ? ` / ${a.department}` : ""}</span>
                      </span>
                    ) : (
                      <span className="text-muted">{a.faculty}{a.department ? ` / ${a.department}` : ""}</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {a.hasLogin ? (
                      <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-limeSoft text-lime" title={a.loginEmail ?? undefined}>
                        Enabled
                      </span>
                    ) : (
                      <span className="text-muted text-xs">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => handleToggleStatus(a)}
                      className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                        a.status === "active"
                          ? "bg-red-900/30 text-red-400 hover:bg-red-900/50"
                          : "bg-green-900/30 text-green-400 hover:bg-green-900/50"
                      }`}
                    >
                      {a.status === "active" ? "Suspend" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
