// Shared API types — mirrors mobile/src/types/api.ts

/** Executive role returned by /me (enriched with association names). */
export interface ExecutiveProfile {
  id: string;
  associationId: string;
  role: "president" | "treasurer" | "pro";
  associationName: string;
  shortCode: string;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  registrationType: "staylite" | "fresher";
  matricNumber: string | null;
  jambNumber: string | null;
  matricStatus: "confirmed" | "provisional";
  faculty: string;
  department: string;
  level: string;
}

export interface Association {
  id: string;
  name: string;
  shortCode: string;
  faculty: string;
  whatsappNumber: string;
  status: "active" | "suspended";
  transparency: Record<string, unknown> | null;
}

export interface VerificationRequest {
  id: string;
  userId: string;
  status: "pending" | "approved" | "rejected";
  documentOriginalName: string;
  documentMimeType: string;
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    registrationType: string;
    matricNumber: string | null;
    jambNumber: string | null;
    faculty: string;
    department: string;
    level: string;
  };
}

export interface DashboardStats {
  totalMembers: number;
  /** Members with an approved verification request (distinct users). */
  confirmedMembers: number;
  totalFees: number;
  /** Money in kobo (minor units). */
  totalCollectedKobo: number;
  paymentRate: number;
  /** Payments still outstanding (pending or processing). */
  pendingPayments: number;
  successfulPayments: number;
  topPayers: Array<{
    // null after account hard-delete (payments are anonymised)
    userId: string | null;
    name: string;
    totalPaidKobo: number;
    rank: number;
  }>;
  recentActivity: Array<{
    userId: string | null;
    name: string;
    feeName: string;
    amountKobo: number;
    status: string;
    paidAt: string | null;
  }>;
  transparency: unknown;
}

export interface Fee {
  id: string;
  name: string;
  amountKobo: number;
  currency: string;
  dueDate: string;
  session: string;
  expectedKobo: number;
  paidCount: number;
  collectedKobo: number;
  paymentCount: number;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  author: { name: string; role: string };
  readCount: number;
  readByMe: boolean;
}

export interface AuditLogEntry {
  id: string;
  actorType: "executive" | "admin";
  action: string;
  targetType: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AnalyticsData {
  totalAssociations: number;
  activeAssociations: number;
  totalStudents: number;
  totalRevenue: number;
  associations: Array<{
    id: string;
    name: string;
    shortCode: string;
    status: string;
    memberCount: number;
    totalCollected: number;
  }>;
}
