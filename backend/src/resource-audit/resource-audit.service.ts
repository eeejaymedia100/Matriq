import * as crypto from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Inject,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
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
import {
  AUDIT_SCORER,
  AuditScorerProvider,
  RuleBasedScorer,
} from "./resource-audit.scorer";
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
  /** Per-student rolling-window cap (transport throttling is the Throttler's job). */
  private readonly recentSubmissions = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageAdapter: ResourceAuditStorage,
    private readonly tools: ToolsService,
    configService: ConfigService,
    @Inject(AUDIT_SCORER) private readonly scorer: AuditScorerProvider,
  ) {
    this.config = loadResourceAuditConfig(configService);
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

        // ── auditing: advisory AI recommendation, then route ──────────
        case AUDIT_STATUS.auditing: {
          try {
            const result = await this.scorer.score({
              materialType: row.materialType,
              courseCode: row.courseCode,
              fileName: row.fileName,
              fileSize: row.fileSize,
              pageCount: row.pageCount,
              extractedText: row.extractedText,
              usedOcr: false,
            });
            const autoApprove =
              result.recommendation === "approve" && result.confidence >= 80;
            await this.prisma.resourceSubmission.update({
              where: { id: submissionId, auditStatus: AUDIT_STATUS.auditing },
              data: {
                aiRecommendation: result.recommendation,
                aiConfidence: Math.round(result.confidence),
                aiSummary: result.summary,
                aiAuditedAt: new Date(),
                auditStatus: autoApprove
                  ? AUDIT_STATUS.approved
                  : AUDIT_STATUS.pending_human_review,
              },
            });
            this.log("auditing", submissionId, row.studentId, "advisory audit complete", {
              recommendation: result.recommendation,
              confidence: result.confidence,
              autoApproved: autoApprove,
            });
            if (autoApprove) await this.afterApproval(submissionId);
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
      await this.prisma.resourceSubmission.update({
        where: { id: submissionId },
        data: {
          rewardStatus: ResourceRewardStatus.eligible,
          rewardReason: "Approved through the resource audit pipeline",
        },
      });
      await this.stageTransition(submissionId, AUDIT_STATUS.reward_pending, AUDIT_STATUS.reward_eligible);
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

      const vaultItem = await this.prisma.vaultItem.create({
        data: {
          userId: pub.studentId,
          associationId: membership.associationId,
          courseCode: pub.courseCode,
          title: pub.fileName.replace(/\.[a-z0-9]+$/i, "").slice(0, 120) || pub.courseCode,
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
