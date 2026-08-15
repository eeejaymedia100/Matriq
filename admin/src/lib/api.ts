import type {
  Association,
  AnalyticsData,
  AuditLogEntry,
  AdminPayment,
  AdminFee,
  AdminVerificationRequest,
  AiDocument,
  AdminVaultItem,
  AdminUser,
  AdminExecutive,
  AdminAccount,
  WaitlistEntry,
  WaitlistStats,
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

// ── Payments & Fees oversight ─────────────────────────────────────

export async function listPayments(
  token: string,
  opts: { status?: string; associationId?: string } = {},
) {
  const qs = new URLSearchParams();
  if (opts.status) qs.set("status", opts.status);
  if (opts.associationId) qs.set("associationId", opts.associationId);
  const query = qs.toString();
  return fetchApi<{
    payments: AdminPayment[];
    pagination: { cursor: string | null; hasMore: boolean; total: number };
  }>(`/admin/payments${query ? `?${query}` : ""}`, { token });
}

export async function listFees(token: string) {
  return fetchApi<{ fees: AdminFee[]; total: number }>("/admin/fees", {
    token,
  });
}

// ── Global verification queue ─────────────────────────────────────

export async function listVerificationRequests(
  token: string,
  status?: string,
) {
  const qs = status ? `?status=${status}` : "";
  return fetchApi<{ requests: AdminVerificationRequest[]; total: number }>(
    `/admin/verification-requests${qs}`,
    { token },
  );
}

// ── AI document moderation ────────────────────────────────────────

export async function listAiDocuments(token: string, status?: string) {
  const qs = status ? `?status=${status}` : "";
  return fetchApi<{ documents: AiDocument[]; total: number }>(
    `/admin/ai-documents${qs}`,
    { token },
  );
}

export async function moderateAiDocument(
  id: string,
  status: "approved" | "rejected",
  token: string,
) {
  return fetchApi<{ message: string }>(`/admin/ai-documents/${id}/moderate`, {
    method: "POST",
    token,
    body: JSON.stringify({ status }),
  });
}

// ── Vault moderation queue (spec §15) ──────────────────────────────

export async function listVaultItems(token: string, status?: string) {
  const qs = status ? `?status=${status}` : "";
  return fetchApi<{ items: AdminVaultItem[]; total: number }>(
    `/admin/vault-items${qs}`,
    { token },
  );
}

export async function moderateVaultItem(
  id: string,
  status: "approved" | "rejected",
  token: string,
) {
  return fetchApi<{ message: string }>(`/admin/vault-items/${id}/moderate`, {
    method: "POST",
    token,
    body: JSON.stringify({ status }),
  });
}

// ── Users ─────────────────────────────────────────────────────────

export async function searchUsers(token: string, q?: string) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  return fetchApi<{ users: AdminUser[]; total: number }>(
    `/admin/users${qs}`,
    { token },
  );
}

// ── Executives ────────────────────────────────────────────────────

export async function listExecutives(token: string) {
  return fetchApi<{ executives: AdminExecutive[]; total: number }>(
    "/admin/executives",
    { token },
  );
}

export async function grantExecutiveRole(
  data: { userId: string; associationId: string; role: string },
  token: string,
) {
  return fetchApi<{ id: string; role: string }>("/admin/executives", {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

// ── Admins ────────────────────────────────────────────────────────

export async function listAdmins(token: string) {
  return fetchApi<{ admins: AdminAccount[]; total: number }>("/admin/admins", {
    token,
  });
}

export async function createAdmin(
  data: { email: string; password: string },
  token: string,
) {
  return fetchApi<{ message: string; id: string; email: string }>(
    "/admin/admins",
    { method: "POST", token, body: JSON.stringify(data) },
  );
}

// ── Platform-wide broadcasts (spec §1) ─────────────────────────────

export async function createBroadcast(
  data: { title: string; body: string },
  token: string,
) {
  return fetchApi<{ message: string; title: string }>("/admin/broadcasts", {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

// ── Waitlist ───────────────────────────────────────────────────────

export async function listWaitlist(token: string, cursor?: string) {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return fetchApi<{
    entries: WaitlistEntry[];
    pagination: { cursor: string | null; hasMore: boolean };
  }>(`/admin/waitlist${qs}`, { token });
}

export async function getWaitlistStats(token: string) {
  return fetchApi<WaitlistStats>("/admin/waitlist/stats", { token });
}
