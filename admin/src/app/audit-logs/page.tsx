"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { useSession } from "@/components/SessionProvider";
import { getAuditLogs } from "@/lib/api";
import type { AuditLogEntry } from "@/types/api";

export default function AdminAuditLogsPage() {
  const router = useRouter();
  const { token } = useSession();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { router.push("/login"); return; }
    (async () => {
      try {
        const data = await getAuditLogs(token);
        setLogs(data.logs);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [router, token]);

  if (loading) {
    return (
      <AdminLayout>
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="h-12 bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-white mb-6">Audit Logs</h1>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Action</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Actor</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Target</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">IP</th>
              <th className="text-right py-3 px-4 text-gray-400 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-500">
                  No audit logs yet
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="py-3 px-4">
                    <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-purple-900/30 text-purple-400">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-300">
                    {log.actorType} <span className="text-gray-500 text-xs">({log.actorId.slice(0, 8)}...)</span>
                  </td>
                  <td className="py-3 px-4 text-gray-400 text-xs">{log.targetType || "—"}</td>
                  <td className="py-3 px-4 text-gray-500 text-xs font-mono">{log.ipAddress}</td>
                  <td className="py-3 px-4 text-right text-gray-400 text-xs">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
