import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { DeepReadService } from "./deepread.service";
import { DeepReadPreprocessService } from "./deepread-preprocess.service";
import { DeepReadTranscribeService } from "./deepread-transcribe.service";
import { DeepReadCacheService } from "./deepread-cache.service";
import { StorageService } from "../storage/storage.service";
import { NotificationsService } from "../notifications/notifications.service";
import { EntitlementService } from "../entitlement/entitlement.service";
import { PrismaService } from "../prisma/prisma.service";
import { parseBlocksFromText, blocksToJson } from "./deepread-blocks";
import { estimateConfidence } from "./deepread-transcribe.service";

// ── Block parser ─────────────────────────────────────────────

describe("parseBlocksFromText", () => {
  it("parses headings, paragraphs, bullets and outline items", () => {
    const raw = [
      "PHOTOSYNTHESIS",
      "Photosynthesis converts light energy",
      "into chemical energy.",
      "• light-dependent reactions",
      "• Calvin cycle",
      "1. Light absorption",
      "2. Electron transport",
      "[diagram: chloroplast with arrows]",
    ].join("\n");

    const blocks = parseBlocksFromText(raw);
    expect(blocks[0]).toEqual({ type: "heading", text: "PHOTOSYNTHESIS", level: 1 });
    expect(blocks[1].type).toBe("paragraph");
    expect(blocks[1].text).toBe("Photosynthesis converts light energy into chemical energy.");
    expect(blocks[2]).toEqual({ type: "list_item", text: "light-dependent reactions" });
    expect(blocks[3]).toEqual({ type: "list_item", text: "Calvin cycle" });
    expect(blocks[4]).toEqual({ type: "list_item", text: "1. Light absorption" });
    expect(blocks[5]).toEqual({ type: "list_item", text: "2. Electron transport" });
    expect(blocks[6]).toEqual({ type: "diagram", text: "chloroplast with arrows" });
  });

  it("keeps course codes intact and never merges two sentences across bullets", () => {
    const blocks = parseBlocksFromText("CHM 101 — week 3\n• w/ catalyst\n• no catalyst");
    expect(blocks[0].text).toContain("CHM 101");
    expect(blocks).toHaveLength(3);
  });

  it("produces JSON-safe block objects", () => {
    const json = blocksToJson(parseBlocksFromText("TITLE\nBody text here."));
    expect(() => JSON.stringify(json)).not.toThrow();
  });
});

// ── Confidence estimate ──────────────────────────────────────

describe("estimateConfidence", () => {
  it("scores clean text high", () => {
    expect(estimateConfidence("The Krebs cycle occurs in the mitochondrial matrix.".repeat(3))).toBeGreaterThan(85);
  });
  it("penalises illegibility markers", () => {
    expect(estimateConfidence("[?] [?] [?] the [?] process")).toBeLessThan(estimateConfidence("a normal length transcription of a handwritten page of notes"));
  });
  it("scores empty text zero", () => {
    expect(estimateConfidence("")).toBe(0);
  });
});

// ── Service ──────────────────────────────────────────────────

