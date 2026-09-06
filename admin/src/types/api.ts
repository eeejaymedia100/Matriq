export interface AdminIdentity {
  id: string;
  email: string;
}

export interface Association {
  id: string;
  name: string;
  shortCode: string;
  faculty: string;
  department: string | null;
  institutionId: string | null;
  whatsappNumber: string;
  status: "active" | "suspended";
  transparency: Record<string, unknown> | null;
  /** Association dashboard login (custom password set by the admin). */
  hasLogin: boolean;
  loginEmail: string | null;
  memberCount: number;
  feeCount: number;
}

export interface Institution {
  id: string;
  name: string;
  shortName: string | null;
  type: "university" | "polytechnic" | "college_of_education";
  state: string | null;
}

export interface Faculty {
  id: string;
  name: string;
}

export interface Department {
  id: string;
  name: string;
}

export interface InstitutionCascade extends Institution {
  faculties: Array<Faculty & { departments: Department[] }>;
}

export interface AnalyticsData {
  totalStudents: number;
  totalAssociations: number;
  activeAssociations: number;
  totalPayments: number;
  successfulPayments: number;
  totalCollectedKobo: number;
  totalRevenueKobo: number;
  totalRevenue: number;
  associations: Array<{
    id: string;
    name: string;
    shortCode: string;
    status: string;
    memberCount: number;
    totalCollected: number;
  }>;
  associationRevenue: Array<{
    associationId: string;
    name: string;
    totalKobo: number;
  }>;
  topCourses: Array<{
    courseCode: string;
    uploads: number;
    downloads: number;
  }>;
  vaultActivity: {
    totalUploads: number;
    pendingModeration: number;
    contributionsThisWeek: number;
  };
  /** Growth over time (spec §1). */
  signupsLast7Days: number;
  signupsLast30Days: number;
  signupsSeries: Array<{ weekStart: string; count: number }>;
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

export interface VaultTextPreview {
  text: string;
  source: "pdf" | "ocr" | "none";
}

export interface AdminVaultItem {
  id: string;
  courseCode: string;
  title: string;
  type: "past_question" | "material";
  visibility: "public" | "private";
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  hasCompanion: boolean;
  moderationStatus: "pending" | "approved" | "rejected";
  rejectionReason: string | null;
  downloads: number;
  createdAt: string;
  user: { id: string; fullName: string; email: string; matricNumber: string | null; level: string };
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
  /** Spec §10: set while the 6-month deletion window is open. */
  deletionScheduledAt: string | null;
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

export interface Banner {
  id: string;
  title: string;
  body: string;
  linkLabel: string | null;
  linkUrl: string | null;
  published: boolean;
  startsAt: string | null;
  endsAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  /** Computed server-side: published AND inside the schedule window now. */
  live: boolean;
}

// ── Resource Audit Engine (review console) ─────────────────────────

export interface ResourceStudentBrief {
  id: string;
  fullName: string;
  matricNumber: string | null;
  email: string;
  faculty?: string | null;
  department?: string | null;
  level?: string | null;
}

export interface ResourceQueueItem {
  id: string;
  studentId: string;
  source: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  pageCount: number | null;
  courseCode: string;
  level: string | null;
  materialType: string;
  academicSession: string | null;
  submittedAt: string;
  auditStatus: string;
  aiRecommendation: string | null;
  aiConfidence: number | null;
  aiSummary: string | null;
  riskLevel: string | null;
  duplicateOfId: string | null;
  duplicateSimilarity: number | null;
  rewardStatus: string;
  libraryStatus: string;
  student: ResourceStudentBrief;
}

export interface ResourceScoreSet {
  academicRelevance: number;
  readability: number;
  completeness: number;
  metadataMatch: number;
  duplicateProbability: number;
  copyrightRisk: number;
  suspiciousContentRisk: number;
  rewardAbuseRisk: number;
}

export interface ResourceReviewDetail extends ResourceQueueItem {
  human: { decision: string | null; reason: string | null; reviewerId: string | null; reviewedAt: string | null };
  failure: { attempts: number; reason: string | null; lastStageError: string | null };
  student: ResourceStudentBrief;
  validation: {
    verdict: string;
    formatOk: boolean;
    encrypted: boolean;
    pageCount: number | null;
    emptyOrEffectivelyEmpty: boolean;
    checks: Array<{ name: string; verdict: string; detail?: string }>;
  } | null;
  quality: {
    pageCount: number;
    blankPageRatio: number;
    textDensityCharsPerPage: number;
    repeatedPageRatio: number;
    unreadablePageRatio: number;
    suspiciouslyPadded: boolean;
    screenshotHeavy: boolean;
    junkVerdict: string;
  } | null;
  aiAuditReport: {
    documentType?: string;
    detected?: { title?: string | null; courseCode?: string | null; university?: string | null; academicSession?: string | null };
    scores?: ResourceScoreSet;
    contradictions?: string[];
    reasons?: string[];
    riskLevel?: string;
    provider?: string;
    model?: string;
  } | null;
  aiProvider: string | null;
  aiModel: string | null;
  reviewerNotes: string | null;
  documentPreviewUrl: string;
}

export interface ResourceMetrics {
  total: number;
  withAi: number;
  decided: number;
  agreementRate: number | null;
  perRisk: Record<string, { total: number; agree: number; disagree: number; agreementRate: number | null }>;
  perModel: Record<string, { total: number; agree: number; disagree: number; agreementRate: number | null }>;
}

export interface ResourceRewardRow {
  id: string;
  studentId: string;
  campaignId: string;
  tierId: string;
  state: string;
  pointsAtEarn: number;
  payoutRef: string | null;
  payoutMethod: string | null;
  paidAt: string | null;
  note: string | null;
  createdAt: string;
  student: { id: string; fullName: string; email: string };
}

export interface ResourceLeaderboardRow {
  rank: number;
  studentId: string;
  name: string;
  points: number;
}

export interface ResourceCampaignConfig {
  id: string;
  name: string;
  active: boolean;
  pointsPerApproved: number;
  tiers: Array<{ id: string; label: string; threshold: number; kind: string; value: string | null }>;
}
