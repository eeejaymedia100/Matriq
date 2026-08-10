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
