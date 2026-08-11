export interface AdminIdentity {
  id: string;
  email: string;
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

export interface AuditLogEntry {
  id: string;
  actorType: "executive" | "admin";
  actorId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ipAddress: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminPayment {
  id: string;
  amountKobo: number;
  status: string;
  method: string | null;
  internalReference: string;
  paidAt: string | null;
  createdAt: string;
  user: { id: string; fullName: string; email: string };
  fee: {
    id: string;
    name: string;
    session: string;
    association: { id: string; name: string };
  };
}

export interface AdminFee {
  id: string;
  name: string;
  amountKobo: number;
  currency: string;
  dueDate: string;
  session: string;
  association: { id: string; name: string; shortCode: string };
  paymentCount: number;
  paidCount: number;
  collectedKobo: number;
}

export interface AdminVerificationRequest {
  id: string;
  status: "pending" | "approved" | "rejected";
  documentOriginalName: string;
  rejectionReason: string | null;
  createdAt: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    matricNumber: string | null;
    jambNumber: string | null;
    department: string;
    level: string;
    registrationType: string;
  };
  association: { id: string; name: string; shortCode: string };
}

export interface AiDocument {
  id: string;
  sourceType: string;
  courseCode: string | null;
  contentChunk: string;
  moderationStatus: "pending" | "approved" | "rejected";
  createdAt: string;
  association: { id: string; name: string } | null;
  submitter: { id: string; fullName: string; email: string } | null;
}

export interface AdminUser {
  id: string;
  fullName: string;
  email: string;
  registrationType: "staylite" | "fresher";
  matricNumber: string | null;
  jambNumber: string | null;
  matricStatus: string | null;
  faculty: string;
  department: string;
  level: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  createdAt: string;
}

export interface AdminExecutive {
  id: string;
  role: "president" | "treasurer" | "pro";
  mfaEnabled: boolean;
  createdAt: string;
  user: { id: string; fullName: string; email: string } | null;
  association: { id: string; name: string; shortCode: string };
}

export interface AdminAccount {
  id: string;
  email: string;
  mfaEnabled: boolean;
  createdAt: string;
}

export interface WaitlistEntry {
  id: string;
  email: string;
  fullName: string | null;
  source: string;
  status: "pending" | "invited" | "joined";
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface WaitlistStats {
  total: number;
  pending: number;
  invited: number;
  joined: number;
  today: number;
}
