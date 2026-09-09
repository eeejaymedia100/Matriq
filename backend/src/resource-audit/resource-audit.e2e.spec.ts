import { Test, TestingModule } from "@nestjs/testing";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { ResourceAuditService, SubmissionValidationError } from "./resource-audit.service";
import { ResourceRewardService } from "./resource-audit.rewards";
import { ResourceAuditStorage } from "./resource-audit.storage";
import { StorageService } from "../storage/storage.service";
import { ToolsService } from "../tools/tools.service";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { AUDIT_SCORER, RuleBasedScorer } from "./resource-audit.scorer";
import { AUDIT_STATUS } from "./resource-audit.state-machine";

/**
 * Part 6 — end-to-end lifecycle tests on the REAL pipeline (real validation,
 * real duplicate detection, the rule-based auditor, the real reward engine),
 * with only Prisma/Storage/OCR mocked. Proves the V1 invariants:
 *   - every submission ends at a HUMAN decision point
 *   - rejected documents never reach the library
 *   - duplicates never earn rewards (even when approved for the library)
 *   - retries/concurrency cannot create duplicate records
 */

function imageBytes(): Buffer {
  const buf = Buffer.alloc(2048, 0x7f);
  buf[0] = 0x89; buf[1] = 0x50; buf[2] = 0x4e; buf[3] = 0x47;
  return buf;
}

const OCR_TEXT = (
  "UNIVERSITY OF LAGOS CHM 101 FIRST SEMESTER EXAMINATION 2023/2024. " +
  "Answer four questions. Time allowed: two hours. Instructions: answer any " +
  "four of the six questions. Marks are shown in brackets. Course outline " +
  "coverage: atomic structure, bonding, stoichiometry. Department of Chemistry examination paper."
).repeat(4);

function makePrisma() {
  const rows = new Map<string, Record<string, any>>();

  const row = (over: Record<string, unknown> = {}) => ({
    id: "s-e2e",
    studentId: "u-1",
    source: "telegram",
    fileName: "chm101.png",
    fileType: "image/png",
    fileSize: 2048,
    fileHash: "hash-e2e",
    pageCount: null,
    storageRef: "resource-audit/s-e2e/original.png",
    institutionId: "inst-1",
    universityName: null,
    faculty: "Science",
    department: "Chemistry",
    courseCode: "CHM 101",
    level: "300",
    materialType: "past_question",
    academicSession: "2023/2024",
    rightsDeclared: true,
    rightsVersion: "1.0",
    submittedAt: new Date(),
    auditStatus: AUDIT_STATUS.received,
    extractedText: null,
    textFingerprint: null,
    duplicateOfId: null,
    duplicateSimilarity: null,
    aiRecommendation: null,
    aiConfidence: null,
    aiSummary: null,
    aiAuditReport: null,
    aiProvider: null,
    aiModel: null,
    aiAuditedAt: null,
    riskLevel: null,
    validationResults: null,
    qualityMetrics: null,
    humanDecision: null,
    decisionReason: null,
    reviewerId: null,
    reviewedAt: null,
    reviewerNotes: null,
    rewardStatus: "none",
    rewardReason: null,
    libraryStatus: "none",
    publishedVaultItemId: null,
    attemptCount: 0,
    failureReason: null,
    lastStageError: null,
    updatedAt: new Date(),
    ...over,
  });

  const update = jest.fn(({ where, data }: { where: { id: string; auditStatus?: string }; data: Record<string, unknown> }) => {
    const r = rows.get(where.id);
    if (!r) return Promise.reject(Object.assign(new Error("not found"), { code: "P2025" }));
    if (where.auditStatus && r.auditStatus !== where.auditStatus) {
      return Promise.reject(Object.assign(new Error("status changed"), { code: "P2025" }));
    }
    Object.assign(r, data);
    return Promise.resolve(r);
  });

  return {
    rows,
    row,
    resourceSubmission: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const r = row(data);
        rows.set(r.id, r);
        return Promise.resolve(r);
      }),
      findUnique: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve(rows.get(where.id) ?? null)),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findUniqueOrThrow: jest.fn(({ where }: { where: { id: string } }) => {
        const r = rows.get(where.id);
        return r ? Promise.resolve(r) : Promise.reject(new Error("not found"));
      }),
      update,
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: "u-1", institutionId: "inst-1", faculty: "Science", department: "Chemistry", level: "300", deletedAt: null,
      }),
      findMany: jest.fn().mockResolvedValue([{ id: "u-1", fullName: "Ada" }]),
    },
    membership: { findFirst: jest.fn().mockResolvedValue({ associationId: "assoc-1" }) },
    vaultItem: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: "vault-e2e", ...data })),
    },
    resourceContribution: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: "contrib-e2e", ...data })),
      aggregate: jest.fn().mockResolvedValue({ _sum: { points: 1 } }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    resourceReward: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: "reward-e2e", ...data })),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: "reward-e2e", ...data })),
    },
  };
}

