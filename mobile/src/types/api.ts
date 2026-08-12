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
  amountKobo: number;
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
