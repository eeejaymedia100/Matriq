import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { AiService } from "./ai.service";
import { PrismaService } from "../prisma/prisma.service";

describe("AiService", () => {
  let service: AiService;

  const mockPrisma = {
    aiDocument: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    aiQueryLog: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([]), // vector search: no matches
    $executeRaw: jest.fn().mockResolvedValue([{ id: "x" }]),
  };

  const env: Record<string, string> = {
    OLLAMA_HOST: "http://ollama:11434",
    OLLAMA_MODEL: "test-model",
  };

  const mockConfigService = {
    get: jest.fn((key: string) => env[key]),
  };

  const mockFetch = jest.fn();
  const originalFetch = global.fetch;

  const ollamaOkResponse = (content: string) => ({
    ok: true,
    json: jest.fn().mockResolvedValue({
      message: { role: "assistant", content },
      done: true,
    }),
  });

  beforeEach(async () => {
    global.fetch = mockFetch as unknown as typeof fetch;
    mockFetch.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should return a real Ollama response when the model is reachable", async () => {
    mockPrisma.aiDocument.findMany.mockResolvedValue([]);
    mockPrisma.aiQueryLog.create.mockResolvedValue({ id: "log1" });
    mockFetch.mockResolvedValue(
      ollamaOkResponse("Photosynthesis is the process..."),
    );

    const result = await service.query("u1", {
      query: "What is photosynthesis?",
    });

    expect(result.response).toBe("Photosynthesis is the process...");
    expect(result.sources).toEqual([]);

    // The Ollama chat endpoint should be called with the configured model.
    const chatCall = mockFetch.mock.calls.find(([url]) =>
      String(url).endsWith("/api/chat"),
    );
    expect(chatCall).toBeDefined();
    const [url, init] = chatCall as [string, RequestInit];
    expect(url).toBe("http://ollama:11434/api/chat");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("test-model");
    expect(body.stream).toBe(false);
    expect(mockPrisma.aiQueryLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          responseText: "Photosynthesis is the process...",
        }),
      }),
    );
  });

  it("should include retrieved material context in the prompt sent to Ollama", async () => {
    mockPrisma.aiDocument.findMany.mockResolvedValue([
      {
        id: "doc1",
        contentChunk: "Cellular respiration happens in the mitochondria.",
        courseCode: "BIO101",
      },
    ]);
    mockPrisma.aiQueryLog.create.mockResolvedValue({ id: "log1" });
    mockFetch.mockResolvedValue(ollamaOkResponse("In the mitochondria."));

    const result = await service.query("u1", {
      query: "Where does respiration occur?",
    });

    expect(result.sources).toEqual(["doc1"]);
    const chatCall = mockFetch.mock.calls.find(([url]) =>
      String(url).endsWith("/api/chat"),
    );
    const [, init] = chatCall as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages[0].role).toBe("system");
    expect(messages[1].content).toContain("BIO101");
    expect(messages[1].content).toContain("mitochondria");
    expect(result.response).toBe("In the mitochondria.");
  });

  it("should fall back to a placeholder when Ollama is unreachable", async () => {
    mockPrisma.aiDocument.findMany.mockResolvedValue([]);
    mockPrisma.aiQueryLog.create.mockResolvedValue({ id: "log1" });
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await service.query("u1", {
      query: "What is a derivative?",
    });

    expect(result.response).toContain("temporarily unavailable");
    expect(result.sources).toEqual([]);
    expect(mockPrisma.aiQueryLog.create).toHaveBeenCalled();
  });

  it("should fall back when Ollama returns a non-OK status", async () => {
    mockPrisma.aiDocument.findMany.mockResolvedValue([]);
    mockPrisma.aiQueryLog.create.mockResolvedValue({ id: "log1" });
    mockFetch.mockResolvedValue({ ok: false, status: 503 });

    const result = await service.query("u1", { query: "Test" });

    expect(result.response).toContain("temporarily unavailable");
  });

  it("should sanitize HTML tags out of model output", async () => {
    mockPrisma.aiDocument.findMany.mockResolvedValue([]);
    mockPrisma.aiQueryLog.create.mockResolvedValue({ id: "log1" });
    mockFetch.mockResolvedValue(
      ollamaOkResponse(
        "Safe answer <script>alert(1)</script><style>.x{}</style> done.",
      ),
    );

    const result = await service.query("u1", { query: "Test" });

    expect(result.response).not.toContain("<script>");
    expect(result.response).not.toContain("</script>");
    expect(result.response).not.toContain("<style>");
    expect(result.response).not.toContain("</style>");
    expect(result.response).toContain("Safe answer");
    expect(result.response).toContain("done.");
  });

  it("should reject empty queries", async () => {
    await expect(service.query("u1", { query: "" })).rejects.toThrow(
      "Query cannot be empty",
    );
  });

  it("should reject queries over 1000 characters", async () => {
    await expect(
      service.query("u1", { query: "a".repeat(1001) }),
    ).rejects.toThrow("Query is too long");
  });

  it("should get conversation history", async () => {
    mockPrisma.aiQueryLog.findMany.mockResolvedValue([
      {
        id: "1",
        queryText: "Test query",
        responseText: "Test response",
        createdAt: new Date(),
      },
    ]);

    const result = await service.getConversations("u1");
    expect(result.conversations).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it("should submit material for moderation", async () => {
    mockPrisma.aiDocument.create.mockResolvedValue({
      id: "doc1",
      sourceType: "past_question",
      moderationStatus: "pending",
    });

    const result = await service.submitMaterial("u1", {
      sourceType: "past_question",
      courseCode: "BIO101",
      contentChunk: "Describe the process of cellular respiration in detail.",
    });

    expect(result.id).toBe("doc1");
    expect(mockPrisma.aiDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          moderationStatus: "pending",
          submittedByUserId: "u1",
        }),
      }),
    );
  });
});
