// Shared API types — mirrors backend DTOs

export interface User {
  id: string;
  fullName: string;
  email: string;
  registrationType: "staylite" | "fresher";
  matricNumber: string | null;
  jambNumber: string | null;
  matricStatus: "confirmed" | "provisional" | null;
  faculty: string;
  department: string;
  level: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  /** ISO date string; null until the user completes the post-verification step. */
  dateOfBirth: string | null;
  /** Spec §10: set when the student scheduled account deletion (6 months out). */
  deletionScheduledAt: string | null;
  /**
   * Profile picture. A data-URI renders directly; otherwise it's an API
   * path (e.g. "/me/photo") that needs the auth header — prefix API_BASE.
   * Null = no photo uploaded yet.
   */
  profilePhotoUrl: string | null;
  /**
   * Executive roles held in associations (president / treasurer / pro).
   * Populated by GET /auth/me for accounts with dashboard authority; absent
   * for plain students. Gates the in-app dashboard entry points — a student
   * profile never sees the association or admin consoles.
   */
  executive?: Array<{
    id: string;
    associationId: string;
    role: "president" | "treasurer" | "pro";
    associationName: string;
    shortCode: string;
  }>;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: Pick<User, "id" | "email" | "fullName" | "registrationType">;
}

export interface Association {
  id: string;
  name: string;
  shortCode: string;
  faculty: string;
  whatsappNumber: string;
  status: "active" | "suspended";
  transparency: Record<string, number> | null;
  _count?: { memberships: number };
}

export interface Fee {
  id: string;
  name: string;
  amountKobo: number;
  currency: string;
  dueDate: string;
  session: string;
}

export interface Payment {
  id: string;
  /** The association's own dues amount (what the association collects). */
  amountKobo: number;
  /** Legacy alias — the backend response now names it feeAmountKobo. */
  feeAmountKobo?: number;
  /** ₦150 platform developer fee (development + e-receipt). */
  developerFeeKobo?: number;
  /** feeAmountKobo + developerFeeKobo — what the student is charged. */
  totalAmountKobo?: number;
  status: string;
  internalReference: string;
  method: string | null;
  paidAt: string | null;
  rankAtPayment: number | null;
  createdAt: string;
  checkoutUrl?: string | null;
  fee: Fee;
  receipt?: Receipt | null;
}

export interface Receipt {
  id: string;
  receiptNumber: string;
  qrPayload: string;
  issuedAt: string;
  verifiedAt: string | null;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  author: { name: string; role: string };
  readCount: number;
  readByMe?: boolean;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  location: string;
  eventDate: string;
  createdAt: string;
  rsvpCount: number;
  attendanceCount: number;
  rsvpByMe: boolean;
}

export interface AiConversation {
  id: string;
  queryText: string;
  responseText: string;
  createdAt: string;
}

export interface ReferralInfo {
  shareCode: string;
  totalReferrals: number;
  completedReferrals: number;
  isAmbassador: boolean;
}

export interface VerificationRequest {
  id: string;
  status: "pending" | "approved" | "rejected";
  documentOriginalName: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

export interface ApiError {
  error: { code: string; message: string };
}

/** Real-time class/timetable update pushed by an executive (round-2 QA §2). */
export interface TimetableUpdate {
  id: string;
  title: string;
  body: string;
  /** null → all departments */
  department: string | null;
  /** null → all levels */
  level: string | null;
  createdAt: string;
  author: { name: string; role: string };
}

/** In-app notification feed (round-2 QA §9). */
export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type:
    | "verification"
    | "payment"
    | "dues"
    | "announcement"
    | "broadcast"
    | "vault"
    | "timetable"
    | "update"
    | "general";
  link: string | null;
  read: boolean;
  createdAt: string;
}