describe("DeepReadService", () => {
  let service: DeepReadService;
  let prisma: {
    deepReadJob: Record<string, jest.Mock>;
    deepReadPage: Record<string, jest.Mock>;
  };
  let transcribe: { transcribeDeepRead: jest.Mock; transcribeRescue: jest.Mock };
  let cache: { get: jest.Mock; set: jest.Mock };
  let entitlement: { status: jest.Mock };

  const mockJobRecord = {
    id: "job-1",
    userId: "user-1",
    status: "queued",
    pageCount: 1,
    completedPages: 0,
    failedPages: 0,
    bestEngine: null,
    title: "BIO notes",
    createdAt: new Date(),
    completedAt: null,
    pages: [
      {
        id: "page-1",
        pageNumber: 1,
        status: "pending",
        engine: null,
        confidence: null,
        text: null,
        blocks: null,
        edited: false,
        errorMessage: null,
        imageRef: null,
      },
    ],
  };

  beforeEach(async () => {
    prisma = {
      deepReadJob: {
        create: jest.fn().mockResolvedValue(mockJobRecord),
        findUnique: jest.fn().mockResolvedValue(mockJobRecord),
        findFirst: jest.fn().mockResolvedValue(mockJobRecord),
        findMany: jest.fn().mockResolvedValue([mockJobRecord]),
        update: jest.fn().mockResolvedValue(mockJobRecord),
        count: jest.fn().mockResolvedValue(1),
      },
      deepReadPage: {
        update: jest.fn().mockResolvedValue({ id: "page-1", text: "x", edited: true }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        aggregate: jest.fn().mockResolvedValue({ _count: { _all: 0 } }),
      },
    };
    transcribe = {
      transcribeDeepRead: jest.fn(),
      transcribeRescue: jest.fn(),
    };
    cache = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) };
    entitlement = {
      status: jest.fn().mockResolvedValue({ isPremium: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeepReadService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: DeepReadPreprocessService, useValue: { prepare: jest.fn(async (b: Buffer) => ({ buffer: b, mime: "image/jpeg", contentHash: "hash-" + b.length, width: 100, height: 100, bytes: b.length })) } },
        { provide: DeepReadTranscribeService, useValue: transcribe },
        { provide: DeepReadCacheService, useValue: cache },
        { provide: StorageService, useValue: { isEnabled: false, put: jest.fn(), getBuffer: jest.fn(), presignedGetUrl: jest.fn() } },
        { provide: NotificationsService, useValue: { notifyUser: jest.fn().mockResolvedValue(true) } },
        { provide: EntitlementService, useValue: entitlement },
      ],
    }).compile();

    service = module.get<DeepReadService>(DeepReadService);
  });

  const fakePage = (bytes: string): Express.Multer.File =>
    ({
      buffer: Buffer.from(bytes),
      size: Buffer.byteLength(bytes),
      originalname: "page-1.jpg",
      mimetype: "image/jpeg",
      fieldname: "pages",
      encoding: "7bit",
    }) as unknown as Express.Multer.File;

  const onePage = () => [fakePage("fake-jpeg-bytes")];

  it("rejects an empty job", async () => {
    await expect(service.createJob("user-1", [])).rejects.toThrow(BadRequestException);
  });

  it("rejects more than 15 pages", async () => {
    const files = Array.from({ length: 16 }, (_, i) => fakePage(`page-${i}`));
    await expect(service.createJob("user-1", files)).rejects.toThrow(BadRequestException);
  });

  it("enforces the daily page quota for premium users", async () => {
    prisma.deepReadPage.aggregate.mockResolvedValue({ _count: { _all: 30 } });
    await expect(
      service.createJob("user-1", onePage(), "BIO"),
    ).rejects.toThrow(ForbiddenException);
  });

  it("enforces the Magic Plus gate for free users", async () => {
    entitlement.status.mockResolvedValue({ isPremium: false });
    prisma.deepReadPage.aggregate.mockResolvedValue({ _count: { _all: 2 } });
    await expect(
      service.createJob("user-1", onePage()),
    ).rejects.toThrow(ForbiddenException);
  });

  it("creates a job and processes pages, preferring pro results", async () => {
    transcribe.transcribeDeepRead.mockResolvedValue({
      text: "PHOTOSYNTHESIS\nLight reactions occur in the thylakoid.",
      readable: true,
      tier: "deep_read",
      confidence: 92,
      latencyMs: 1200,
      truncated: false,
    });
    const { job } = await service.createJob("user-1", onePage(), "BIO notes");
    expect(job.pageCount).toBe(1);
    // Let the fire-and-forget worker settle.
    await new Promise((r) => setTimeout(r, 30));
    expect(transcribe.transcribeDeepRead).toHaveBeenCalledTimes(1);
    expect(prisma.deepReadPage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "page-1" },
        data: expect.objectContaining({ status: "done", engine: "deep_read" }),
      }),
    );
    expect(prisma.deepReadJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-1" },
        data: expect.objectContaining({ status: "done", bestEngine: "deep_read" }),
      }),
    );
    // Completion notification fires for the user.
    const notifications = (service as unknown as { notifications: { notifyUser: jest.Mock } }).notifications;
    expect(notifications.notifyUser).toHaveBeenCalledWith(
      "user-1",
      expect.stringContaining("ready"),
      expect.any(String),
      expect.any(Object),
    );
  });

  it("falls back to the rescue tier when pro fails hard and still completes", async () => {
    const { TranscribeError } = await import("./deepread-transcribe.service");
    transcribe.transcribeDeepRead.mockRejectedValue(
      new TranscribeError("Gemini HTTP 404 — model gone", false),
    );
    transcribe.transcribeRescue.mockResolvedValue({
      text: "rescued text from the flash tier",
      readable: true,
      tier: "rescue",
      confidence: 70,
      latencyMs: 900,
      truncated: false,
    });
    await service.createJob("user-1", onePage());
    await new Promise((r) => setTimeout(r, 30));
    expect(transcribe.transcribeRescue).toHaveBeenCalledTimes(1);
    expect(prisma.deepReadPage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "done", engine: "rescue" }),
      }),
    );
  });

  it("never calls the API when the page content hash is cached", async () => {
    cache.get.mockResolvedValue({ text: "cached text", tier: "deep_read", confidence: 90, truncated: false });
    await service.createJob("user-1", onePage());
    await new Promise((r) => setTimeout(r, 30));
    expect(transcribe.transcribeDeepRead).not.toHaveBeenCalled();
    expect(prisma.deepReadPage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "done" }),
      }),
    );
  });

  it("getJob enforces ownership (job of another user = not found)", async () => {
    prisma.deepReadJob.findFirst.mockResolvedValue(null);
    await expect(service.getJob("user-2", "job-1")).rejects.toThrow(NotFoundException);
  });

  it("updatePageText re-parses blocks and marks the page edited", async () => {
    const result = await service.updatePageText("user-1", "job-1", "page-1", "TITLE\nSome corrected text.");
    expect(result.page.edited).toBe(true);
    expect(prisma.deepReadPage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "page-1" },
        data: expect.objectContaining({ edited: true }),
      }),
    );
  });
});
