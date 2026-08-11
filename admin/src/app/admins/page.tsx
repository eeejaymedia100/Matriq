"use client";

import { useCallback, useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { useSession } from "@/components/SessionProvider";
import {
  listAdmins,
  createAdmin,
  listExecutives,
  grantExecutiveRole,
  searchUsers,
  listAssociations,
} from "@/lib/api";
import type { AdminAccount, AdminExecutive, AdminUser, Association } from "@/types/api";

export default function AdminsPage() {
  const router = useRouter();
  const { token } = useSession();
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [executives, setExecutives] = useState<AdminExecutive[]>([]);
  const [associations, setAssociations] = useState<Association[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Create-admin form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);

  // Grant-role form
  const [userEmail, setUserEmail] = useState("");
  const [foundUser, setFoundUser] = useState<AdminUser | null>(null);
  const [searchingUser, setSearchingUser] = useState(false);
  const [role, setRole] = useState("treasurer");
  const [grantAssocId, setGrantAssocId] = useState("");
  const [granting, setGranting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const [a, e, ass] = await Promise.all([
      listAdmins(token),
      listExecutives(token),
      listAssociations(token),
    ]);
    setAdmins(a.admins);
    setExecutives(e.executives);
    setAssociations(ass.associations);
  }, [token]);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [a, e, ass] = await Promise.all([
          listAdmins(token),
          listExecutives(token),
          listAssociations(token),
        ]);
        if (!cancelled) {
          setAdmins(a.admins);
          setExecutives(e.executives);
          setAssociations(ass.associations);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, token]);

  async function handleCreateAdmin(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setCreating(true);
    setMessage(null);
    try {
      const result = await createAdmin({ email, password }, token);
      setMessage({ type: "ok", text: `Admin created: ${result.email}` });
      setEmail("");
      setPassword("");
      load();
    } catch (err) {
      setMessage({ type: "err", text: err instanceof Error ? err.message : "Failed" });
    } finally {
      setCreating(false);
    }
  }

  async function handleFindUser() {
    if (!token || !userEmail.trim()) return;
    setSearchingUser(true);
    setMessage(null);
    try {
      const data = await searchUsers(token, userEmail.trim());
      const match = data.users.find(
        (u) => u.email.toLowerCase() === userEmail.trim().toLowerCase(),
      );
      if (!match) {
        setFoundUser(null);
        setMessage({ type: "err", text: "No student found with that email" });
      } else {
        setFoundUser(match);
      }
    } catch (err) {
      setMessage({ type: "err", text: err instanceof Error ? err.message : "Search failed" });
    } finally {
      setSearchingUser(false);
    }
  }

  async function handleGrantRole(e: FormEvent) {
    e.preventDefault();
    if (!token || !foundUser || !grantAssocId) return;
    setGranting(true);
    setMessage(null);
    try {
      await grantExecutiveRole(
        { userId: foundUser.id, associationId: grantAssocId, role },
        token,
      );
      setMessage({
        type: "ok",
        text: `${foundUser.fullName} is now ${role} of ${associations.find((a) => a.id === grantAssocId)?.name ?? "association"}`,
      });
      setFoundUser(null);
      setUserEmail("");
      setGrantAssocId("");
      load();
    } catch (err) {
      setMessage({ type: "err", text: err instanceof Error ? err.message : "Failed" });
    } finally {
      setGranting(false);
    }
  }

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-white mb-6">Admins & Roles</h1>

      {message && (
        <div
          className={`rounded-xl px-4 py-3 mb-6 text-sm ${
            message.type === "ok"
              ? "bg-green-900/50 border border-green-700 text-green-300"
              : "bg-red-900/50 border border-red-700 text-red-300"
          }`}
        >
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-2">
            ×
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Create admin */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="font-semibold text-white mb-4">Create admin account</h2>
          <form onSubmit={handleCreateAdmin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 outline-none"
                placeholder="admin2@matriq.app"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Password (min 12 chars)
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={12}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 outline-none"
                placeholder="••••••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {creating ? "Creating..." : "Create Admin"}
            </button>
          </form>

          <h3 className="font-semibold text-gray-200 mt-6 mb-3 text-sm">
            Existing admins
          </h3>
          {admins.length === 0 ? (
            <p className="text-gray-500 text-sm">No admin accounts</p>
          ) : (
            <div className="space-y-2">
              {admins.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between bg-gray-800/50 rounded-lg px-4 py-2.5"
                >
                  <div>
                    <p className="text-sm text-gray-200">{a.email}</p>
                    <p className="text-xs text-gray-500">
                      Joined {new Date(a.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                      a.mfaEnabled
                        ? "bg-green-100 text-green-800"
                        : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {a.mfaEnabled ? "MFA on" : "MFA off"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Grant executive role */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="font-semibold text-white mb-4">
            Grant executive role
          </h2>
          <form onSubmit={handleGrantRole} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Student email
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 outline-none"
                  placeholder="student@matriq.app"
                />
                <button
                  type="button"
                  onClick={handleFindUser}
                  disabled={searchingUser || !userEmail.trim()}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {searchingUser ? "..." : "Find"}
                </button>
              </div>
              {foundUser && (
                <p className="text-xs text-green-400 mt-2">
                  ✓ {foundUser.fullName} · {foundUser.department} · L{foundUser.level}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Association
              </label>
              <select
                value={grantAssocId}
                onChange={(e) => setGrantAssocId(e.target.value)}
                required
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:ring-2 focus:ring-purple-500 outline-none"
              >
                <option value="">Select association…</option>
                {associations.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.shortCode})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Role
              </label>
              <div className="flex gap-2">
                {["president", "treasurer", "pro"].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      role === r
                        ? "bg-purple-600 text-white"
                        : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="submit"
              disabled={granting || !foundUser || !grantAssocId}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {granting ? "Granting..." : "Grant Role"}
            </button>
          </form>
        </div>
      </div>

      {/* Executives roster */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="font-semibold text-white mb-4">
          Executive roster ({executives.length})
        </h2>
        {loading ? (
          <div className="h-16 bg-gray-800 rounded-lg animate-pulse" />
        ) : executives.length === 0 ? (
          <p className="text-gray-500 text-sm">No executives yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-800">
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Association</th>
                  <th className="py-2 pr-4 font-medium">Role</th>
                  <th className="py-2 font-medium">MFA</th>
                </tr>
              </thead>
              <tbody>
                {executives.map((e) => (
                  <tr key={e.id} className="border-b border-gray-800/50">
                    <td className="py-2.5 pr-4 text-gray-200">
                      {e.user?.fullName ?? "—"}
                      <span className="block text-xs text-gray-500">
                        {e.user?.email}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-gray-400">
                      {e.association.name}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                        {e.role}
                      </span>
                    </td>
                    <td className="py-2.5 text-gray-400">
                      {e.mfaEnabled ? "✓" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
