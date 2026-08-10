import type {
  DashboardStats,
  VerificationRequest,
  Announcement,
} from "@/types/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/v1";

interface FetchOptions extends RequestInit {
  token?: string;
}

async function fetchApi<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { token, ...fetchOpts } = options;
  const url = `${API_BASE}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((fetchOpts.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

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

// ── Dashboard ─────────────────────────────────────────────────────

export async function getDashboardStats(
  associationId: string,
  token: string,
) {
  return fetchApi<DashboardStats>(
    `/associations/${associationId}/dashboard`,
    { token },
  );
}

export async function getActivityFeed(
  associationId: string,
  token: string,
) {
  return fetchApi<{ activities: unknown[] }>(
    `/associations/${associationId}/activity`,
    { token },
  );
}

// ── Verification ──────────────────────────────────────────────────

export async function getVerificationRequests(
  associationId: string,
  token: string,
  status?: string,
) {
  const qs = status ? `?status=${status}` : "";
  return fetchApi<{ requests: VerificationRequest[] }>(
    `/associations/${associationId}/verification-requests${qs}`,
    { token },
  );
}

export async function getVerificationDocument(
  requestId: string,
  associationId: string,
  token: string,
) {
  return fetchApi<{ mimeType: string; dataUri: string }>(
    `/verification-requests/${requestId}/document?associationId=${associationId}`,
    { token },
  );
}

export async function approveVerification(
  requestId: string,
  associationId: string,
  token: string,
) {
  return fetchApi<{ message: string }>(
    `/verification-requests/${requestId}/approve`,
    {
      method: "POST",
      token,
      body: JSON.stringify({ associationId }),
    },
  );
}

export async function rejectVerification(
  requestId: string,
  associationId: string,
  reason: string,
  token: string,
) {
  return fetchApi<{ message: string }>(
    `/verification-requests/${requestId}/reject`,
    {
      method: "POST",
      token,
      body: JSON.stringify({ associationId, reason }),
    },
  );
}

// ── Announcements ─────────────────────────────────────────────────

export async function getAnnouncements(
  associationId: string,
  token: string,
) {
  return fetchApi<{ announcements: Announcement[] }>(
    `/associations/${associationId}/announcements`,
    { token },
  );
}

export async function createAnnouncement(
  associationId: string,
  data: { title: string; body: string; pinned: boolean },
  token: string,
) {
  return fetchApi<Announcement>(
    `/associations/${associationId}/announcements`,
    {
      method: "POST",
      token,
      body: JSON.stringify(data),
    },
  );
}

// ── Transparency ──────────────────────────────────────────────────

export async function updateTransparency(
  associationId: string,
  data: Record<string, unknown>,
  token: string,
) {
  return fetchApi<{ message: string }>(
    `/associations/${associationId}/transparency`,
    {
      method: "PATCH",
      token,
      body: JSON.stringify(data),
    },
  );
}


