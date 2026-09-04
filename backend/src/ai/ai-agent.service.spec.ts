import { Test, TestingModule } from "@nestjs/testing";
import { AgentToolsService } from "./ai-agent-tools.service";
import { AiAgentService } from "./ai-agent.service";
import { PrismaService } from "../prisma/prisma.service";

describe("AgentToolsService — allowlist & ownership", () => {
  let tools: AgentToolsService;
  const mockPrisma = {
    aiDocument: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    vaultItem: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentToolsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    tools = module.get<AgentToolsService>(AgentToolsService);
  });

  it("exposes a small, explicit tool manifest", () => {
    const names = AgentToolsService.MANIFEST.map((t) => t.name);
    expect(names).toEqual([
      "search_my_notes",
      "read_document",
      "search_library",
      "explain",
    ]);
  });

  it("rejects unknown tools (allowlist enforcement)", async () => {
    const res = await tools.call("u1", "delete_all_documents", {});
    expect(res.error).toMatch(/Unknown tool/);
  });

  it("search_my_notes requires a query", async () => {
    const res = await tools.call("u1", "search_my_notes", {});
    expect(res.error).toMatch(/query is required/);
  });

  it("search_my_notes scopes the query to the student's own material", async () => {
    mockPrisma.aiDocument.findMany.mockResolvedValueOnce([
      { id: "d1", contentChunk: "Krebs cycle text", courseCode: "BIO 201" },
    ]);

    const res = await tools.call("u1", "search_my_notes", { query: "krebs cycle" });

    const where = mockPrisma.aiDocument.findMany.mock.calls[0][0].where;
    expect(where.submittedByUserId).toBe("u1");
    expect(where.moderationStatus).toBe("approved");
    expect(res.result).toMatchObject({ found: true });
  });

  it("read_document denies another student's private item", async () => {
    mockPrisma.vaultItem.findUnique.mockResolvedValueOnce({
      id: "victim-doc",
      userId: "someone-else",
      visibility: "private",
      moderationStatus: "approved",
      hidden: false,
      deletedAt: null,
      courseCode: "CHM 101",
      title: "Private notes",
    });

    const res = await tools.call("u1", "read_document", { itemId: "victim-doc" });
    expect(res.error).toBe("Not allowed");
  });

  it("read_document allows the owner and prefers ingested chunks", async () => {
    mockPrisma.vaultItem.findUnique.mockResolvedValueOnce({
      id: "my-doc",
      userId: "u1",
      visibility: "private",
      moderationStatus: "approved",
      hidden: false,
      deletedAt: null,
      courseCode: "CHM 101",
      title: "My notes",
    });
    mockPrisma.aiDocument.findMany.mockResolvedValueOnce([
      { contentChunk: "ingested chunk text" },
    ]);

    const res = await tools.call("u1", "read_document", { itemId: "my-doc" });
    expect(res.error).toBeUndefined();
    expect(res.result).toMatchObject({ title: "My notes", course: "CHM 101" });
  });

  it("read_document hides deleted/hidden items even from admins of nothing", async () => {
    mockPrisma.vaultItem.findUnique.mockResolvedValueOnce({
      id: "gone",
      userId: "u1",
      visibility: "private",
      moderationStatus: "approved",
      hidden: true,
      deletedAt: null,
      courseCode: null,
      title: "Hidden",
    });
    const res = await tools.call("u1", "read_document", { itemId: "gone" });
    expect(res.error).toBe("Document not found");
  });

  it("search_library only surfaces approved public documents", async () => {
    mockPrisma.vaultItem.findMany.mockResolvedValueOnce([
      { id: "lib1", title: "CHM 101 Past Questions", courseCode: "CHM 101", type: "past_question" },
    ]);

    const res = await tools.call("u1", "search_library", { query: "CHM 101" });

    const where = mockPrisma.vaultItem.findMany.mock.calls[0][0].where;
    expect(where.visibility).toBe("public");
    expect(where.moderationStatus).toBe("approved");
    expect(where.hidden).toBe(false);
    expect(where.deletedAt).toBeNull();
    expect((res.result as { results: unknown[] }).results).toHaveLength(1);
  });

  it("explain rejects a missing concept", async () => {
    const res = await tools.call("u1", "explain", {});
    expect(res.error).toMatch(/concept is required/);
  });
});

