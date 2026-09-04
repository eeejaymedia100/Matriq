import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { NotificationsService } from "../notifications/notifications.service";
import { EntitlementService } from "../entitlement/entitlement.service";
import { Semaphore } from "../ai/semaphore";
import { DeepReadPreprocessService, PreprocessError } from "./deepread-preprocess.service";
import {
  DeepReadTranscribeService,
  TranscribeError,
} from "./deepread-transcribe.service";
import { DeepReadCacheService } from "./deepread-cache.service";
import { parseBlocksFromText, blocksToJson } from "./deepread-blocks";

/**
 * Deep Read — premium handwriting OCR (Magic Plus).
 *
 * Flow: pages upload → preprocess (sharpen/normalize/downscale) → per-page
 * transcription on the Pro tier, semaphore-bounded → flash rescue on Pro
 * failure → structured blocks → push notification when the batch completes.
 *
 * Capacity model (100 students at once):
 *  - jobs are async; the HTTP path only enqueues and returns (no waiting)
 *  - a global semaphore caps concurrent Pro calls (DEEP_READ_CONCURRENCY,
 *    default 2 — correct for billed Tier 1: 10k RPM shared with everything
 *    else on this key); queued pages wait instead of failing
 *  - results are cached by page content hash — a retry never re-bills
 *  - per-user daily page quotas bound cost (premium + free allowance)
 *
 * In-process worker: jobs are picked up on enqueue and on a periodic sweep
 * (crash recovery). Single-instance deployment today; the queue state lives
 * in Postgres so a future multi-instance deploy only needs lease columns.
 */

const MAX_PAGES_PER_JOB = 15;
const MAX_PAGE_BYTES = 12 * 1024 * 1024;
const MAX_TEXT_CHARS = 60_000;

