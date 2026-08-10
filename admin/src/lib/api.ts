import type {
  Association,
  AnalyticsData,
  AuditLogEntry,
} from "@/types/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/v1";

async function fetchApi<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...fetchOpts } = options;
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((fetchOpts.headers as Record<string, string>) || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { ...fetchOpts, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: { message?: string } })?.error?.message ||
        `API error: ${res.status}`,
    );
  }
  return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────────────

export async function adminLogin(email: string, password: string) {
  return fetchApi<{ accessToken: string; admin: { id: string; email: string } }>(
    "/admin/auth/login",
    { method: "POST", body: JSON.stringify({ email, password }) },
  );
}

// ── Associations ──────────────────────────────────────────────────

export async function listAssociations(token: string) {
  return fetchApi<{ associations: Association[] }>("/admin/associations", { token });
}

export async function createAssociation(
  data: { name: string; shortCode: string; faculty: string; whatsappNumber: string },
  token: string,
) {
  return fetchApi<Association>("/admin/associations", {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export async function updateAssociationStatus(
  id: string,
  status: "active" | "suspended",
  token: string,
) {
  return fetchApi<{ message: string }>(`/admin/associations/${id}/status`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ status }),
  });
}

// ── Analytics ─────────────────────────────────────────────────────

export async function getAnalytics(token: string) {
  return fetchApi<AnalyticsData>("/admin/analytics", { token });
}

// ── Audit Logs ────────────────────────────────────────────────────

export async function getAuditLogs(token: string) {
  return fetchApi<{ logs: AuditLogEntry[] }>("/admin/audit-logs", { token });
}
