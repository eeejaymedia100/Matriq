import type {
  Association,
  AnalyticsData,
  AuditLogEntry,
  AdminPayment,
  AdminFee,
  AdminVerificationRequest,
  AiDocument,
  AdminVaultItem,
  VaultTextPreview,
  AdminUser,
  AdminExecutive,
  AdminAccount,
  WaitlistEntry,
  WaitlistStats,
  InstitutionCascade,
  Banner,
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
  data: {
    name: string;
    shortCode: string;
    institutionId?: string;
    faculty: string;
    department?: string;
    whatsappNumber: string;
    email?: string;
    password?: string;
  },
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

// ── Institutions (hierarchy for association targeting) ────────────

export async function listInstitutions(token: string) {
  return fetchApi<{ institutions: InstitutionCascade[] }>(
    "/admin/institutions/cascade",
    { token },
  );
}

export async function createInstitution(
  data: { name: string; shortName?: string; type?: string; state?: string },
  token: string,
) {
  return fetchApi<{ id: string; name: string }>("/admin/institutions", {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export async function removeInstitution(id: string, token: string) {
  return fetchApi<{ message: string }>(`/admin/institutions/${id}`, {
    method: "DELETE",
    token,
  });
}

export async function addFaculty(institutionId: string, name: string, token: string) {
  return fetchApi<{ id: string; name: string }>(`/admin/institutions/${institutionId}/faculties`, {
    method: "POST",
    token,
    body: JSON.stringify({ name }),
  });
}

export async function removeFaculty(id: string, token: string) {
  return fetchApi<{ message: string }>(`/admin/faculties/${id}`, {
    method: "DELETE",
    token,
  });
}

export async function addDepartment(facultyId: string, name: string, token: string) {
  return fetchApi<{ id: string; name: string }>(`/admin/faculties/${facultyId}/departments`, {
    method: "POST",
    token,
    body: JSON.stringify({ name }),
  });
}

export async function removeDepartment(id: string, token: string) {
  return fetchApi<{ message: string }>(`/admin/departments/${id}`, {
    method: "DELETE",
    token,
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

export async function listFees(token: string, associationId?: string) {
  const qs = associationId ? `?associationId=${associationId}` : "";
  return fetchApi<{ fees: AdminFee[]; total: number }>(
    `/admin/fees${qs}`,
    { token },
  );
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

// ── Moderation previews (review the actual content) ────────────────

/** Text preview of a vault item (PDF text layer, or OCR for images). */
export async function getVaultItemText(token: string, id: string) {
  return fetchApi<VaultTextPreview>(`/admin/vault-items/${id}/text`, {
    token,
  });
}

/**
 * Fetch a raw file (vault item or verification document) as a Blob with
 * its mime type — used for image previews and original downloads.
 */
async function fetchFileBlob(
  path: string,
  token: string,
): Promise<{ blob: Blob; mimeType: string; fileName: string }> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch file (${res.status})`);
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="?([^";]+)"?/);
  return {
    blob: await res.blob(),
    mimeType: res.headers.get("Content-Type") ?? "application/octet-stream",
    fileName: match?.[1] ?? "file",
  };
}

export function fetchVaultItemFile(token: string, id: string) {
  return fetchFileBlob(`/admin/vault-items/${id}/file`, token);
}

export function fetchVerificationDocument(token: string, id: string) {
  return fetchFileBlob(`/admin/verification-requests/${id}/document`, token);
}

// ── Users ─────────────────────────────────────────────────────────

export async function searchUsers(token: string, q?: string) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  return fetchApi<{ users: AdminUser[]; total: number }>(
    `/admin/users${qs}`,
    { token },
  );
}

/** Cancel a student's scheduled deletion (spec §10 — reversible 6-month policy). */
export async function cancelUserDeletion(userId: string, token: string) {
  return fetchApi<{ message: string }>(`/admin/users/${userId}/cancel-deletion`, {
    method: "POST",
    token,
  });
}

// ── Admin MFA (TOTP, spec §1) ────────────────────────────────────

export async function getMfaStatus(token: string) {
  return fetchApi<{ mfaEnabled: boolean; mfaSecretSet: boolean }>(
    "/admin/auth/mfa-status",
    { token },
  );
}

export async function enrollMfa(token: string) {
  return fetchApi<{ secret: string; qrCodeDataUrl: string; uri: string }>(
    "/admin/auth/mfa/enroll",
    { method: "POST", token },
  );
}

export async function verifyMfaEnrollment(code: string, token: string) {
  return fetchApi<{ message: string }>("/admin/auth/mfa/verify", {
    method: "POST",
    token,
    body: JSON.stringify({ code }),
  });
}

export async function disableMfa(token: string) {
  return fetchApi<{ message: string }>("/admin/auth/mfa/disable", {
    method: "POST",
    token,
  });
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

// ── Home banners (admin-controlled announcement strip) ───────────────

export async function listBanners(token: string) {
  return fetchApi<{ banners: Banner[] }>("/admin/banners", { token });
}

export async function createBanner(
  data: {
    title: string;
    body: string;
    linkLabel?: string;
    linkUrl?: string;
    published?: boolean;
    startsAt?: string | null;
    endsAt?: string | null;
    sortOrder?: number;
  },
  token: string,
) {
  return fetchApi<Banner>("/admin/banners", {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export async function updateBanner(
  id: string,
  data: Partial<{
    title: string;
    body: string;
    linkLabel: string | null;
    linkUrl: string | null;
    published: boolean;
    startsAt: string | null;
    endsAt: string | null;
    sortOrder: number;
  }>,
  token: string,
) {
  return fetchApi<Banner>(`/admin/banners/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(data),
  });
}

export async function deleteBanner(id: string, token: string) {
  return fetchApi<{ ok: boolean }>(`/admin/banners/${id}`, {
    method: "DELETE",
    token,
  });
}

export async function reorderBanners(
  items: Array<{ id: string; sortOrder: number }>,
  token: string,
) {
  return fetchApi<{ banners: Banner[] }>("/admin/banners/reorder", {
    method: "POST",
    token,
    body: JSON.stringify({ items }),
  });
}
