"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { useSession } from "@/components/SessionProvider";
import {
  listInstitutions,
  createInstitution,
  removeInstitution,
  addFaculty,
  removeFaculty,
  addDepartment,
  removeDepartment,
} from "@/lib/api";
import type { InstitutionCascade } from "@/types/api";

const TYPE_LABELS: Record<string, string> = {
  university: "University",
  polytechnic: "Polytechnic",
  college_of_education: "College of Education",
};

export default function InstitutionsPage() {
  const router = useRouter();
  const { token } = useSession();
  const [institutions, setInstitutions] = useState<InstitutionCascade[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newShortName, setNewShortName] = useState("");
  const [newType, setNewType] = useState("university");
  const [newState, setNewState] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Per-row inline editors: expanded institution / faculty / department name.
  const [expanded, setExpanded] = useState<string | null>(null);
  const [facultyName, setFacultyName] = useState("");
  const [deptName, setDeptName] = useState("");
  const [facultyFor, setFacultyFor] = useState<string | null>(null);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await listInstitutions(token);
      setInstitutions(data.institutions);
    } catch (err) {
      console.error(err);
      setMessage(err instanceof Error ? err.message : "Failed to load institutions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleAddInstitution(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    try {
      await createInstitution(
        { name: newName, shortName: newShortName || undefined, type: newType, state: newState || undefined },
        token,
      );
      setMessage(`Added ${newName}`);
      setNewName("");
      setNewShortName("");
      setNewType("university");
      setNewState("");
      setShowAdd(false);
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddFaculty(institutionId: string) {
    if (!token || !facultyName.trim()) return;
    try {
      await addFaculty(institutionId, facultyName.trim(), token);
      setFacultyName("");
      setFacultyFor(null);
      setMessage("Faculty added");
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed");
    }
  }

  async function handleAddDepartment(facultyId: string) {
    if (!token || !deptName.trim()) return;
    try {
      await addDepartment(facultyId, deptName.trim(), token);
      setDeptName("");
      setMessage("Department added");
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed");
    }
  }

  async function handleRemoveInstitution(i: InstitutionCascade) {
    if (!token) return;
    if (!confirm(`Remove ${i.name} and all its faculties/departments?`)) return;
    try {
      await removeInstitution(i.id, token);
      setMessage(`Removed ${i.name}`);
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed");
    }
  }

  async function handleRemoveFaculty(id: string, name: string) {
    if (!token) return;
    if (!confirm(`Remove faculty "${name}"?`)) return;
    try {
      await removeFaculty(id, token);
      setMessage(`Removed ${name}`);
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed");
    }
  }

  async function handleRemoveDepartment(id: string, name: string) {
    if (!token) return;
    if (!confirm(`Remove department "${name}"?`)) return;
    try {
      await removeDepartment(id, token);
      setMessage(`Removed ${name}`);
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed");
    }
  }

  if (!token) return null;

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text">Institutions</h1>
          <p className="text-sm text-muted mt-1">
            Nigerian institutions, faculties and departments used for association targeting and registration dropdowns.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-4 py-2 bg-lime text-ink rounded-lg text-sm font-semibold hover:brightness-110 transition-colors"
        >
          {showAdd ? "Cancel" : "Add Institution"}
        </button>
      </div>

      {message && (
        <div className="bg-green-900/50 border border-green-700 text-green-300 rounded-xl px-4 py-3 mb-6 text-sm">
          {message}
          <button onClick={() => setMessage("")} className="ml-2">×</button>
        </div>
      )}

      {showAdd && (
        <form onSubmit={handleAddInstitution} className="bg-surface rounded-xl border border-line p-6 mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-textSecondary mb-1">Full name</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} required placeholder="e.g. University of Lagos"
                className="w-full px-4 py-2 bg-surfaceAlt border border-line rounded-lg text-sm text-text focus:border-lime outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-textSecondary mb-1">Short name</label>
              <input value={newShortName} onChange={(e) => setNewShortName(e.target.value)} placeholder="e.g. UNILAG"
                className="w-full px-4 py-2 bg-surfaceAlt border border-line rounded-lg text-sm text-text focus:border-lime outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-textSecondary mb-1">Type</label>
              <select value={newType} onChange={(e) => setNewType(e.target.value)}
                className="w-full px-4 py-2 bg-surfaceAlt border border-line rounded-lg text-sm text-text focus:border-lime outline-none">
                <option value="university">University</option>
                <option value="polytechnic">Polytechnic</option>
                <option value="college_of_education">College of Education</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-textSecondary mb-1">State</label>
              <input value={newState} onChange={(e) => setNewState(e.target.value)} placeholder="e.g. Lagos"
                className="w-full px-4 py-2 bg-surfaceAlt border border-line rounded-lg text-sm text-text focus:border-lime outline-none" />
            </div>
          </div>
          <button type="submit" disabled={submitting}
            className="px-6 py-2 bg-lime text-ink rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-40 transition-colors">
            {submitting ? "Adding..." : "Add Institution"}
          </button>
        </form>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-12 bg-surfaceAlt rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {institutions.map((inst) => (
            <div key={inst.id} className="bg-surface rounded-xl border border-line overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4">
                <div className="min-w-0">
                  <p className="text-text font-semibold truncate">
                    {inst.name}
                    {inst.shortName ? <span className="ml-2 text-muted text-sm font-normal">({inst.shortName})</span> : null}
                  </p>
                  <p className="text-xs text-muted mt-0.5">
                    {TYPE_LABELS[inst.type] ?? inst.type}
                    {inst.state ? ` · ${inst.state}` : ""} · {inst.faculties.length} faculties ·{" "}
                    {inst.faculties.reduce((s, f) => s + f.departments.length, 0)} departments
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => {
                      setExpanded(expanded === inst.id ? null : inst.id);
                      setFacultyFor(null);
                    }}
                    className="px-3 py-1.5 text-xs bg-surfaceAlt hover:bg-surfaceAlt text-text rounded-lg border border-line transition-colors"
                  >
                    {expanded === inst.id ? "Collapse" : "Manage faculties"}
                  </button>
                  <button
                    onClick={() => handleRemoveInstitution(inst)}
                    className="px-3 py-1.5 text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>

              {expanded === inst.id && (
                <div className="border-t border-line px-5 py-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      value={facultyName}
                      onChange={(e) => setFacultyName(e.target.value)}
                      placeholder="New faculty name (e.g. Science)"
                      className="flex-1 px-3 py-2 bg-surfaceAlt border border-line rounded-lg text-sm text-text focus:border-lime outline-none"
                    />
                    <button
                      onClick={() => handleAddFaculty(inst.id)}
                      disabled={!facultyName.trim()}
                      className="px-3 py-2 text-sm bg-lime hover:brightness-110 text-ink disabled:opacity-40 text-text rounded-lg transition-colors"
                    >
                      Add faculty
                    </button>
                  </div>

                  {inst.faculties.map((f) => (
                    <div key={f.id} className="rounded-lg border border-line bg-void/50">
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <p className="text-sm text-text font-medium">{f.name}</p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setFacultyFor(facultyFor === f.id ? null : f.id);
                              setDeptName("");
                            }}
                            className="px-2.5 py-1 text-xs bg-surfaceAlt hover:bg-surfaceAlt text-textSecondary rounded border border-line transition-colors"
                          >
                            {facultyFor === f.id ? "Done" : `Departments (${f.departments.length})`}
                          </button>
                          <button
                            onClick={() => handleRemoveFaculty(f.id, f.name)}
                            className="px-2.5 py-1 text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      {facultyFor === f.id && (
                        <div className="px-4 pb-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              value={deptName}
                              onChange={(e) => setDeptName(e.target.value)}
                              placeholder="New department name"
                              className="flex-1 px-3 py-1.5 bg-surfaceAlt border border-line rounded-lg text-sm text-text focus:border-lime outline-none"
                            />
                            <button
                              onClick={() => handleAddDepartment(f.id)}
                              disabled={!deptName.trim()}
                              className="px-3 py-1.5 text-xs bg-lime hover:brightness-110 text-ink disabled:opacity-40 text-text rounded-lg transition-colors"
                            >
                              Add
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {f.departments.map((d) => (
                              <span key={d.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surfaceAlt border border-line text-xs text-textSecondary">
                                {d.name}
                                <button
                                  onClick={() => handleRemoveDepartment(d.id, d.name)}
                                  className="text-muted hover:text-red-400 transition-colors"
                                  title="Remove department"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                            {f.departments.length === 0 && (
                              <span className="text-xs text-muted">No departments yet.</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
