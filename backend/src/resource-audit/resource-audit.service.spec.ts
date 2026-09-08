import { Test, TestingModule } from "@nestjs/testing";
import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { ResourceAuditService, SubmissionValidationError } from "./resource-audit.service";
import { ResourceAuditStorage } from "./resource-audit.storage";
import { StorageService } from "../storage/storage.service";
import { ToolsService } from "../tools/tools.service";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { AUDIT_SCORER, RuleBasedScorer } from "./resource-audit.scorer";
import { ResourceRewardService } from "./resource-audit.rewards";
import {
  AUDIT_STATUS,
  canTransition,
  assertTransition,
  isTerminal,
  isRetryable,
  InvalidTransitionError,
} from "./resource-audit.state-machine";

/** PDF magic bytes — passes sniffing without a real document. */
function pdfBytes(size = 4096): Buffer {
  const buf = Buffer.alloc(size, 0x20);
  buf.write("%PDF-1.4", 0, "ascii");
  return buf;
}

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "s-1",
    studentId: "u-1",
    source: "app",
    fileName: "chm101.pdf",
    fileType: "application/pdf",
    fileSize: 4096,
    fileHash: "hash-1",
    pageCount: null,
    storageRef: "resource-audit/s-1/original-chm101.pdf",
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
    submittedAt: new Date("2026-09-09T00:00:00Z"),
    auditStatus: AUDIT_STATUS.received,
    extractedText: null,
    aiRecommendation: null,
    aiConfidence: null,
    aiSummary: null,
    aiAuditedAt: null,
    humanDecision: null,
    decisionReason: null,
    reviewerId: null,
    reviewedAt: null,
    rewardStatus: "none",
    rewardReason: null,
    libraryStatus: "none",
    publishedVaultItemId: null,
    attemptCount: 0,
    failureReason: null,
    lastStageError: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

function makePrisma(initial?: ReturnType<typeof baseRow>) {
  const rows = new Map<string, ReturnType<typeof baseRow>>();
  if (initial) rows.set(initial.id, initial);

  const update = jest.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const row = rows.get(where.id);
    if (!row) throw Object.assign(new Error("Record not found"), { code: "P2025" });
    // Honor the compound where (auditStatus guard) — the concurrency gate.
    const guard = (where as { auditStatus?: string }).auditStatus;
    if (guard && row.auditStatus !== guard) {
      throw Object.assign(new Error("Record not found"), { code: "P2025" });
    }
    Object.assign(row, data);
    return Promise.resolve(row);
  });

  return {
    rows,
    resourceSubmission: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const row = baseRow(data as Record<string, unknown>);
        rows.set(row.id, row);
        return Promise.resolve(row);
      }),
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(rows.get(where.id) ?? null),
      ),
      findUniqueOrThrow: jest.fn(({ where }: { where: { id: string } }) => {
        const row = rows.get(where.id);
        if (!row) return Promise.reject(new Error("not found"));
        return Promise.resolve(row);
      }),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update,
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: "u-1",
        institutionId: "inst-1",
        faculty: "Science",
        department: "Chemistry",
        level: "300",
        deletedAt: null,
      }),
    },
    membership: {
      findFirst: jest.fn().mockResolvedValue({ associationId: "assoc-1" }),
    },
    vaultItem: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: "vault-1", ...data }),
      ),
    },
    resourceContribution: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: "contrib-1", ...data }),
      ),
      aggregate: jest.fn().mockResolvedValue({ _sum: { points: 1 } }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    resourceReward: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: "reward-1", ...data }),
      ),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: "reward-1", ...data }),
      ),
    },
  };
}

/**
 * Flush pending microtasks: the pipeline and afterApproval run detached
 * (void fire-and-forget), so tests must yield several turns before
 * asserting on the resulting row state.
 */
async function settle(ticks = 60): Promise<void> {
  for (let i = 0; i < ticks; i++) await Promise.resolve();
}

function build(prismaMock: ReturnType<typeof makePrisma>, scorer = new RuleBasedScorer()) {
  const storage = new ResourceAuditStorage({} as StorageService); // methods overridden below
  Object.assign(storage, {
    saveOriginal: jest.fn().mockResolvedValue("resource-audit/x/original.pdf"),
    readOriginal: jest.fn().mockResolvedValue(pdfBytes()),
    hash: jest.fn().mockReturnValue("hash-1"),
  });

  const tools = { ocrBuffer: jest.fn().mockResolvedValue({ text: "", readable: false }) };

  return Test.createTestingModule({
    providers: [
      ResourceAuditService,
      ResourceRewardService,
      { provide: PrismaService, useValue: prismaMock },
      { provide: ResourceAuditStorage, useValue: storage },
      { provide: ToolsService, useValue: tools },
      { provide: ConfigService, useValue: null }, // loadResourceAuditConfig falls back to defaults
      { provide: AUDIT_SCORER, useValue: scorer },
    ],
  }).compile();
}