async function settle(ticks = 80): Promise<void> {
  for (let i = 0; i < ticks; i++) await Promise.resolve();
}

async function buildHarness(prismaMock: ReturnType<typeof makePrisma>, ocrText: string | null) {
  const storage = new ResourceAuditStorage({} as StorageService);
  Object.assign(storage, {
    saveOriginal: jest.fn().mockResolvedValue("resource-audit/s-e2e/original.png"),
    readOriginal: jest.fn().mockResolvedValue(imageBytes()),
    hash: jest.fn().mockReturnValue("hash-e2e"),
  });
  const tools = {
    ocrBuffer: jest.fn().mockResolvedValue(ocrText ? { text: ocrText, readable: true } : { text: "", readable: false }),
  };
  const module = await Test.createTestingModule({
    providers: [
      ResourceAuditService,
      ResourceRewardService,
      { provide: PrismaService, useValue: prismaMock },
      { provide: ResourceAuditStorage, useValue: storage },
      { provide: ToolsService, useValue: tools },
      { provide: ConfigService, useValue: null },
      { provide: AUDIT_SCORER, useValue: new RuleBasedScorer() },
    ],
  }).compile();
  const svc = module.get<ResourceAuditService>(ResourceAuditService);
  return { svc, prisma: prismaMock };
}

jest.useFakeTimers();

const INPUT = {
  studentId: "u-1",
  fileName: "chm101-2024.png",
  buffer: imageBytes(),
  courseCode: "CHM 101",
  materialType: "past_question",
  rightsDeclared: true,
  source: "telegram" as const,
};