@Injectable()
export class DeepReadService {
  private readonly logger = new Logger(DeepReadService.name);
  private readonly semaphore: Semaphore;
  private readonly premiumDaily: number;
  private readonly freeDaily: number;
  private sweepTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly preprocess: DeepReadPreprocessService,
    private readonly transcribe: DeepReadTranscribeService,
    private readonly cache: DeepReadCacheService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly entitlement: EntitlementService,
  ) {
    const conc = Number(this.config.get<string>("DEEP_READ_CONCURRENCY"));
    this.semaphore = new Semaphore(
      Number.isFinite(conc) && conc >= 1 ? Math.floor(conc) : 2,
      10 * 60 * 1000, // a queued page may wait up to 10 min for a slot
    );
    const premium = Number(this.config.get<string>("DEEP_READ_PREMIUM_DAILY"));
    this.premiumDaily =
      Number.isFinite(premium) && premium >= 0 ? Math.floor(premium) : 30;
    const free = Number(this.config.get<string>("DEEP_READ_FREE_DAILY"));
    this.freeDaily =
      Number.isFinite(free) && free >= 0 ? Math.floor(free) : 2;

    // Crash-recovery sweep: pick up stale processing jobs every 2 minutes.
    this.sweepTimer = setInterval(() => void this.sweepStaleJobs(), 120_000);
    this.sweepTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  // ── Public API ──────────────────────────────────────────────

  /**
   * Create a job from raw page images. Enqueues immediately and returns the
   * job record — the client polls or waits for the push notification.
   */
  async createJob(
    userId: string,
    files: Express.Multer.File[],
    title?: string,
  ): Promise<{ job: { id: string; status: string; pageCount: number }; position: number }> {
    if (!files?.length) {
      throw new BadRequestException("Add at least one page photo.");
    }
    if (files.length > MAX_PAGES_PER_JOB) {
      throw new BadRequestException(
        `Up to ${MAX_PAGES_PER_JOB} pages per batch — split large booklets into two batches.`,
      );
    }

    // Entitlement gate: Magic Plus uses the premium quota; free accounts get
    // a small daily taste of Deep Read (conversion hook, still server-graded).
    const status = await this.entitlement.status(userId);
    const premium = status.isPremium;
    const dailyLimit = premium ? this.premiumDaily : this.freeDaily;
    const usedToday = await this.pagesUsedToday(userId);
    if (usedToday + files.length > dailyLimit) {
      const remaining = Math.max(0, dailyLimit - usedToday);
      throw new ForbiddenException({
        code: premium ? "DEEP_READ_QUOTA" : "MAGIC_PLUS_REQUIRED",
        message: premium
          ? remaining > 0
            ? `Daily Deep Read limit reached (${dailyLimit} pages/day) — only ${remaining} left today.`
            : `You've used all ${dailyLimit} Deep Read pages for today. Your allowance resets at midnight.`
          : `Deep Read is a Magic Plus feature — free accounts get ${this.freeDaily} pages a day to try it. Upgrade to Magic Plus for ${this.premiumDaily} pages/day.`,
        retryable: false,
      });
    }

    // Preprocess up front — a bad page fails the request NOW with a precise
    // message instead of poisoning the job later in the background.
    const prepared: Array<{
      buffer: Buffer;
      mime: string;
      contentHash: string;
    }> = [];
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      if (!file?.buffer?.length) {
        throw new BadRequestException(`Page ${i + 1} is empty — retake it.`);
      }
      if (file.size > MAX_PAGE_BYTES) {
        throw new BadRequestException(
          `Page ${i + 1} is too large (max 12 MB) — retake it closer to the page.`,
        );
      }
      try {
        prepared.push(await this.preprocess.prepare(file.buffer));
      } catch (err) {
        if (err instanceof PreprocessError) throw new BadRequestException(err.message);
        throw err;
      }
    }

    const cleanTitle = title?.trim().slice(0, 120) || null;

    const job = await this.prisma.deepReadJob.create({
      data: {
        userId,
        status: "queued",
        pageCount: prepared.length,
        title: cleanTitle,
        pages: {
          create: prepared.map((p, idx) => ({
            pageNumber: idx + 1,
            contentHash: p.contentHash,
            status: "pending",
          })),
        },
      },
      include: { pages: { orderBy: { pageNumber: "asc" } } },
    });

    // Persist page images (best effort — storage outage doesn't block OCR;
    // the in-memory buffers carry the job either way on a single instance).
    void this.persistPageImages(job.id, prepared).catch(() => undefined);

    // Kick off processing without awaiting the whole batch.
    void this.processJob(job.id, prepared).catch((err) => {
      this.logger.error(
        `Deep Read job ${job.id} crashed: ${err instanceof Error ? err.message : String(err)}`,
      );
      void this.prisma.deepReadJob.update({
        where: { id: job.id },
        data: { status: "failed" },
      });
    });

    const queuedAhead = await this.queuedJobsAhead();
    this.logger.log(
      `Deep Read job ${job.id} queued: ${prepared.length} pages for user ${userId} (${premium ? "premium" : "free"})`,
    );
    return { job: { id: job.id, status: job.status, pageCount: job.pageCount }, position: queuedAhead };
  }

  /** Job detail with page results — ownership enforced. */
  async getJob(userId: string, jobId: string) {
    const job = await this.prisma.deepReadJob.findFirst({
      where: { id: jobId, userId },
      include: { pages: { orderBy: { pageNumber: "asc" } } },
    });
    if (!job) throw new NotFoundException("Deep Read job not found.");
    return { job: this.serializeJob(job) };
  }

  /** Job history for the student's Deep Read library. */
  async listJobs(userId: string, limit = 30) {
    const jobs = await this.prisma.deepReadJob.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: Math.min(50, Math.max(1, limit)),
      include: { pages: { orderBy: { pageNumber: "asc" } } },
    });
    return { jobs: jobs.map((j) => this.serializeJob(j)) };
  }

  /** Student corrected a transcription on the review screen. */
  async updatePageText(
    userId: string,
    jobId: string,
    pageId: string,
    text: string,
  ) {
    const job = await this.prisma.deepReadJob.findFirst({
      where: { id: jobId, userId },
      select: { id: true },
    });
    if (!job) throw new NotFoundException("Deep Read job not found.");
    const clean = text.slice(0, MAX_TEXT_CHARS);
    const page = await this.prisma.deepReadPage.update({
      where: { id: pageId },
      data: {
        text: clean,
        edited: true,
        blocks: blocksToJson(parseBlocksFromText(clean)) as Prisma.InputJsonValue,
      },
    });
    return { page: { id: page.id, text: page.text, edited: page.edited } };
  }

  /** Quota snapshot for the app UI. */
  async quota(userId: string) {
    const status = await this.entitlement.status(userId);
    const premium = status.isPremium;
    const dailyLimit = premium ? this.premiumDaily : this.freeDaily;
    const used = await this.pagesUsedToday(userId);
    return {
      premium,
      dailyLimit,
      usedToday: used,
      remainingToday: Math.max(0, dailyLimit - used),
      resetsAt: "midnight UTC",
    };
  }

  // ── Worker ──────────────────────────────────────────────────

  private async processJob(
    jobId: string,
    prepared: Array<{ buffer: Buffer; mime: string; contentHash: string }>,
  ) {
    await this.prisma.deepReadJob.update({
      where: { id: jobId },
      data: { status: "processing" },
    });

    const job = await this.prisma.deepReadJob.findUnique({
      where: { id: jobId },
      include: { pages: { orderBy: { pageNumber: "asc" } } },
    });
    if (!job) return;

    let completed = 0;
    let failed = 0;
    let hardestTier: "deep_read" | "rescue" | null = null;

    for (let i = 0; i < job.pages.length; i += 1) {
      const page = job.pages[i];
      const image = prepared[i];
      try {
        const result = await this.transcribePage(image);
        // Track the best engine that produced any text (pro > rescue) —
        // honest reporting: if every page needed rescue, say so.
        if (hardestTier !== "deep_read") {
          hardestTier = result.tier;
        }

        const blocks = parseBlocksFromText(result.text);
        await this.prisma.deepReadPage.update({
          where: { id: page.id },
          data: {
            status: result.readable ? "done" : "empty",
            engine: result.tier,
            confidence: result.confidence,
            text: result.text.slice(0, MAX_TEXT_CHARS) || null,
            blocks: blocksToJson(blocks) as Prisma.InputJsonValue,
            latencyMs: result.latencyMs,
            completedAt: new Date(),
            errorMessage: result.truncated
              ? "Page too dense — output truncated. Try photographing the page in two halves."
              : null,
          },
        });
        if (result.readable) completed += 1;
        else failed += 1;
      } catch (err) {
        const message =
          err instanceof TranscribeError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);
        this.logger.warn(
          `Deep Read page ${page.id} failed: ${message}`,
        );
        await this.prisma.deepReadPage
          .update({
            where: { id: page.id },
            data: {
              status: "failed",
              errorMessage: message.slice(0, 300),
              completedAt: new Date(),
            },
          })
          .catch(() => undefined);
        failed += 1;
      }

      // Progress checkpoint after each page.
      await this.prisma.deepReadJob
        .update({
          where: { id: jobId },
          data: { completedPages: completed, failedPages: failed },
        })
        .catch(() => undefined);
    }

    await this.prisma.deepReadJob.update({
      where: { id: jobId },
      data: {
        status: failed === 0 ? "done" : completed > 0 ? "partially_failed" : "failed",
        completedPages: completed,
        failedPages: failed,
        bestEngine: hardestTier,
        completedAt: new Date(),
      },
    });

    // Push notification — the async UX promise. Never blocks the job result.
    const nDone = completed;
    const nTotal = job.pages.length;
    void this.notifications
      .notifyUser(
        job.userId,
        nDone > 0 ? "Your notes are ready 📖" : "Deep Read couldn't read those pages",
        nDone > 0
          ? `${nDone} of ${nTotal} pages transcribed${nTotal > 1 && failed > 0 ? ` — ${failed} need a retake` : ""}. Open Deep Read to review.`
          : "The photos were too unclear. Retake them with good lighting, filling the frame.",
        { data: { kind: "deep_read", jobId } },
      )
      .catch(() => undefined);

    this.logger.log(
      `Deep Read job ${jobId} finished: ${completed}/${nTotal} pages (engine ${hardestTier ?? "n/a"})`,
    );
  }

  /** One page → cache or live transcription with Pro → rescue fallback. */
  private async transcribePage(image: {
    buffer: Buffer;
    mime: string;
    contentHash: string;
  }): Promise<{ text: string; readable: boolean; tier: "deep_read" | "rescue"; confidence: number | null; latencyMs: number; truncated: boolean }> {
    const cached = await this.cache.get(image.contentHash);
    if (cached) {
      return { ...cached, readable: cached.text.length >= 4, latencyMs: 0 };
    }

    const release = await this.semaphore.acquire();
    try {
      const base64 = image.buffer.toString("base64");
      try {
        const result = await this.transcribe.transcribeDeepRead({ base64, mime: image.mime });
        await this.cache.set(image.contentHash, {
          text: result.text,
          tier: result.tier,
          confidence: result.confidence,
          truncated: result.truncated,
        });
        return result;
      } catch (proErr) {
        // Pro failed hard — rescue on the flash tier so a paying student
        // gets text rather than a dead page. Cache the rescue result too.
        const isHardFail =
          proErr instanceof TranscribeError ? !proErr.transient : false;
        if (isHardFail && !(proErr instanceof TranscribeError && /blocked/i.test(proErr.message))) {
          this.logger.warn(
            `Deep Read pro pass failed hard, using rescue: ${proErr instanceof Error ? proErr.message : String(proErr)}`,
          );
          const rescue = await this.transcribe.transcribeRescue({
            base64,
            mime: image.mime,
          });
          await this.cache.set(image.contentHash, {
            text: rescue.text,
            tier: "rescue",
            confidence: rescue.confidence,
            truncated: rescue.truncated,
          });
          return rescue;
        }
        throw proErr;
      }
    } finally {
      release();
    }
  }

  // ── Helpers ─────────────────────────────────────────────────

  private async pagesUsedToday(userId: string): Promise<number> {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const agg = await this.prisma.deepReadPage.aggregate({
      _count: { _all: true },
      where: {
        job: { userId },
        createdAt: { gte: start },
      },
    });
    return agg._count._all;
  }

  private async queuedJobsAhead(): Promise<number> {
    const n = await this.prisma.deepReadJob.count({ where: { status: "queued" } });
    return Math.max(0, n - 1);
  }

  /** Crash recovery: jobs stuck in processing/queued for > 15 min → failed. */
  private async sweepStaleJobs() {
    try {
      const cutoff = new Date(Date.now() - 15 * 60 * 1000);
      const stale = await this.prisma.deepReadJob.findMany({
        where: {
          status: { in: ["queued", "processing"] },
          createdAt: { lt: cutoff },
        },
        select: { id: true },
        take: 10,
      });
      for (const job of stale) {
        await this.prisma.deepReadJob.update({
          where: { id: job.id },
          data: {
            status: "failed",
            completedAt: new Date(),
          },
        });
        await this.prisma.deepReadPage.updateMany({
          where: { jobId: job.id, status: { in: ["pending", "processing"] } },
          data: { status: "failed", errorMessage: "Job timed out — please retry." },
        });
        this.logger.warn(`Deep Read job ${job.id} swept as stale`);
      }
    } catch (err) {
      this.logger.warn(
        `Deep Read sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async persistPageImages(
    jobId: string,
    prepared: Array<{ buffer: Buffer; mime: string; contentHash: string }>,
  ) {
    if (!this.storage.isEnabled) return;
    for (let i = 0; i < prepared.length; i += 1) {
      const key = `deep-read/${jobId}/page-${i + 1}.jpg`;
      const stored = await this.storage.put(key, prepared[i].buffer, prepared[i].mime);
      if (stored) {
        await this.prisma.deepReadPage
          .updateMany({
            where: { jobId, pageNumber: i + 1 },
            data: { imageRef: key },
          })
          .catch(() => undefined);
      }
    }
  }

  private serializeJob(job: {
    id: string;
    status: string;
    pageCount: number;
    completedPages: number;
    failedPages: number;
    bestEngine: string | null;
    title: string | null;
    createdAt: Date;
    completedAt: Date | null;
    pages: Array<{
      id: string;
      pageNumber: number;
      status: string;
      engine: string | null;
      confidence: number | null;
      text: string | null;
      blocks: unknown;
      edited: boolean;
      errorMessage: string | null;
      imageRef: string | null;
    }>;
  }) {
    return {
      id: job.id,
      status: job.status,
      pageCount: job.pageCount,
      completedPages: job.completedPages,
      failedPages: job.failedPages,
      bestEngine: job.bestEngine,
      title: job.title,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
      pages: job.pages.map((p) => ({
        id: p.id,
        pageNumber: p.pageNumber,
        status: p.status,
        engine: p.engine,
        confidence: p.confidence,
        text: p.text,
        blocks: p.blocks,
        edited: p.edited,
        errorMessage: p.errorMessage,
        imageRef: p.imageRef,
      })),
    };
  }
}
