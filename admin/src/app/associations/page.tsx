"use client";

import { useCallback, useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { useSession } from "@/components/SessionProvider";
import {
  listAssociations,
  createAssociation,
  updateAssociationStatus,
} from "@/lib/api";
import type { Association } from "@/types/api";

export default function AdminAssociationsPage() {
  const router = useRouter();
  const { token } = useSession();
  const [associations, setAssociations] = useState<Association[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [faculty, setFaculty] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await listAssociations(token);
      setAssociations(data.associations);
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
        const data = await listAssociations(token);
        setAssociations(data.associations);
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
        { name, shortCode, faculty, whatsappNumber },
        token,
      );
      setMessage("Association created");
      setShowForm(false);
      setName("");
      setShortCode("");
      setFaculty("");
      setWhatsappNumber("");
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
          <div className="h-8 bg-gray-800 rounded w-48 animate-pulse" />
          {[1,2,3,4,5].map(i => (
            <div key={i} className="h-12 bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Associations</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
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
        <form onSubmit={handleCreate} className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:ring-2 focus:ring-purple-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Short Code</label>
              <input value={shortCode} onChange={(e) => setShortCode(e.target.value)} required
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:ring-2 focus:ring-purple-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Faculty</label>
              <input value={faculty} onChange={(e) => setFaculty(e.target.value)} required
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:ring-2 focus:ring-purple-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">WhatsApp</label>
              <input value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} required
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:ring-2 focus:ring-purple-500 outline-none" />
            </div>
          </div>
          <button type="submit" disabled={submitting}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:bg-purple-800 transition-colors">
            {submitting ? "Creating..." : "Create Association"}
          </button>
        </form>
      )}

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Name</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Code</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Status</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Faculty</th>
              <th className="text-right py-3 px-4 text-gray-400 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {associations.map((a) => (
              <tr key={a.id} className="border-b border-gray-800/50">
                <td className="py-3 px-4 text-gray-200">{a.name}</td>
                <td className="py-3 px-4 text-gray-400">{a.shortCode}</td>
                <td className="py-3 px-4">
                  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                    a.status === "active" ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400"
                  }`}>{a.status}</span>
                </td>
                <td className="py-3 px-4 text-gray-400">{a.faculty}</td>
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
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
