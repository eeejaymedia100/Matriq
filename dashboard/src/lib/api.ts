import type {
  DashboardStats,
  VerificationRequest,
  Announcement,
  Fee,
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

// ── Member roster (spec §2) ──────────────────────────────────────

export async function getMembers(
  associationId: string,
  token: string,
  q?: string,
) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  return fetchApi<{
    members: Array<{
      userId: string;
      membershipStatus: "live" | "pending";
      joinedAt: string;
      verification: "pending" | "approved" | "rejected" | null;
      verifiedAt: string | null;
      user: {
        id: string;
        fullName: string;
        email: string;
        registrationType: string;
        matricNumber: string | null;
        jambNumber: string | null;
        department: string;
        level: string;
      };
    }>;
    total: number;
  }>(`/associations/${associationId}/members${qs}`, { token });
}

// ── Per-fee payment roster (spec §2) ─────────────────────────────

export async function getFeeRoster(
  associationId: string,
  feeId: string,
  token: string,
) {
  return fetchApi<{
    fee: {
      id: string;
      name: string;
      amountKobo: number;
      dueDate: string;
      session: string;
    };
    memberCount: number;
    paidCount: number;
    unpaidCount: number;
    paid: Array<{
      paymentId: string;
      amountKobo: number;
      method: string | null;
      paidAt: string | null;
      user: {
        id: string;
        fullName: string;
        email: string;
        matricNumber: string | null;
        level: string;
        department: string;
      };
    }>;
    unpaid: Array<{
      id: string;
      fullName: string;
      email: string;
      matricNumber: string | null;
      level: string;
      department: string;
    }>;
  }>(`/associations/${associationId}/fees/${feeId}/payments`, { token });
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

// ── Fees (treasurer) ──────────────────────────────────────────────

export async function getFeesOverview(
  associationId: string,
  token: string,
) {
  return fetchApi<{
    association: { id: string; name: string };
    memberCount: number;
    fees: Fee[];
    total: number;
  }>(`/associations/${associationId}/fees/overview`, { token });
}

export async function createFee(
  associationId: string,
  data: {
    name: string;
    amountKobo: number;
    dueDate: string;
    session: string;
  },
  token: string,
) {
  return fetchApi<Fee>(`/associations/${associationId}/fees`, {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export async function updateFee(
  feeId: string,
  data: { name?: string; amountKobo?: number; dueDate?: string; session?: string },
  token: string,
) {
  return fetchApi<Fee>(`/fees/${feeId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(data),
  });
}

// ── Events / QR check-in ──────────────────────────────────────────

export async function createEvent(
  associationId: string,
  data: {
    title: string;
    description: string;
    location: string;
    eventDate: string;
  },
  token: string,
) {
  return fetchApi<{ id: string; title: string }>(
    `/associations/${associationId}/events`,
    {
      method: "POST",
      token,
      body: JSON.stringify(data),
    },
  );
}

export async function getEvents(associationId: string, token: string) {
  return fetchApi<{
    events: Array<{
      id: string;
      title: string;
      description: string;
      location: string;
      eventDate: string;
      rsvpCount: number;
      attendanceCount: number;
    }>;
  }>(`/associations/${associationId}/events`, { token });
}

export async function getCheckinToken(eventId: string, token: string) {
  return fetchApi<{
    token: string;
    expiresInSeconds: number;
    windowStartsAt: string;
  }>(`/events/${eventId}/checkin-token`, { method: "POST", token });
}

export async function getEventAttendance(eventId: string, token: string) {
  return fetchApi<{
    event: { id: string; title: string };
    total: number;
    attendance: Array<{
      id: string;
      checkedInAt: string;
      method: string;
      user: {
        id: string;
        fullName: string;
        email: string;
        department: string;
        level: string;
      };
    }>;
  }>(`/events/${eventId}/attendance`, { token });
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

// ── Timetable updates (spec §2) ──────────────────────────────────

export async function getTimetableUpdates(
  associationId: string,
  token: string,
) {
  return fetchApi<{
    updates: Array<{
      id: string;
      title: string;
      body: string;
      department: string | null;
      level: string | null;
      createdAt: string;
      author: { name: string; role: string };
    }>;
    total: number;
  }>(`/associations/${associationId}/timetable-updates/all`, { token });
}

export async function createTimetableUpdate(
  associationId: string,
  data: { title: string; body: string; department?: string; level?: string },
  token: string,
) {
  return fetchApi<{ id: string; title: string }>(
    `/associations/${associationId}/timetable-updates`,
    {
      method: "POST",
      token,
      body: JSON.stringify(data),
    },
  );
}


