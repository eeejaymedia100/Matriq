import * as crypto from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  Inject,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  Prisma,
  ResourceAuditStatus,
  ResourceLibraryStatus,
  ResourceRewardStatus,
  SubmissionSource,
} from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ToolsService } from "../tools/tools.service";
import {
  AUDIT_STATUS,
  assertTransition,
  isTerminal,
  DECISION_TRANSITIONS,
  HumanDecision,
  InvalidTransitionError,
} from "./resource-audit.state-machine";
import {
  ResourceAuditConfig,
  loadResourceAuditConfig,
  detectMimeType,
  SUPPORTED_MIME_SET,
} from "./resource-audit.config";
import { ResourceAuditStorage } from "./resource-audit.storage";
import { ResourceRewardService } from "./resource-audit.rewards";
import {
  AUDIT_SCORER,
  AuditScorerProvider,
  RuleBasedScorer,
} from "./resource-audit.scorer";
import {
  validateFile,
  sha256,
  textFingerprint,
  loadThresholds,
  ValidationThresholds,
  ValidationReport,
} from "./resource-audit.validation";
import {
  checkDuplicates,
  toEvidence,
  DuplicateEvidence,
} from "./resource-audit.duplicates";
import {
  AUDITOR_PORT,
  ResourceAiAuditor,
  StructuredAudit,
  AuditorInput,
  DeepSeekAuditor,
  RuleBasedAuditor,
} from "./resource-audit.ai-auditor";
import pdfParse from "pdf-parse";

/** Course-code shape: 2–4 letters, optional separator letters, 3–4 digits. */
const COURSE_CODE_RE = /^[A-Z]{2,4}\s?\d{3,4}[A-Z]?$/;

export interface SubmitResourceInput {
  studentId: string;
  fileName: string;
  buffer: Buffer;
  courseCode: string;
  materialType: string;
  level?: string | null;
  academicSession?: string | null;
  rightsDeclared: boolean;
  institutionId?: string | null;
  faculty?: string | null;
  department?: string | null;
  source?: SubmissionSource;
}

export class SubmissionValidationError extends BadRequestException {
  constructor(reason: string) {
    super({ error: "submission_invalid", reason });
  }
}

