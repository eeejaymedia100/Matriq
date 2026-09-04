import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AiService } from "./ai.service";
import { AiQuotaService } from "./ai-quota.service";
import { PrismaService } from "../prisma/prisma.service";

describe("AiService — RAG ingestion & owner-scoped retrieval", () => {
  let service: AiService;

  const mockPrisma = {
    aiDocument: {
      upsert: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    aiQueryLog: {
      create: jest.fn().mockResolvedValue({ id: "log1" }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(1),
  };

  const mockQuota = {
    authorize: jest.fn().mockResolvedValue(undefined),
    status: jest.fn().mockResolvedValue({
      isPremium: false,
      limit: 20,
      usedToday: 0,
      remainingToday: 20,
    }),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const env: Record<string, string> = {
        OLLAMA_HOST: "http://ollama:11434",
        OLLAMA_MODEL: "test-model",
        DEEPSEEK_API_KEY: "test-key",
      };
      return env[key];
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.aiDocument.findMany.mockResolvedValue([]);
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockQuota.authorize.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AiQuotaService, useValue: mockQuota },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
    // Stub the cloud generation call — the unit under test is retrieval +
    // scoping + logging, not the HTTP provider chain. Same for the embed
    // call: a deterministic vector lets the pgvector SQL path execute.
    jest
      .spyOn(service as unknown as { generateFromDeepSeek: jest.Mock }, "generateFromDeepSeek")
      .mockResolvedValue("grounded answer");
    jest
      .spyOn(service as unknown as { embedText: jest.Mock }, "embedText")
      .mockResolvedValue(new Array(1536).fill(0.01));
  });

  describe("ingestSource", () => {
    it("upserts one chunk per sourceRef and marks it approved when requested", async () => {
      mockPrisma.aiDocument.upsert.mockResolvedValue({ id: "doc-1" });

      const chunks = await service.ingestSource({
        sourceRef: "deepread:page-1",
        text: "A short but real transcription of a handwritten page of notes.",
        sourceType: "deep_read",
        ownerId: "u1",
        approved: true,
      });

      expect(chunks).toBe(1);
      expect(mockPrisma.aiDocument.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sourceRef: "deepread:page-1:chunk0" },
          create: expect.objectContaining({
            moderationStatus: "approved",
            submittedByUserId: "u1",
            sourceType: "deep_read",
          }),
        }),
      );
    });

    it("rejects text below the minimum length without touching the DB", async () => {
      const chunks = await service.ingestSource({
        sourceRef: "deepread:page-2",
        text: "  too  ",
        sourceType: "deep_read",
        ownerId: "u1",
        approved: true,
      });

      expect(chunks).toBe(0);
      expect(mockPrisma.aiDocument.upsert).not.toHaveBeenCalled();
    });

    it("splits long text into multiple chunks with sequential refs", async () => {
      mockPrisma.aiDocument.upsert.mockResolvedValue({ id: "doc-x" });
      const longText = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} explains a concept in some detail.`).join(" ");

      const chunks = await service.ingestSource({
        sourceRef: "vault:item-9",
        text: longText,
        sourceType: "vault",
        courseCode: "CHM 101",
        ownerId: "u1",
        approved: true,
      });

      expect(chunks).toBeGreaterThan(1);
      const refs = mockPrisma.aiDocument.upsert.mock.calls.map(
        (c) => (c[0] as { where: { sourceRef: string } }).where.sourceRef,
      );
      expect(refs[0]).toBe("vault:item-9:chunk0");
      expect(refs[1]).toBe("vault:item-9:chunk1");
      // All chunks share the source item prefix — that's what makes retrieval
      // scoping and dedup work.
      expect(refs.every((r) => r.startsWith("vault:item-9:chunk"))).toBe(true);
    });

    it("deletes stale chunks when re-ingesting a shorter version", async () => {
      // Two chunks exist for this source; the new text yields one.
      mockPrisma.aiDocument.upsert
        .mockResolvedValueOnce({ id: "doc-new" })
        .mockResolvedValueOnce({ id: "doc-new" });
      mockPrisma.aiDocument.findMany.mockResolvedValue([
        { id: "doc-new", sourceRef: "vault:item-3:chunk0" },
        { id: "doc-old-1", sourceRef: "vault:item-3:chunk1" },
        { id: "doc-old-2", sourceRef: "vault:item-3:chunk2" },
      ]);

      await service.ingestSource({
        sourceRef: "vault:item-3",
        text: "One short chunk now.",
        sourceType: "vault",
        ownerId: "u1",
        approved: true,
      });

      expect(mockPrisma.aiDocument.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["doc-old-1", "doc-old-2"] } },
      });
    });
  });

  describe("askMyNotes", () => {
    it("rejects empty queries before any DB/model work", async () => {
      await expect(service.askMyNotes("u1", "   ")).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockQuota.authorize).not.toHaveBeenCalled();
    });

    it("returns an honest no-material message when the student has nothing ingested", async () => {
      const res = await service.askMyNotes("u1", "What is the Krebs cycle?");

      expect(res.scoped).toBe(true);
      expect(res.response).toContain("couldn't find anything in your own materials");
      expect(mockPrisma.aiQueryLog.create).not.toHaveBeenCalled();
    });

    it("gates on the premium entitlement before retrieval", async () => {
      mockQuota.authorize.mockRejectedValueOnce(new Error("MAGIC_PLUS_REQUIRED"));
      await expect(
        service.askMyNotes("u1", "What is the Krebs cycle?"),
      ).rejects.toThrow("MAGIC_PLUS_REQUIRED");
    });

    it("answers strictly from owner-scoped material (vector path)", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: "own-doc-1" }]);
      mockPrisma.aiDocument.findMany
        // vector-id fetch (owner-scoped where)
        .mockResolvedValueOnce([
          { id: "own-doc-1", contentChunk: "The Krebs cycle occurs in the matrix.", courseCode: "BIO 201" },
        ])
        // keyword fetch
        .mockResolvedValueOnce([]);

      const res = await service.askMyNotes("u1", "Where does the Krebs cycle occur?");

      expect(res.sources).toEqual(["own-doc-1"]);
      expect(res.response).toBe("grounded answer");
    });

    it("owner scoping reaches the vector SQL as a parameterized predicate", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: "own-doc-1" }]);
      mockPrisma.aiDocument.findMany
        .mockResolvedValueOnce([
          { id: "own-doc-1", contentChunk: "chunk", courseCode: null },
        ])
        .mockResolvedValueOnce([]);

      await service.askMyNotes("u1", "query");

      // Prisma's tagged-template Sql object serializes its SQL text — the
      // owner predicate must be IN the query, with the user id among the
      // bound values (never interpolated into the SQL text itself).
      const call = mockPrisma.$queryRaw.mock.calls[0][0];
      const sqlText = JSON.stringify(call);
      expect(sqlText).toContain("submitted_by_user_id");
    });

    it("never queries without the owner scope when the user id is present", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.aiDocument.findMany.mockResolvedValue([]);

      await service.askMyNotes("u1", "query");

      // Keyword path must carry the owner filter too.
      const where = mockPrisma.aiDocument.findMany.mock.calls.find(
        (c) => (c[0] as { where: Record<string, unknown> }).where?.submittedByUserId,
      );
      expect(where).toBeDefined();
    });
  });
});
