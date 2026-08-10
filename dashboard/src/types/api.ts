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
  confirmedMembers: number;
  totalCollected: number;
  totalFeesAmount: number;
  pendingPayments: number;
  successfulPayments: number;
  paymentRate: number;
  topPayers: Array<{
    userId: string;
    userName: string;
    totalPaid: number;
  }>;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  author: { id: string; user: { fullName: string } };
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