@Injectable()
export class ResourceAuditService {
  private readonly logger = new Logger(ResourceAuditService.name);
  private readonly config: ResourceAuditConfig;
  /** Deterministic validation thresholds (Part 2), env-overridable. */
  private readonly thresholds: ValidationThresholds;
  /** AI auditor (Part 3) — provider-configurable, rule-based fallback. */
  private readonly auditor: ResourceAiAuditor;
  /** Per-student rolling-window cap (transport throttling is the Throttler's job). */
  private readonly recentSubmissions = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageAdapter: ResourceAuditStorage,
    private readonly tools: ToolsService,
    private readonly rewards: ResourceRewardService,
    configService: ConfigService,
    @Inject(AUDIT_SCORER) private readonly scorer: AuditScorerProvider,
    @Optional() @Inject(AUDITOR_PORT) auditor?: ResourceAiAuditor,
  ) {
    this.config = loadResourceAuditConfig(configService);
    this.thresholds = loadThresholds((key) => configService?.get<string>(key));
    this.auditor =
      auditor ??
      DeepSeekAuditor.fromEnv((key) => configService?.get<string>(key)) ??
      new RuleBasedAuditor();
  }

  // ── Submission ─────────────────────────────────────────────────────

  /**
   * Submit a resource for audit. Validates, hashes, preserves the original,
   * records the submission, then kicks off the pipeline fire-and-forget —
   * the caller gets the submission ID immediately and polls for status.
   */
  async submit(input: SubmitResourceInput) {
    const studentId = input.studentId;

    // 1. Rights declaration — non-negotiable.
    if (!input.rightsDeclared) {
      this.log("submit", null, studentId, "rejected: rights declaration missing");
      throw new SubmissionValidationError(
        "You must confirm you have the right to share this material.",
      );
    }

    // 2. Course code normalization + validation.
    const courseCode = input.courseCode.trim().toUpperCase().replace(/\s+/g, " ");
    if (!COURSE_CODE_RE.test(courseCode)) {
      throw new SubmissionValidationError(
        `Course code "${courseCode}" doesn't look valid (expected e.g. CHM 101).`,
      );
    }

    // 3. Declared file type must be a known, supported extension (a hint
    //    only — the bytes are verified by magic-number sniffing below).
    const declaredMime = this.guessMimeFromName(input.fileName);
    if (!declaredMime || !SUPPORTED_MIME_SET.has(declaredMime)) {
      throw new SubmissionValidationError(
        "That file type isn't supported. Upload a PDF, JPEG, PNG or WEBP.",
      );
    }

    // 4. Size limit (config-driven).
    if (input.buffer.length === 0) {
      throw new SubmissionValidationError("The file is empty.");
    }
    if (input.buffer.length > this.config.maxFileSizeBytes) {
      const mb = Math.round(this.config.maxFileSizeBytes / (1024 * 1024));
      throw new SubmissionValidationError(`File is too large (max ${mb} MB).`);
    }

    // 5. Magic-byte sniffing — contents must match the declared type.
    const detected = detectMimeType(input.buffer);
    if (!detected) {
      throw new SubmissionValidationError(
        "The file's contents aren't recognized. It may be corrupted.",
      );
    }
    if (declaredMime !== null && detected !== declaredMime) {
      this.log("submit", null, studentId, "rejected: magic-byte mismatch", {
        detected,
        declaredMime,
      });
      throw new SubmissionValidationError(
        "The file's contents don't match its type. It may be corrupted or renamed.",
      );
    }

    // 6. Rate limit per student (config-driven rolling window).
    this.enforceSubmissionRate(studentId);

    // 7. Hash + exact-duplicate check (same student, same file, same course).
    const fileHash = this.storageAdapter.hash(input.buffer);
    const duplicate = await this.prisma.resourceSubmission.findFirst({
      where: { studentId, fileHash, courseCode },
      select: { id: true },
    });
    if (duplicate) {
      this.log("submit", null, studentId, "rejected: exact duplicate", {
        duplicateId: duplicate.id,
      });
      throw new ConflictException({
        error: "duplicate_submission",
        submissionId: duplicate.id,
        reason: "You've already submitted this exact file for this course.",
      });
    }

    // 8. Resolve the student's academic context from their profile.
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        institutionId: true,
        faculty: true,
        department: true,
        level: true,
        deletedAt: true,
      },
    });
    if (!student || student.deletedAt) {
      throw new NotFoundException("Account not found.");
    }

    // 9. Generate the ID first, then persist the original untouched bytes
    //    directly under its final key — no temp objects, no re-keying.
    const submissionId = crypto.randomUUID();
    let storageRef: string;
    try {
      storageRef = await this.storageAdapter.saveOriginal(
        submissionId,
        input.fileName,
        input.buffer,
        detected,
      );
    } catch (err) {
      this.log("submit", submissionId, studentId, "storage failed", { err: String(err) });
      throw new SubmissionValidationError("Storage is unavailable — try again shortly.");
    }

    // 10. Create the row; the pipeline starts from `received`.
    const submission = await this.prisma.resourceSubmission.create({
      data: {
        id: submissionId,
        studentId,
        source: input.source ?? SubmissionSource.app,
        fileName: input.fileName.slice(0, 255),
        fileType: detected,
        fileSize: input.buffer.length,
        fileHash,
        storageRef,
        institutionId: input.institutionId ?? student.institutionId,
        universityName: null, // denormalized by a later enrichment pass
        faculty: input.faculty ?? student.faculty,
        department: input.department ?? student.department,
        courseCode,
        level: input.level ?? student.level,
        materialType: this
          .materialTypeOrThrow(input.materialType)
          .valueOf() as never,
        academicSession: input.academicSession ?? null,
        rightsDeclared: true,
        rightsVersion: this.config.rightsVersion,
        auditStatus: AUDIT_STATUS.received,
      },
    });

    this.log("submit", submission.id, studentId, "submission created", { courseCode });

    // 11. Kick off the pipeline. Fire-and-forget: submit() returns fast.
    void this.runPipeline(submission.id).catch((err) => {
      this.logger.error(
        JSON.stringify({
          stage: "pipeline",
          submissionId: submission.id,
          msg: "unhandled pipeline error",
          err: String(err),
        }),
      );
    });

    return this.toPublicSubmission(submission);
  }

  // ── Status ─────────────────────────────────────────────────────────

  /** Student-facing audit status. Only the owner (or an admin) sees a row. */
  async getStatus(submissionId: string, requesterId: string, isAdmin = false) {
    const submission = await this.prisma.resourceSubmission.findUnique({
      where: { id: submissionId },
    });
    if (!submission) throw new NotFoundException("Submission not found.");
    if (!isAdmin && submission.studentId !== requesterId) {
      throw new ForbiddenException("This submission isn't yours.");
    }
    return this.toPublicSubmission(submission);
  }

  /** All submissions by one student (owner or admin). */
  async listByStudent(studentId: string, requesterId: string, isAdmin = false) {
    if (!isAdmin && studentId !== requesterId) {
      throw new ForbiddenException("You can only view your own submissions.");
    }
    const rows = await this.prisma.resourceSubmission.findMany({
      where: { studentId },
      orderBy: { submittedAt: "desc" },
      take: 100,
    });
    return rows.map((r) => this.toPublicSubmission(r));
  }

  // ── Admin review ───────────────────────────────────────────────────

  /**
   * Admin review queue (Part 4): filter by status, risk, AI recommendation,
   * institution, course, or material type. Pending-by-default; every filter
   * is optional and combined with AND.
   */
  async adminReviewQueue(filters: {
    status?: string;
    risk?: string;
    aiRecommendation?: string;
    institutionId?: string;
    courseCode?: string;
    materialType?: string;
    take?: number;
  }) {
    const where: Record<string, unknown> = {};
    if (filters.status) where.auditStatus = filters.status;
    else where.auditStatus = AUDIT_STATUS.pending_human_review; // pending by default
    if (filters.risk) where.riskLevel = filters.risk;
    if (filters.aiRecommendation) where.aiRecommendation = filters.aiRecommendation;
    if (filters.institutionId) where.institutionId = filters.institutionId;
    if (filters.courseCode) where.courseCode = { contains: filters.courseCode.toUpperCase(), mode: "insensitive" };
    if (filters.materialType) where.materialType = filters.materialType;
    return this.prisma.resourceSubmission.findMany({
      where,
      orderBy: [{ submittedAt: "asc" }],
      take: Math.min(filters.take ?? 200, 200),
      include: {
        student: { select: { id: true, fullName: true, matricNumber: true, email: true } },
      },
    });
  }

  /**
   * Full reviewer detail: everything in one screen — the document preview
   * URL, student metadata, extracted metadata, AI report, quality metrics,
   * duplicate evidence, and the decision trail.
   */
  async adminReviewDetail(submissionId: string) {
    const row = await this.prisma.resourceSubmission.findUnique({
      where: { id: submissionId },
      include: {
        student: { select: { id: true, fullName: true, matricNumber: true, email: true, faculty: true, department: true, level: true } },
      },
    });
    if (!row) throw new NotFoundException("Submission not found.");
    return {
      ...this.toPublicSubmission(row),
      student: row.student,
      validation: row.validationResults ?? null,
      quality: row.qualityMetrics ?? null,
      aiAuditReport: row.aiAuditReport ?? null,
      aiProvider: row.aiProvider,
      aiModel: row.aiModel,
      riskLevel: row.riskLevel,
      duplicateOfId: row.duplicateOfId,
      duplicateSimilarity: row.duplicateSimilarity,
      reviewerNotes: row.reviewerNotes,
      documentPreviewUrl: `/v1/resource-audit/admin/submissions/${row.id}/file`,
    };
  }

  /**
   * Stream the preserved ORIGINAL to an authorized reviewer. Owner access is
   * deliberately refused — students see status, not raw bytes.
   */
  async adminFile(submissionId: string, adminId: string): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const row = await this.prisma.resourceSubmission.findUnique({ where: { id: submissionId } });
    if (!row) throw new NotFoundException("Submission not found.");
    const buffer = await this.storageAdapter.readOriginal(row.storageRef);
    if (!buffer) throw new NotFoundException("Original file unavailable from storage.");
    this.log("admin_file", submissionId, row.studentId, "original streamed to reviewer", { adminId });
    return { buffer, mimeType: row.fileType, fileName: row.fileName };
  }

  /** Reopen a rejected submission (authorized reconsideration). */
  async adminReopen(submissionId: string, adminId: string, note?: string) {
    const row = await this.prisma.resourceSubmission.findUnique({ where: { id: submissionId } });
    if (!row) throw new NotFoundException("Submission not found.");
    if (row.auditStatus !== AUDIT_STATUS.rejected) {
      throw new ConflictException("Only rejected submissions can be reopened.");
    }
    await this.prisma.resourceSubmission.update({
      where: { id: submissionId },
      data: {
        auditStatus: AUDIT_STATUS.pending_human_review,
        reviewerNotes: `reopened by ${adminId}${note ? `: ${note.slice(0, 200)}` : ""} at ${new Date().toISOString()}`,
      },
    });
    this.log("admin_reopen", submissionId, row.studentId, "rejected submission reopened", { adminId });
    return this.adminReviewDetail(submissionId);
  }

  /** Store reviewer notes (private context, distinct from student-facing reason). */
  async adminNotes(submissionId: string, adminId: string, notes: string) {
    const row = await this.prisma.resourceSubmission.findUnique({ where: { id: submissionId } });
    if (!row) throw new NotFoundException("Submission not found.");
    await this.prisma.resourceSubmission.update({
      where: { id: submissionId },
      data: { reviewerNotes: notes.slice(0, 2000) },
    });
    this.log("admin_notes", submissionId, row.studentId, "reviewer notes updated", { adminId });
    return this.adminReviewDetail(submissionId);
  }

  /** Metrics summary: AI-vs-human agreement, per-risk verdict accuracy. */
  async adminMetrics() {
    const decided = await this.prisma.resourceSubmission.findMany({
      where: { humanDecision: { not: null }, aiRecommendation: { not: null } },
      select: { aiRecommendation: true, humanDecision: true, riskLevel: true, aiProvider: true, aiModel: true },
      take: 2000,
      orderBy: { reviewedAt: "desc" },
    });
    let agree = 0;
    const perRisk: Record<string, { total: number; agreed: number }> = {};
    const perModel: Record<string, { total: number; agreed: number }> = {};
    const norm = (r: string | null) => (r === "needs_review" ? "review" : r);
    for (const d of decided) {
      const ai = norm(d.aiRecommendation);
      const humanApproved = d.humanDecision === "approved";
      const aiSaidApprove = ai === "approve";
      const aiSaidReject = ai === "reject";
      const matched = (aiSaidApprove && humanApproved) || (aiSaidReject && d.humanDecision === "rejected");
      if (matched) agree += 1;
      const riskKey = d.riskLevel ?? "unknown";
      perRisk[riskKey] = perRisk[riskKey] ?? { total: 0, agreed: 0 };
      perRisk[riskKey].total += 1;
      if (matched) perRisk[riskKey].agreed += 1;
      const modelKey = `${d.aiProvider ?? "unknown"}/${d.aiModel ?? "unknown"}`;
      perModel[modelKey] = perModel[modelKey] ?? { total: 0, agreed: 0 };
      perModel[modelKey].total += 1;
      if (matched) perModel[modelKey].agreed += 1;
    }
    const total = decided.length;
    const bump = (o: { total: number; agreed: number }) =>
      o.total > 0 ? Math.round((o.agreed / o.total) * 100) : null;
    return {
      decidedTotal: total,
      agreementRate: total > 0 ? Math.round((agree / total) * 100) : null,
      perRisk: Object.fromEntries(Object.entries(perRisk).map(([k, v]) => [k, { ...v, agreementRate: bump(v) }])),
      perModel: Object.fromEntries(Object.entries(perModel).map(([k, v]) => [k, { ...v, agreementRate: bump(v) }])),
    };
  }

  /** Queue of submissions awaiting (or filtered to) a review state. */
  async reviewQueue(status?: ResourceAuditStatus) {
    return this.prisma.resourceSubmission.findMany({
      where: status
        ? { auditStatus: status }
        : { auditStatus: AUDIT_STATUS.pending_human_review },
      orderBy: { submittedAt: "asc" },
      take: 200,
      include: {
        student: {
          select: { id: true, fullName: true, matricNumber: true, email: true },
        },
      },
    });
  }

  /**
   * The human decision — the ONLY authoritative verdict. Legal only from
   * pending_human_review; rejecting / needs_information requires a reason.
   */
  async decide(
    submissionId: string,
    reviewerId: string,
    decision: HumanDecision,
    reason?: string,
  ) {
    if (decision !== "approved" && !reason?.trim()) {
      throw new BadRequestException(
        "A reason is required when rejecting or requesting information.",
      );
    }
    const submission = await this.prisma.resourceSubmission.findUnique({
      where: { id: submissionId },
    });
    if (!submission) throw new NotFoundException("Submission not found.");
    if (submission.auditStatus !== AUDIT_STATUS.pending_human_review) {
      throw new ConflictException(
        `Submission is ${submission.auditStatus}; decisions are only legal from pending_human_review.`,
      );
    }

    const target = DECISION_TRANSITIONS[decision];
    assertTransition(submission.auditStatus, target);

    const updated = await this.prisma.resourceSubmission.update({
      // The compound where makes a concurrent double-decision a no-op.
      where: { id: submissionId, auditStatus: AUDIT_STATUS.pending_human_review },
      data: {
        auditStatus: target,
        humanDecision: decision,
        decisionReason: reason?.trim() ?? null,
        reviewerId,
        reviewedAt: new Date(),
      },
    });
    this.log("review", submissionId, submission.studentId, `human decision: ${decision}`, {
      reviewerId,
    });

    // Approvals flow on to reward evaluation + library publication.
    if (decision === "approved") {
      void this.afterApproval(submissionId).catch((err) =>
        this.logger.error(
          JSON.stringify({
            stage: "pipeline",
            submissionId,
            msg: "post-approval failed",
            err: String(err),
          }),
        ),
      );
    }
    return this.toPublicSubmission(updated);
  }

  // ── Pipeline ───────────────────────────────────────────────────────

  /**
   * Run the automated stages for one submission. The loop re-reads the row
   * between stages, so re-entry after a retry (or from any mid-pipeline
   * state) continues from wherever the row actually is — never from the top.
   * Every stage re-derives its result from the preserved original, which is
   * what makes retries safe: same input, same effect, no double side-effects.
   */
  private async runPipeline(submissionId: string): Promise<void> {
    for (let hop = 0; hop < 8; hop++) {
      const row = await this.prisma.resourceSubmission.findUnique({
        where: { id: submissionId },
      });
      if (!row || isTerminal(row.auditStatus)) return;

      switch (row.auditStatus) {
        // ── received → validating → duplicate_check ──────────────────
        case AUDIT_STATUS.received: {
          await this.stageTransition(submissionId, AUDIT_STATUS.received, AUDIT_STATUS.validating);
          // Facts were validated at submit; the re-check covers rows an
          // admin re-queued after editing.
          if (row.fileSize <= 0 || !SUPPORTED_MIME_SET.has(row.fileType)) {
            await this.failStage(submissionId, "validating", "row fails re-validation");
            return;
          }
          await this.stageTransition(submissionId, AUDIT_STATUS.validating, AUDIT_STATUS.duplicate_check);
          continue;
        }

        // ── duplicate_check: cross-student / already-published clashes ──
        case AUDIT_STATUS.duplicate_check: {
          const clash = await this.prisma.resourceSubmission.findFirst({
            where: {
              fileHash: row.fileHash,
              id: { not: row.id },
              auditStatus: { in: [AUDIT_STATUS.pending_human_review, AUDIT_STATUS.published] },
            },
            select: { id: true },
          });
          if (clash) {
            await this.prisma.resourceSubmission.update({
              where: { id: submissionId, auditStatus: AUDIT_STATUS.duplicate_check },
              data: {
                auditStatus: AUDIT_STATUS.rejected,
                failureReason: "duplicate",
                lastStageError: `Duplicate of submission ${clash.id}`,
              },
            });
            this.log("duplicate_check", submissionId, row.studentId, "rejected as duplicate", {
              of: clash.id,
            });
            return;
          }
          await this.stageTransition(submissionId, AUDIT_STATUS.duplicate_check, AUDIT_STATUS.extracting);
          continue;
        }

        // ── extracting: PDF text layer, or OCR for image submissions ──
        case AUDIT_STATUS.extracting: {
          try {
            const buffer = await this.storageAdapter.readOriginal(row.storageRef);
            if (!buffer || buffer.length === 0) {
              throw new Error("original file unreadable from storage");
            }
            let extractedText: string | null = null;
            let pageCount: number | null = null;
            let usedOcr = false;

            if (row.fileType === "application/pdf") {
              // pdf-parse 1.1.1's bundled pdf.js fails on Node Buffer
              // instances ("Invalid PDF structure") but works on a plain
              // exact-size Uint8Array — the Vault ships the same workaround.
              const data = await pdfParse(new Uint8Array(buffer) as unknown as Buffer);
              extractedText = (data.text ?? "").replace(/\s+/g, " ").trim().slice(0, 50_000) || null;
              pageCount = data.numpages ?? null;
            } else {
              // Image submission: route through the existing Tesseract OCR
              // engine (same one /tools/ocr and the Vault use).
              const ocr = await this.tools.ocrBuffer(buffer, row.fileType);
              if (ocr.readable && ocr.text) {
                extractedText = ocr.text.replace(/\s+/g, " ").trim().slice(0, 50_000);
              }
              usedOcr = true;
            }

            await this.prisma.resourceSubmission.update({
              where: { id: submissionId },
              data: { extractedText, pageCount },
            });
            await this.stageTransition(
              submissionId,
              AUDIT_STATUS.extracting,
              usedOcr ? AUDIT_STATUS.ocr_processing : AUDIT_STATUS.auditing,
            );
            continue;
          } catch (err) {
            await this.failStage(submissionId, "extracting", String(err));
            return;
          }
        }

        // ── ocr_processing: OCR output is already captured; Part 2 adds a
        // heavier recognition pass here. Advance to audit.
        case AUDIT_STATUS.ocr_processing: {
          await this.stageTransition(submissionId, AUDIT_STATUS.ocr_processing, AUDIT_STATUS.auditing);
          continue;
        }

        // ── auditing: deep validation → duplicates → AI audit → human ──
        case AUDIT_STATUS.auditing: {
          try {
            // 1. Deep deterministic validation (Part 2) — runs on the
            // preserved original BEFORE any AI spend. Re-derives from bytes,
            // so retries stay idempotent.
            const original = await this.storageAdapter.readOriginal(row.storageRef);
            const report: ValidationReport =
              original && original.length > 0
                ? await validateFile(original, row.fileType, this.thresholds)
                : ({
                    verdict: "bad",
                    formatOk: false,
                    encrypted: false,
                    pageCount: null,
                    emptyOrEffectivelyEmpty: true,
                    checks: [{ name: "storage", verdict: "bad", detail: "original unreadable" }],
                    quality: null,
                  } satisfies ValidationReport);

            // Structural impossibilities (corrupt/encrypted/empty) end here —
            // the human sees the evidence and can reopen if it's wrong.
            if (report.verdict === "bad") {
              await this.prisma.resourceSubmission.update({
                where: { id: submissionId, auditStatus: AUDIT_STATUS.auditing },
                data: {
                  validationResults: report as unknown as Prisma.InputJsonValue,
                  auditStatus: AUDIT_STATUS.rejected,
                  failureReason: "validation_failed",
                  lastStageError: `deterministic validation: ${report.checks.map((c) => `${c.name}=${c.verdict}`).join(", ")}`,
                },
              });
              this.log("auditing", submissionId, row.studentId, "rejected by deterministic validation", {
                verdict: report.verdict,
                checks: report.checks.map((c) => c.name),
              });
              return;
            }

            // 2. Near-duplicate detection (Part 2). Exact hashes died at
            // duplicate_check; here we catch renames and minor modifications.
            const fingerprint = textFingerprint(row.extractedText);
            const candidatePool = await this.prisma.resourceSubmission.findMany({
              where: {
                id: { not: submissionId },
                auditStatus: { in: [AUDIT_STATUS.pending_human_review, AUDIT_STATUS.published] },
                submittedAt: { gte: new Date(Date.now() - 90 * 24 * 3600 * 1000) },
              },
              select: {
                id: true,
                studentId: true,
                fileHash: true,
                textFingerprint: true,
                extractedText: true,
                auditStatus: true,
              },
              take: 300,
            });
            const dupResult = checkDuplicates({
              selfId: submissionId,
              studentId: row.studentId,
              fileHash: row.fileHash,
              extractedText: row.extractedText,
              fingerprint,
              candidates: candidatePool,
            });
            const dupEvidence: DuplicateEvidence = toEvidence(dupResult);

            if (dupResult.action === "mark_duplicate_candidate") {
              // Exact hash of an already-pending/published submission — no AI
              // spend, no reward path. The reviewer confirms the verdict.
              await this.prisma.resourceSubmission.update({
                where: { id: submissionId, auditStatus: AUDIT_STATUS.auditing },
                data: {
                  validationResults: report as unknown as Prisma.InputJsonValue,
                  textFingerprint: fingerprint,
                  duplicateOfId: dupResult.exactOf,
                  duplicateSimilarity: 100,
                  auditStatus: AUDIT_STATUS.pending_human_review,
                  failureReason: "duplicate_candidate",
                  lastStageError: `exact duplicate of ${dupResult.exactOf}`,
                },
              });
              this.log("auditing", submissionId, row.studentId, "marked duplicate candidate", {
                of: dupResult.exactOf,
              });
              return;
            }

            // 3. The AI Resource Auditor (Part 3) — structured output only,
            // recommendation advisory forever.
            const auditorInput: AuditorInput = {
              declared: {
                materialType: row.materialType,
                courseCode: row.courseCode,
                level: row.level,
                academicSession: row.academicSession,
                faculty: row.faculty,
                department: row.department,
                universityName: row.universityName,
              },
              fileName: row.fileName,
              extractedText: row.extractedText,
              usedOcr: false,
              validation: report.quality
                ? {
                    verdict: report.verdict,
                    pageCount: report.pageCount,
                    textDensityCharsPerPage: report.quality.textDensityCharsPerPage,
                    blankPageRatio: report.quality.blankPageRatio,
                    suspiciouslyPadded: report.quality.suspiciouslyPadded,
                    screenshotHeavy: report.quality.screenshotHeavy,
                  }
                : null,
              duplicateEvidence: {
                maxSimilarity: dupResult.maxSimilarity,
                nearHitCount: dupResult.hits.length,
                exactOf: dupResult.exactOf,
              },
            };
            let audit: StructuredAudit;
            try {
              audit = await this.auditor.audit(auditorInput);
            } catch (providerErr) {
              // Provider outage must never stall the pipeline — the rule
              // auditor produces the same schema deterministically.
              this.log("auditing", submissionId, row.studentId, "AI provider failed; falling back to rules", {
                err: String(providerErr).slice(0, 200),
              });
              audit = await new RuleBasedAuditor().audit(auditorInput);
            }

            // 4. Persist EVERYTHING the reviewer needs. V1 rule: every
            // submission goes to a human — the AI never publishes, never
            // approves, never rewards.
            await this.prisma.resourceSubmission.update({
              where: { id: submissionId, auditStatus: AUDIT_STATUS.auditing },
              data: {
                validationResults: report as unknown as Prisma.InputJsonValue,
                qualityMetrics: (report.quality ?? null) as unknown as Prisma.InputJsonValue,
                textFingerprint: fingerprint,
                duplicateOfId: dupResult.exactOf,
                duplicateSimilarity: dupResult.maxSimilarity || null,
                aiRecommendation: audit.recommendation,
                aiConfidence: audit.overallConfidence,
                aiSummary: audit.reasons.slice(0, 3).join(" · "),
                aiAuditReport: audit as unknown as Prisma.InputJsonValue,
                aiProvider: audit.provider,
                aiModel: audit.model,
                aiAuditedAt: new Date(),
                riskLevel: audit.riskLevel,
                auditStatus: AUDIT_STATUS.pending_human_review,
              },
            });
            this.log("auditing", submissionId, row.studentId, "structured audit complete → human review", {
              provider: audit.provider,
              model: audit.model,
              recommendation: audit.recommendation,
              confidence: audit.overallConfidence,
              risk: audit.riskLevel,
              duplicateAction: dupResult.action,
              maxSimilarity: dupResult.maxSimilarity,
            });
            return;
          } catch (err) {
            await this.failStage(submissionId, "auditing", String(err));
            return;
          }
        }

        // reward_* / processing_library: publication (idempotent re-entry
        // covers crash recovery and deferred publishes after membership).
        case AUDIT_STATUS.reward_eligible:
        case AUDIT_STATUS.reward_ineligible:
        case AUDIT_STATUS.processing_library: {
          await this.afterApproval(submissionId);
          return;
        }

        // pending_human_review / approved / reward_pending: owned by the
        // human review flow, not this loop.
        default:
          return;
      }
    }
  }

  /**
   * Post-approval: reward evaluation (Part 1 marks approved submissions
   * reward-eligible; the ledger itself lands in Part 2), then publish into
   * the EXISTING Vault/library store — no new library system is created.
   */
  private async afterApproval(submissionId: string): Promise<void> {
    // ── Reward evaluation ────────────────────────────────────────────
    const row = await this.prisma.resourceSubmission.findUnique({ where: { id: submissionId } });
    if (!row) return;
    if (row.auditStatus === AUDIT_STATUS.approved) {
      await this.stageTransition(submissionId, AUDIT_STATUS.approved, AUDIT_STATUS.reward_pending);
      await this.prisma.resourceSubmission.update({
        where: { id: submissionId },
        data: { rewardStatus: ResourceRewardStatus.pending },
      });
    }
    const pending = await this.prisma.resourceSubmission.findUnique({ where: { id: submissionId } });
    if (pending?.auditStatus === AUDIT_STATUS.reward_pending) {
      // Reward qualification (Part 5) is a SEPARATE decision from library
      // approval: duplicates, abuse-risk and campaign state gate it.
      const qualification = await this.rewards.qualify({
        id: pending.id,
        studentId: pending.studentId,
        courseCode: pending.courseCode,
        materialType: pending.materialType,
        aiAuditReport: pending.aiAuditReport,
        duplicateOfId: pending.duplicateOfId,
      });
      if (qualification.qualified) {
        await this.prisma.resourceSubmission.update({
          where: { id: submissionId },
          data: {
            rewardStatus: ResourceRewardStatus.eligible,
            rewardReason: `qualified (${qualification.points} pt) — ${qualification.reason}`,
          },
        });
        await this.stageTransition(submissionId, AUDIT_STATUS.reward_pending, AUDIT_STATUS.reward_eligible);
        // Tier evaluation + leaderboard accrual happen after the ledger row.
        await this.rewards.evaluateTiers(pending.studentId).catch((err) =>
          this.logger.warn(
            JSON.stringify({ stage: "rewards", submissionId, msg: "tier evaluation failed", err: String(err).slice(0, 200) }),
          ),
        );
      } else {
        await this.prisma.resourceSubmission.update({
          where: { id: submissionId },
          data: {
            rewardStatus: ResourceRewardStatus.ineligible,
            rewardReason: qualification.reason,
          },
        });
        await this.stageTransition(submissionId, AUDIT_STATUS.reward_pending, AUDIT_STATUS.reward_ineligible);
        this.log("rewards", submissionId, pending.studentId, "reward ineligible", {
          reason: qualification.reason,
          abuseScore: qualification.abuseScore,
        });
      }
    }

    // ── Library processing: publish into the shared Vault ────────────
    const pub = await this.prisma.resourceSubmission.findUnique({ where: { id: submissionId } });
    if (!pub) return;
    if (
      pub.auditStatus !== AUDIT_STATUS.reward_eligible &&
      pub.auditStatus !== AUDIT_STATUS.reward_ineligible &&
      pub.auditStatus !== AUDIT_STATUS.processing_library
    ) {
      return; // a human moved it; stop touching it
    }
    if (pub.libraryStatus === ResourceLibraryStatus.published || pub.publishedVaultItemId) {
      return; // idempotent: already published
    }
    try {
      // The student's live association owns the published row (required by
      // VaultItem). Without one, publication STAYS in reward_eligible —
      // an honest "waiting" state that a later pass can re-enter — instead
      // of parking in processing_library forever.
      const membership = await this.prisma.membership.findFirst({
        where: { userId: pub.studentId, status: "live" },
        select: { associationId: true },
      });
      if (!membership) {
        await this.prisma.resourceSubmission.update({
          where: { id: submissionId },
          data: {
            lastStageError: "No live association membership — library publish deferred",
          },
        });
        this.log("processing_library", submissionId, pub.studentId, "publish deferred: no live membership");
        return;
      }

      if (pub.auditStatus !== AUDIT_STATUS.processing_library) {
        await this.stageTransition(submissionId, pub.auditStatus, AUDIT_STATUS.processing_library);
      }
      await this.prisma.resourceSubmission.update({
        where: { id: submissionId },
        data: { libraryStatus: ResourceLibraryStatus.processing },
      });

      // Clean library metadata (Part 6): prefer the auditor's detected
      // title/course/session over the raw filename, falling back gracefully.
      const report = (pub.aiAuditReport ?? null) as {
        detected?: { title?: string | null; courseCode?: string | null; academicSession?: string | null };
      } | null;
      const detectedTitle = report?.detected?.title?.trim() || "";
      const cleanTitle =
        (detectedTitle || pub.fileName.replace(/\.[a-z0-9]+$/i, "")).slice(0, 120) || pub.courseCode;

      const vaultItem = await this.prisma.vaultItem.create({
        data: {
          userId: pub.studentId,
          associationId: membership.associationId,
          courseCode: pub.courseCode,
          title: cleanTitle,
          type: pub.materialType === "past_question" ? "past_question" : "material",
          visibility: "public",
          storageRef: pub.storageRef,
          originalName: pub.fileName,
          mimeType: pub.fileType,
          sizeBytes: pub.fileSize,
          contentHash: pub.fileHash,
          moderationStatus: "approved",
          institutionId: pub.institutionId,
          faculty: pub.faculty,
          department: pub.department,
          level: pub.level,
          session: pub.academicSession,
          description: pub.aiSummary,
        },
      });

      await this.prisma.resourceSubmission.update({
        where: { id: submissionId },
        data: {
          auditStatus: AUDIT_STATUS.published,
          libraryStatus: ResourceLibraryStatus.published,
          publishedVaultItemId: vaultItem.id,
        },
      });
      this.log("processing_library", submissionId, pub.studentId, "published to vault", {
        vaultItemId: vaultItem.id,
      });
    } catch (err) {
      await this.prisma.resourceSubmission.update({
        where: { id: submissionId },
        data: {
          libraryStatus: ResourceLibraryStatus.failed,
          lastStageError: `library publish failed: ${String(err).slice(0, 400)}`,
        },
      });
      await this.failStage(
        submissionId,
        "processing_library",
        String(err),
        () => this.afterApproval(submissionId),
      );
    }
  }

  // ── Failure + retry ────────────────────────────────────────────────

  /** Record a stage failure; retry with backoff until the budget is spent. */
  private async failStage(
    submissionId: string,
    stage: string,
    error: string,
    continuation: () => Promise<void> = () => this.runPipeline(submissionId),
  ): Promise<void> {
    const row = await this.prisma.resourceSubmission.findUnique({ where: { id: submissionId } });
    if (!row || isTerminal(row.auditStatus)) return;
    const attempts = row.attemptCount + 1;
    const exhausted = attempts >= this.config.maxStageAttempts;
    await this.prisma.resourceSubmission.update({
      where: { id: submissionId },
      data: {
        attemptCount: attempts,
        lastStageError: `[${stage}] ${error.slice(0, 500)}`,
        auditStatus: exhausted ? AUDIT_STATUS.failed : row.auditStatus,
        failureReason: exhausted ? stage : row.failureReason,
      },
    });
    this.logger.warn(
      JSON.stringify({
        stage,
        submissionId,
        msg: `attempt ${attempts}/${this.config.maxStageAttempts}`,
        error: error.slice(0, 200),
        failed: exhausted,
      }),
    );
    if (!exhausted) {
      const delay = Math.min(30_000, 2 ** attempts * 1000);
      setTimeout(() => {
        void continuation().catch(() => undefined);
      }, delay);
    }
  }

  /** Guarded transition write — the state machine is the only authority. */
  private async stageTransition(
    submissionId: string,
    from: ResourceAuditStatus,
    to: ResourceAuditStatus,
  ): Promise<void> {
    assertTransition(from, to);
    // The compound where makes concurrent/duplicate runs a no-op.
    try {
      await this.prisma.resourceSubmission.update({
        where: { id: submissionId, auditStatus: from },
        data: { auditStatus: to, attemptCount: 0 },
      });
    } catch (err) {
      if (!(err as { code?: string }).code?.startsWith("P20")) throw err;
    }
  }

  /** Admin action: re-run a failed submission's pipeline. */
  async retryStage(submissionId: string, requesterId: string) {
    const row = await this.prisma.resourceSubmission.findUnique({ where: { id: submissionId } });
    if (!row) throw new NotFoundException("Submission not found.");
    if (row.auditStatus !== AUDIT_STATUS.failed) {
      throw new ConflictException("Only failed submissions can be retried.");
    }
    // `failed` is terminal in the machine — reopening is an explicit
    // administrative act, recorded in lastStageError for the audit trail.
    await this.prisma.resourceSubmission.update({
      where: { id: submissionId },
      data: {
        auditStatus: AUDIT_STATUS.received,
        attemptCount: 0,
        lastStageError: `reopened by admin ${requesterId} at ${new Date().toISOString()}`,
      },
    });
    this.log("retry", submissionId, row.studentId, "failed submission reopened", { requesterId });
    void this.runPipeline(submissionId).catch(() => undefined);
    return this.getStatus(submissionId, requesterId, true);
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private enforceSubmissionRate(studentId: string): void {
    // Periodic sweep keeps the in-process map bounded.
    if (this.recentSubmissions.size > 1000) {
      const now = Date.now();
      const windowMs = this.config.windowSeconds * 1000;
      for (const [key, stamps] of this.recentSubmissions) {
        if (stamps.every((t) => now - t >= windowMs)) this.recentSubmissions.delete(key);
      }
    }
    const now = Date.now();
    const windowMs = this.config.windowSeconds * 1000;
    const timestamps = (this.recentSubmissions.get(studentId) ?? []).filter(
      (t) => now - t < windowMs,
    );
    if (timestamps.length >= this.config.submissionsPerWindow) {
      throw new ConflictException(
        `Submission limit reached (${this.config.submissionsPerWindow} per ${Math.round(this.config.windowSeconds / 60)} minutes). Try again later.`,
      );
    }
    timestamps.push(now);
    this.recentSubmissions.set(studentId, timestamps);
  }

  private guessMimeFromName(fileName: string): string | null {
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    const map: Record<string, string> = {
      pdf: "application/pdf",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
    };
    return map[ext] ?? null;
  }

  private materialTypeOrThrow(value: string) {
    const allowed = [
      "past_question",
      "lecture_note",
      "handout",
      "slide_deck",
      "textbook_summary",
      "other",
    ];
    if (!allowed.includes(value)) {
      throw new SubmissionValidationError(`Material type must be one of: ${allowed.join(", ")}.`);
    }
    return value as (typeof allowed)[number];
  }

  /** Structured log line — every line carries the submission ID. */
  private log(
    stage: string,
    submissionId: string | null,
    studentId: string | null,
    msg: string,
    extra: Record<string, unknown> = {},
  ): void {
    this.logger.log(JSON.stringify({ stage, submissionId, studentId, msg, ...extra }));
  }

  /** Public projection — internal fields (extractedText, storageRef) never leak. */
  private toPublicSubmission(row: {
    id: string;
    studentId: string;
    source: SubmissionSource;
    fileName: string;
    fileType: string;
    fileSize: number;
    pageCount: number | null;
    courseCode: string;
    level: string | null;
    materialType: string;
    academicSession: string | null;
    rightsDeclared: boolean;
    rightsVersion: string | null;
    submittedAt: Date;
    auditStatus: ResourceAuditStatus;
    aiRecommendation: string | null;
    aiConfidence: number | null;
    aiSummary: string | null;
    humanDecision: string | null;
    decisionReason: string | null;
    reviewerId: string | null;
    reviewedAt: Date | null;
    rewardStatus: ResourceRewardStatus;
    libraryStatus: ResourceLibraryStatus;
    publishedVaultItemId: string | null;
    attemptCount: number;
    failureReason: string | null;
    lastStageError: string | null;
  }) {
    return {
      id: row.id,
      studentId: row.studentId,
      source: row.source,
      fileName: row.fileName,
      fileType: row.fileType,
      fileSize: row.fileSize,
      pageCount: row.pageCount,
      courseCode: row.courseCode,
      level: row.level,
      materialType: row.materialType,
      academicSession: row.academicSession,
      rightsDeclared: row.rightsDeclared,
      submittedAt: row.submittedAt.toISOString(),
      auditStatus: row.auditStatus,
      ai: {
        recommendation: row.aiRecommendation,
        confidence: row.aiConfidence,
        summary: row.aiSummary,
      },
      human: {
        decision: row.humanDecision,
        reason: row.decisionReason,
        reviewerId: row.reviewerId,
        reviewedAt: row.reviewedAt?.toISOString() ?? null,
      },
      rewardStatus: row.rewardStatus,
      libraryStatus: row.libraryStatus,
      publishedVaultItemId: row.publishedVaultItemId,
      failure: {
        attempts: row.attemptCount,
        reason: row.failureReason,
        lastStageError: row.lastStageError,
      },
    };
  }
}

export { InvalidTransitionError };