describe("AiAgentService — loop safety", () => {
  let agent: AiAgentService;
  let tools: { call: jest.Mock };

  beforeEach(async () => {
    tools = { call: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiAgentService,
        { provide: AgentToolsService, useValue: tools },
      ],
    }).compile();
    agent = module.get<AiAgentService>(AiAgentService);
  });

  it("answers directly when the model says so (no tools)", async () => {
    jest
      // Access the private plan request for stubbing — unit boundary.
      .spyOn(agent as unknown as { requestPlan: jest.Mock }, "requestPlan")
      .mockResolvedValueOnce({ action: "answer", answer: "Direct answer." });

    const res = await agent.run("u1", "what is mitosis?", { surface: "chat" });

    expect(res.answer).toBe("Direct answer.");
    expect(res.mode).toBe("model");
    expect(res.toolCalls).toHaveLength(0);
  });

  it("executes a tool then answers from the observation", async () => {
    const planSpy = jest
      .spyOn(agent as unknown as { requestPlan: jest.Mock }, "requestPlan")
      .mockResolvedValueOnce({
        action: "call",
        tool: "search_my_notes",
        input: { query: "mitosis" },
      })
      .mockResolvedValueOnce({ action: "answer", answer: "Found it in your BIO 201 notes." });

    tools.call.mockResolvedValueOnce({
      result: { found: true, chunks: [{ course: "BIO 201", text: "Mitosis is…" }] },
    });

    const res = await agent.run("u1", "explain mitosis from my notes", {
      surface: "reader",
      docTitle: "Cell division.pdf",
    });

    expect(tools.call).toHaveBeenCalledWith("u1", "search_my_notes", {
      query: "mitosis",
    });
    expect(planSpy).toHaveBeenCalledTimes(2);
    expect(res.answer).toContain("BIO 201");
    expect(res.toolCalls[0]).toMatchObject({ tool: "search_my_notes", ok: true });
  });

  it("degrades safely when the model is unreachable after a tool ran", async () => {
    jest
      .spyOn(agent as unknown as { requestPlan: jest.Mock }, "requestPlan")
      .mockResolvedValueOnce({
        action: "call",
        tool: "search_my_notes",
        input: { query: "osmosis" },
      })
      .mockResolvedValueOnce(null); // model died mid-loop

    tools.call.mockResolvedValueOnce({
      result: { found: true, chunks: [{ course: "BIO 101", text: "Osmosis is…" }] },
    });

    const res = await agent.run("u1", "what is osmosis?", { surface: "reader" });

    expect(res.mode).toBe("degraded");
    expect(res.answer).toContain("Osmosis is");
  });

  it("stops the loop after the step budget and reports failure honestly", async () => {
    jest
      .spyOn(agent as unknown as { requestPlan: jest.Mock }, "requestPlan")
      .mockResolvedValue({
        action: "call",
        tool: "search_my_notes",
        input: { query: "loop" },
      });
    tools.call.mockResolvedValue({ result: { found: false } });

    const res = await agent.run("u1", "endless", { surface: "chat" });

    expect(tools.call).toHaveBeenCalledTimes(4); // MAX_STEPS
    expect(res.mode).toBe("degraded");
    expect(res.toolCalls).toHaveLength(4);
  });

  it("tool errors are observations, not crashes", async () => {
    jest
      .spyOn(agent as unknown as { requestPlan: jest.Mock }, "requestPlan")
      .mockResolvedValueOnce({
        action: "call",
        tool: "read_document",
        input: { itemId: "nope" },
      })
      .mockResolvedValueOnce({ action: "answer", answer: "That doc isn't readable." });

    tools.call.mockResolvedValueOnce({ error: "Document not found" });

    const res = await agent.run("u1", "read my doc", { surface: "reader" });

    expect(res.toolCalls[0]).toMatchObject({ ok: false, tool: "read_document" });
    expect(res.answer).toBe("That doc isn't readable.");
  });
});