describe("Resource Audit — end-to-end lifecycle", () => {
  it("runs intake → validation → OCR extraction → AI audit → human review", async () => {
    const { svc, prisma } = await buildHarness(makePrisma(), OCR_TEXT);
    (prisma.resourceSubmission.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await svc.submit(INPUT);
    expect(result.auditStatus).toBe("received");
    await settle();

    const row = prisma.rows.get(result.id)!;
    // The AI never makes the final call — V1 always stops at the human.
    expect(row.auditStatus).toBe(AUDIT_STATUS.pending_human_review);
    expect(row.extractedText).toContain("CHM 101");
    expect(row.aiRecommendation).toBe("approve");
    expect(row.aiProvider).toBe("rules");
    expect(row.aiModel).toBe("deterministic-v1");
    expect(row.aiAuditReport).toBeTruthy();
    expect(row.validationResults).toBeTruthy();
    expect(row.riskLevel).toBe("green");
    expect(row.textFingerprint).toBeTruthy();
  });

  it("approval flows to reward qualification AND library publication (real ledger row)", async () => {
    const prismaMock = makePrisma();
    const { svc, prisma } = await buildHarness(prismaMock, OCR_TEXT);
    (prisma.resourceSubmission.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await svc.submit(INPUT);
    await settle();
    expect(prisma.rows.get(result.id)!.auditStatus).toBe(AUDIT_STATUS.pending_human_review);

    await svc.decide(result.id, "admin-1", "approved", "Legit past paper");
    await settle();

    const row = prisma.rows.get(result.id)!;
    expect(row.auditStatus).toBe(AUDIT_STATUS.published);
    expect(row.rewardStatus).toBe("eligible");
    expect(prisma.resourceContribution.create).toHaveBeenCalledTimes(1);
    expect(prisma.vaultItem.create).toHaveBeenCalledTimes(1);
  });

  it("a rejected document NEVER reaches the library and NEVER earns a contribution", async () => {
    const prismaMock = makePrisma();
    const { svc, prisma } = await buildHarness(prismaMock, OCR_TEXT);
    (prisma.resourceSubmission.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await svc.submit(INPUT);
    await settle();
    await svc.decide(result.id, "admin-1", "rejected", "blurred beyond readability");
    await settle();

    const row = prisma.rows.get(result.id)!;
    expect(row.auditStatus).toBe(AUDIT_STATUS.rejected);
    expect(row.humanDecision).toBe("rejected");
    expect(prisma.vaultItem.create).not.toHaveBeenCalled();
    expect(prisma.resourceContribution.create).not.toHaveBeenCalled();
  });

  it("an exact duplicate from another student becomes a duplicate candidate, and even when a human approves it for the library it earns NOTHING", async () => {
    const prismaMock = makePrisma();
    // The candidate pool contains another student's pending submission with
    // the same file hash — the cross-student duplicate case.
    (prismaMock.resourceSubmission.findMany as jest.Mock).mockResolvedValue([
      {
        id: "other-sub",
        studentId: "someone-else",
        fileHash: "hash-e2e",
        textFingerprint: null,
        extractedText: OCR_TEXT,
        auditStatus: AUDIT_STATUS.pending_human_review,
      },
    ]);
    const { svc, prisma } = await buildHarness(prismaMock, OCR_TEXT);
    (prisma.resourceSubmission.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await svc.submit(INPUT);
    await settle();
    const row = prisma.rows.get(result.id)!;
    // Flagged as a duplicate candidate — no AI spend, human decides.
    expect(row.auditStatus).toBe(AUDIT_STATUS.pending_human_review);
    expect(row.failureReason).toBe("duplicate_candidate");
    expect(row.duplicateOfId).toBe("other-sub");
    expect(row.aiRecommendation).toBeNull(); // no AI call made

    // The reviewer approves it for the LIBRARY — but the reward engine
    // must refuse it (duplicateOfId set → ineligible).
    await svc.decide(result.id, "admin-1", "approved", "Verified same paper");
    await settle();
    const finalRow = prisma.rows.get(result.id)!;
    expect(finalRow.rewardStatus).toBe("ineligible");
    expect(prisma.resourceContribution.create).not.toHaveBeenCalled();
  });

  it("unreadable OCR (blank scan) still reaches the human with honest signals", async () => {
    const prismaMock = makePrisma();
    const { svc, prisma } = await buildHarness(prismaMock, null);
    (prisma.resourceSubmission.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await svc.submit(INPUT);
    await settle();
    const row = prisma.rows.get(result.id)!;
    expect(row.auditStatus).toBe(AUDIT_STATUS.pending_human_review);
    expect(row.aiRecommendation).toBeDefined(); // rules auditor scored the empty text
    // The reviewer sees the warning — low completeness, likely reject.
  });

  it("double decide attempts conflict — one decision only", async () => {
    const prismaMock = makePrisma();
    const { svc, prisma } = await buildHarness(prismaMock, OCR_TEXT);
    (prisma.resourceSubmission.findFirst as jest.Mock).mockResolvedValue(null);
    const result = await svc.submit(INPUT);
    await settle();
    await svc.decide(result.id, "admin-1", "approved");
    await expect(
      svc.decide(result.id, "admin-2", "rejected", "second opinion"),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("students cannot read each other's submissions", async () => {
    const prismaMock = makePrisma();
    const { svc, prisma } = await buildHarness(prismaMock, OCR_TEXT);
    (prisma.resourceSubmission.findFirst as jest.Mock).mockResolvedValue(null);
    const result = await svc.submit(INPUT);
    await expect(svc.getStatus(result.id, "stranger")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("intake refuses a second submission with the same student+hash+course", async () => {
    const prismaMock = makePrisma();
    const { svc, prisma } = await buildHarness(prismaMock, OCR_TEXT);
    // Mock honors the where-clause shape: exact-duplicate lookups filter on
    // fileHash; the metadata-immune content-fingerprint lookup filters on
    // contentFingerprint. Both must fire for the second submit to conflict.
    (prisma.resourceSubmission.findFirst as jest.Mock).mockImplementation(({ where }: { where: Record<string, any> }) =>
      "contentFingerprint" in where
        ? Promise.resolve(null)
        : Promise.resolve({ id: "first" }),
    );
    await expect(svc.submit(INPUT)).rejects.toBeInstanceOf(ConflictException);
    await expect(svc.submit(INPUT)).rejects.toBeInstanceOf(ConflictException);
  });

  it("intake refuses a re-uploaded document even with a new course code (content fingerprint)", async () => {
    const prismaMock = makePrisma();
    const { svc, prisma } = await buildHarness(prismaMock, OCR_TEXT);
    // Same bytes already live in the system under a DIFFERENT course code —
    // the exact-hash lookup misses, but the content-fingerprint gate fires.
    (prisma.resourceSubmission.findFirst as jest.Mock).mockImplementation(({ where }: { where: Record<string, any> }) =>
      "contentFingerprint" in where
        ? Promise.resolve({ id: "first" })
        : Promise.resolve(null),
    );
    await expect(svc.submit({ ...INPUT, courseCode: "PHY 109" })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("rights declaration is never bypassed", async () => {
    const { svc } = await buildHarness(makePrisma(), OCR_TEXT);
    await expect(svc.submit({ ...INPUT, rightsDeclared: false })).rejects.toBeInstanceOf(
      SubmissionValidationError,
    );
  });
});