async function buildSvc(prismaMock = makePrisma(), scorer = new RuleBasedScorer()) {
  const module = await build(prismaMock, scorer);
  const svc = module.get<ResourceAuditService>(ResourceAuditService);
  return { svc, prisma: prismaMock };
}

const VALID_INPUT = {
  studentId: "u-1",
  fileName: "chm101-2024.pdf",
  buffer: pdfBytes(),
  courseCode: "chm 101",
  materialType: "past_question",
  level: "300",
  academicSession: "2023/2024",
  rightsDeclared: true,
};

// Suppress the retry setTimeout across tests (keeps Jest from hanging).
jest.useFakeTimers();

describe("ResourceAuditService — submission creation", () => {
  it("creates a submission, preserves the original, and starts the pipeline from received", async () => {
    const { svc, prisma } = await buildSvc();
    (prisma.resourceSubmission.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await svc.submit(VALID_INPUT);

    expect(result.courseCode).toBe("CHM 101"); // normalized
    expect(result.auditStatus).toBe("received");
    expect(result.rightsDeclared).toBe(true);
    // Original persisted once, under the final submission key (no temp objects).
    expect(prisma.resourceSubmission.create).toHaveBeenCalledTimes(1);
    const storedRow = prisma.rows.get(result.id)!;
    expect(storedRow.fileType).toBe("application/pdf"); // magic-byte detected
    expect(storedRow.fileHash).toBe("hash-1");
  });

  it("rejects a missing rights declaration", async () => {
    const { svc } = await buildSvc();
    await expect(
      svc.submit({ ...VALID_INPUT, rightsDeclared: false }),
    ).rejects.toBeInstanceOf(SubmissionValidationError);
  });

  it("rejects a malformed course code", async () => {
    const { svc } = await buildSvc();
    await expect(
      svc.submit({ ...VALID_INPUT, courseCode: "not a course!!" }),
    ).rejects.toBeInstanceOf(SubmissionValidationError);
  });

  it("accepts every real-world course-code shape (spaced, unspaced, D/-prefixed)", async () => {
    const { svc, prisma } = await buildSvc();
    (prisma.resourceSubmission.findFirst as jest.Mock).mockResolvedValue(null);

    // The campaign's actual failures: department-prefixed codes and
    // missing spaces. None of these may bounce.
    for (const courseCode of ["D/AGE 217", "D/AGE217", "AGE217", "D/ANS 318", "CHM 101", "CHM101"]) {
      (prisma.resourceSubmission.create as jest.Mock).mockClear();
      const result = await svc.submit({ ...VALID_INPUT, courseCode });
      expect(result.courseCode).toBe(courseCode.toUpperCase().replace(/\s+/g, " "));
    }
  });

  it("rejects unsupported extensions and empty files", async () => {
    const { svc } = await buildSvc();
    await expect(
      svc.submit({ ...VALID_INPUT, fileName: "notes.exe" }),
    ).rejects.toBeInstanceOf(SubmissionValidationError);
    await expect(
      svc.submit({ ...VALID_INPUT, fileName: "empty.pdf", buffer: Buffer.alloc(0) }),
    ).rejects.toBeInstanceOf(SubmissionValidationError);
  });

  it("rejects a file whose bytes don't match its extension (magic-byte gate)", async () => {
    const { svc } = await buildSvc();
    // PNG named as PDF — the extension must never be trusted.
    const fake = Buffer.alloc(1024, 0x00);
    fake[0] = 0x89;
    fake[1] = 0x50;
    await expect(
      svc.submit({ ...VALID_INPUT, fileName: "fake.pdf", buffer: fake }),
    ).rejects.toBeInstanceOf(SubmissionValidationError);
  });

  it("rejects exact duplicates (same student + file + course)", async () => {
    const { svc, prisma } = await buildSvc();
    (prisma.resourceSubmission.findFirst as jest.Mock).mockResolvedValue({ id: "s-old" });
    await expect(svc.submit(VALID_INPUT)).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects submissions for deleted accounts", async () => {
    const { svc, prisma } = await buildSvc();
    (prisma.resourceSubmission.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "u-1",
      institutionId: "inst-1",
      faculty: "Science",
      department: "Chemistry",
      level: "300",
      deletedAt: new Date(),
    });
    await expect(svc.submit(VALID_INPUT)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("enforces the per-student rolling-window rate limit", async () => {
    const prismaMock = makePrisma();
    (prismaMock.resourceSubmission.findFirst as jest.Mock).mockResolvedValue(null);
    const fresh = await buildSvc(prismaMock);
    // Default limit is 10/hour: fill it up.
    for (let i = 0; i < 10; i++) {
      await fresh.svc.submit({
        ...VALID_INPUT,
        fileName: `file-${i}.pdf`,
        buffer: pdfBytes(),
      });
    }
    await expect(
      fresh.svc.submit({ ...VALID_INPUT, fileName: "one-too-many.pdf" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("ResourceAuditService — authorization", () => {
  it("a student cannot read another student's submission", async () => {
    const { svc } = await buildSvc(makePrisma(baseRow({ studentId: "someone-else" })));
    await expect(svc.getStatus("s-1", "u-1")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("the owner can read their own submission", async () => {
    const { svc } = await buildSvc(makePrisma(baseRow()));
    const result = await svc.getStatus("s-1", "u-1");
    expect(result.id).toBe("s-1");
  });

  it("an admin can read any submission", async () => {
    const { svc } = await buildSvc(makePrisma(baseRow({ studentId: "someone-else" })));
    const result = await svc.getStatus("s-1", "admin-1", true);
    expect(result.id).toBe("s-1");
  });

  it("listByStudent enforces the same rule", async () => {
    const { svc } = await buildSvc();
    await expect(svc.listByStudent("other", "u-1")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.listByStudent("u-1", "other", true)).resolves.toBeDefined();
  });

  it("the public projection never leaks extracted text or storage refs", async () => {
    const { svc } = await buildSvc(
      makePrisma(baseRow({ extractedText: "secret text", storageRef: "private/key" })),
    );
    const result = (await svc.getStatus("s-1", "u-1")) as Record<string, unknown>;
    expect(JSON.stringify(result)).not.toContain("secret text");
    expect(JSON.stringify(result)).not.toContain("private/key");
  });
});

describe("Resource Audit state machine — transitions", () => {
  it("accepts every happy-path transition of the Part 1 pipeline", () => {
    const happy: Array<[string, string]> = [
      ["received", "validating"],
      ["validating", "duplicate_check"],
      ["duplicate_check", "extracting"],
      ["extracting", "auditing"],
      ["auditing", "pending_human_review"],
      ["pending_human_review", "approved"],
      ["approved", "reward_pending"],
      ["reward_pending", "reward_eligible"],
      ["reward_eligible", "processing_library"],
      ["processing_library", "published"],
    ];
    for (const [from, to] of happy) {
      expect(canTransition(from as never, to as never)).toBe(true);
    }
  });

  it("rejects invalid transitions — skipping stages, reversing, restarting", () => {
    expect(canTransition(AUDIT_STATUS.received, AUDIT_STATUS.published)).toBe(false);
    expect(canTransition(AUDIT_STATUS.received, AUDIT_STATUS.auditing)).toBe(false);
    expect(canTransition(AUDIT_STATUS.pending_human_review, AUDIT_STATUS.validating)).toBe(false);
    expect(canTransition(AUDIT_STATUS.published, AUDIT_STATUS.received)).toBe(false);
    expect(canTransition(AUDIT_STATUS.rejected, AUDIT_STATUS.pending_human_review)).toBe(false);
  });

  it("terminal states cannot leave", () => {
    for (const s of [AUDIT_STATUS.rejected, AUDIT_STATUS.published, AUDIT_STATUS.failed]) {
      expect(isTerminal(s)).toBe(true);
    }
    expect(assertTransition.bind(null, AUDIT_STATUS.published, AUDIT_STATUS.received)).toThrow(
      InvalidTransitionError,
    );
  });

  it("processing states are retryable; human states are not", () => {
    expect(isRetryable(AUDIT_STATUS.extracting)).toBe(true);
    expect(isRetryable(AUDIT_STATUS.auditing)).toBe(true);
    expect(isRetryable(AUDIT_STATUS.pending_human_review)).toBe(false);
  });

  it("human decisions only fire from pending_human_review", async () => {
    const { svc } = await buildSvc(makePrisma(baseRow({ auditStatus: AUDIT_STATUS.approved })));
    await expect(
      svc.decide("s-1", "admin-1", "approved"),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejecting without a reason is refused", async () => {
    const { svc } = await buildSvc(makePrisma(baseRow({ auditStatus: AUDIT_STATUS.pending_human_review })));
    await expect(
      svc.decide("s-1", "admin-1", "rejected"),
    ).rejects.toBeInstanceOf(Error);
    await expect(
      svc.decide("s-1", "admin-1", "rejected", "exam paper, not study material"),
    ).resolves.toBeDefined();
  });

  it("an approval flows through reward → library publish into the existing Vault", async () => {
    const prismaMock = makePrisma(baseRow({ auditStatus: AUDIT_STATUS.pending_human_review }));
    const { svc, prisma } = await buildSvc(prismaMock);
    await svc.decide("s-1", "admin-1", "approved", "Verified past paper");
    await settle(); // publication runs detached after the decision
    // Vault row created with the submission's facts + the student's association.
    expect(prisma.vaultItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          associationId: "assoc-1",
          courseCode: "CHM 101",
          type: "past_question",
          visibility: "public",
          moderationStatus: "approved",
          contentHash: "hash-1",
        }),
      }),
    );
    const row = prisma.rows.get("s-1")!;
    expect(row.auditStatus).toBe(AUDIT_STATUS.published);
    expect(row.libraryStatus).toBe("published");
    expect(row.publishedVaultItemId).toBe("vault-1");
    expect(row.humanDecision).toBe("approved");
    expect(row.reviewerId).toBe("admin-1");
    expect(row.rewardStatus).toBe("eligible");
  });

  it("an approval publishes exactly one Vault row, even if the publish pass runs twice", async () => {
    const prismaMock = makePrisma(baseRow({ auditStatus: AUDIT_STATUS.pending_human_review }));
    const { svc, prisma } = await buildSvc(prismaMock);
    await svc.decide("s-1", "admin-1", "approved", "Verified past paper");
    await settle();
    expect(prisma.vaultItem.create).toHaveBeenCalledTimes(1);
    // Re-run the post-approval pass: the row is already published + linked,
    // so the idempotency guards must stop a second Vault row.
    await (
      svc as unknown as { afterApproval(id: string): Promise<void> }
    ).afterApproval("s-1");
    await settle();
    expect(prisma.vaultItem.create).toHaveBeenCalledTimes(1);
  });

  it("defers publication (without failing) when the student has no live membership", async () => {
    const prismaMock = makePrisma(baseRow({ auditStatus: AUDIT_STATUS.pending_human_review }));
    (prismaMock.membership.findFirst as jest.Mock).mockResolvedValue(null);
    const { svc, prisma } = await buildSvc(prismaMock);
    await svc.decide("s-1", "admin-1", "approved");
    await settle();
    const row = prisma.rows.get("s-1")!;
    // Honest waiting state: reward-eligible, never entered processing_library,
    // re-triggerable once the student joins an association.
    expect(row.auditStatus).toBe(AUDIT_STATUS.reward_eligible);
    expect(row.libraryStatus).toBe("none");
    expect(row.lastStageError).toContain("membership");
    expect(prisma.vaultItem.create).not.toHaveBeenCalled();
  });
});

describe("ResourceAuditService — failure handling", () => {
  it("marks the submission failed after the attempt budget is exhausted", async () => {
    const prismaMock = makePrisma(
      baseRow({ auditStatus: AUDIT_STATUS.extracting, attemptCount: 2 }),
    );
    (prismaMock.resourceSubmission.findFirst as jest.Mock).mockResolvedValue(null);
    // Storage read always throws → every extracting attempt fails.
    const module = await build(prismaMock);
    const storage = module.get(ResourceAuditStorage) as unknown as {
      readOriginal: jest.Mock;
    };
    storage.readOriginal.mockRejectedValue(new Error("minio down"));
    const svc = module.get<ResourceAuditService>(ResourceAuditService);

    await (svc as unknown as { runPipeline(id: string): Promise<void> }).runPipeline("s-1");
    const row = prismaMock.rows.get("s-1")!;
    expect(row.auditStatus).toBe(AUDIT_STATUS.failed);
    expect(row.failureReason).toBe("extracting");
    expect(row.attemptCount).toBe(3);
  });

  it("retryStage reopens a failed submission and reruns the pipeline from the top", async () => {
    const prismaMock = makePrisma(baseRow({ auditStatus: AUDIT_STATUS.failed, failureReason: "extracting" }));
    (prismaMock.resourceSubmission.findFirst as jest.Mock).mockResolvedValue(null);
    const { svc, prisma } = await buildSvc(prismaMock);
    const result = await svc.retryStage("s-1", "admin-1");
    expect(result.auditStatus).toBeDefined(); // reopen is synchronous
    expect((prisma.rows.get("s-1") as { attemptCount: number }).attemptCount).toBe(0);
    // The detached pipeline has restarted from `received` and advanced.
    await settle();
    const row = prisma.rows.get("s-1")!;
    expect(row.auditStatus).not.toBe(AUDIT_STATUS.failed);
    expect(row.auditStatus).not.toBe(AUDIT_STATUS.received);
  });

  it("retryStage refuses non-failed submissions", async () => {
    const { svc } = await buildSvc(makePrisma(baseRow({ auditStatus: AUDIT_STATUS.published })));
    await expect(svc.retryStage("s-1", "admin-1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("a missing original file fails the extracting stage instead of crashing", async () => {
    const prismaMock = makePrisma(baseRow({ auditStatus: AUDIT_STATUS.extracting }));
    const module = await build(prismaMock);
    const storage = module.get(ResourceAuditStorage) as unknown as { readOriginal: jest.Mock };
    storage.readOriginal.mockResolvedValue(null);
    const svc = module.get<ResourceAuditService>(ResourceAuditService);
    await (svc as unknown as { runPipeline(id: string): Promise<void> }).runPipeline("s-1");
    // Attempt 1 of 3: retry scheduled, row stays in extracting.
    const row = prismaMock.rows.get("s-1")!;
    expect(row.auditStatus).toBe(AUDIT_STATUS.extracting);
    expect(row.attemptCount).toBe(1);
  });

  it("OCR-routed image submissions reach the auditing stage with extracted text", async () => {
    const prismaMock = makePrisma(baseRow({ auditStatus: AUDIT_STATUS.extracting, fileType: "image/jpeg" }));
    const module = await build(prismaMock);
    const tools = module.get(ToolsService) as unknown as { ocrBuffer: jest.Mock };
    tools.ocrBuffer.mockResolvedValue({
      readable: true,
      text: "CHM 101 2023/2024 FIRST SEMESTER EXAMINATION",
    });
    const svc = module.get<ResourceAuditService>(ResourceAuditService);
    await (svc as unknown as { runPipeline(id: string): Promise<void> }).runPipeline("s-1");
    const row = prismaMock.rows.get("s-1")!;
    expect(row.extractedText).toContain("CHM 101");
    expect(row.auditStatus).toBe(AUDIT_STATUS.pending_human_review);
  });
});

// ── FallbackAuditor escalation contract ──────────────────────────────

describe("FallbackAuditor", () => {
  const { FallbackAuditor } = require("./resource-audit.ai-auditor");

  function stubAuditor(provider: string, model: string, behavior: () => Promise<unknown>) {
    return { provider, model, audit: behavior };
  }

  const input = {
    declared: { materialType: "past_question", courseCode: "AGE 217", level: null, academicSession: null, faculty: null, department: null, universityName: null },
    fileName: "t.pdf",
    extractedText: "text",
    usedOcr: false,
    validation: { verdict: "pass", pageCount: 2, textDensityCharsPerPage: 900, blankPageRatio: 0, repeatedPageRatio: 0, unreadablePageRatio: 0 },
  } as never;

  it("returns the primary result without touching the fallback", async () => {
    const primary = stubAuditor("ollama", "llama3.2:3b", async () => ({ provider: "ollama", model: "llama3.2:3b" }));
    const fallback = stubAuditor("deepseek", "qwen", async () => { throw new Error("must not be called"); });
    const out = await new FallbackAuditor(primary as never, fallback as never).audit(input);
    expect(out.provider).toBe("ollama");
  });

  it("escalates to the cloud auditor when the primary fails", async () => {
    const primary = stubAuditor("ollama", "llama3.2:3b", async () => { throw new Error("ollama audit failed: HTTP 500"); });
    const fallback = stubAuditor("deepseek", "qwen/qwen3.5-flash:free", async () => ({ provider: "deepseek", model: "qwen/qwen3.5-flash:free" }));
    const out = await new FallbackAuditor(primary as never, fallback as never).audit(input);
    expect(out.provider).toBe("deepseek");
    expect(out.model).toBe("qwen/qwen3.5-flash:free");
  });

  it("uses Ollama+cloud when both are keyed, Ollama only when cloud is absent", () => {
    const both = FallbackAuditor.fromEnv((k: string) => (k === "OLLAMA_HOST" ? "http://x" : k === "DEEPSEEK_API_KEY" ? "sk" : undefined));
    expect((both as { provider: string }).provider).toBe("fallback-chain");
    const onlyOllama = FallbackAuditor.fromEnv((k: string) => (k === "OLLAMA_HOST" ? "http://x" : undefined));
    expect((onlyOllama as { provider: string }).provider).toBe("ollama");
    const neither = FallbackAuditor.fromEnv(() => undefined);
    expect(neither).toBeNull();
  });
});
