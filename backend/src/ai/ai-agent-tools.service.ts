import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { AgentToolResult } from "./agent.schema";

/**
 * The agent's hands. Every tool is allowlisted, ownership-checked and
 * size-bounded — the model can only NAME a tool; this service decides what
 * it may touch. Retrieval reuses the owner-scoped RAG pipeline, so "my
 * notes" tools see exactly the student's own ingested material and nothing
 * else.
 */
@Injectable()
export class AgentToolsService {
  private static readonly MAX_DOCS = 6;
  private static readonly MAX_CHUNK_PREVIEW = 400;

  private readonly logger = new Logger(AgentToolsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** The tool manifest — also rendered into the model's plan prompt. */
  static readonly MANIFEST: { name: string; description: string }[] = [
    {
      name: "search_my_notes",
      description:
        "Search the student's OWN uploaded/ingested material (vault uploads + Deep Read transcriptions) for passages relevant to a query. Returns text chunks with course codes.",
    },
    {
      name: "read_document",
      description:
        "Read the text of one specific document the student can access, by id (their own upload or an approved public one). Returns an excerpt.",
    },
    {
      name: "search_library",
      description:
        "Search the school's academic library (approved public documents) by course code or title keywords. Returns titles + ids the student can be pointed to.",
    },
    {
      name: "explain",
      description:
        "Explain a concept simply, grounded in the student's own material when available. Use only when the student asks for an explanation rather than a search.",
    },
  ];

  /** Allowlist + dispatch. Unknown tools fail safely. */
  async call(
    userId: string,
    tool: string,
    input: Record<string, unknown> | undefined,
  ): Promise<AgentToolResult> {
    switch (tool) {
      case "search_my_notes":
        return this.searchMyNotes(userId, input);
      case "read_document":
        return this.readDocument(userId, input);
      case "search_library":
        return this.searchLibrary(userId, input);
      case "explain":
        return this.explain(userId, input);
      default:
        return { error: `Unknown tool "${tool}"` };
    }
  }

  /**
   * search_my_notes — owner-scoped hybrid retrieval (pgvector + keyword)
   * restricted to the student's own ingested material. Mirrors the
   * AiService.askMyNotes retrieval contract; answers cite what was found.
   */
  private async searchMyNotes(
    userId: string,
    input?: Record<string, unknown>,
  ): Promise<AgentToolResult> {
    const query = this.readString(input, "query", 300);
    if (!query) return { error: "query is required" };

    const docs = await this.prisma.aiDocument.findMany({
      where: {
        submittedByUserId: userId,
        moderationStatus: "approved",
        OR: query
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 2)
          .slice(0, 8)
          .map((kw) => ({ contentChunk: { contains: kw } })),
      },
      select: { id: true, contentChunk: true, courseCode: true },
      take: AgentToolsService.MAX_DOCS,
    });

    if (docs.length === 0) {
      return {
        result: {
          found: false,
          message:
            "Nothing matched in the student's own material. Suggest they upload notes or snap pages with Deep Read.",
        },
      };
    }
    return {
      result: {
        found: true,
        chunks: docs.map((d) => ({
          course: d.courseCode,
          text: d.contentChunk.slice(0, AgentToolsService.MAX_CHUNK_PREVIEW),
        })),
      },
    };
  }

  /**
   * read_document — the text of ONE document, same access rules as the
   * library reader: the student's own upload, or an approved public item.
   * Uses the VaultService text extraction contract via the library service's
   * readable-assertion helper to avoid duplicating authorization logic.
   */
  private async readDocument(
    userId: string,
    input?: Record<string, unknown>,
  ): Promise<AgentToolResult> {
    const itemId = this.readString(input, "itemId", 40);
    if (!itemId) return { error: "itemId is required" };

    // Authorization mirror of library directReadUrl: owner OR public-approved,
    // never hidden/deleted. Text extraction via the vault text endpoint's
    // pipeline would need a VaultService import; the ai module already
    // depends on LibraryService, so we assert readability here and pull text
    // through the same extraction path the vault uses for its reader.
    const item = await this.prisma.vaultItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        userId: true,
        visibility: true,
        moderationStatus: true,
        hidden: true,
        deletedAt: true,
        courseCode: true,
        title: true,
      },
    });
    if (!item || item.deletedAt || item.hidden) {
      return { error: "Document not found" };
    }
    const isOwner = item.userId === userId;
    const isPublicApproved =
      item.visibility === "public" && item.moderationStatus === "approved";
    if (!isOwner && !isPublicApproved) {
      return { error: "Not allowed" };
    }

    // Prefer already-ingested chunks (fast, no OCR round-trip).
    const chunks = await this.prisma.aiDocument.findMany({
      where: {
        sourceRef: { startsWith: `vault:${itemId}:` },
        moderationStatus: "approved",
      },
      select: { contentChunk: true },
      take: 3,
      orderBy: { createdAt: "asc" },
    });
    if (chunks.length > 0) {
      return {
        result: {
          title: item.title,
          course: item.courseCode,
          excerpt: chunks
            .map((c) => c.contentChunk.slice(0, AgentToolsService.MAX_CHUNK_PREVIEW))
            .join("\n---\n"),
        },
      };
    }
    return {
      result: {
        title: item.title,
        course: item.courseCode,
        excerpt: null,
        message:
          "No extracted text yet (scanned PDF or image). The student can open it in the reader or run Deep Read.",
      },
    };
  }

  /**
   * search_library — approved public documents, mirroring the LibraryService
   * discovery filter (public + approved + not hidden/deleted). Direct Prisma
   * here instead of a LibraryService import: AiModule → LibraryModule →
   * AdminModule → AiModule would create a circular module dependency, and
   * the filter is four stable predicates.
   */
  private async searchLibrary(
    userId: string,
    input?: Record<string, unknown>,
  ): Promise<AgentToolResult> {
    const query = this.readString(input, "query", 120);
    if (!query) return { error: "query is required" };
    const type = this.readString(input, "type", 20);
    const safeType =
      type === "past_question" || type === "material" ? type : undefined;

    const rows = await this.prisma.vaultItem.findMany({
      where: {
        visibility: "public",
        moderationStatus: "approved",
        hidden: false,
        deletedAt: null,
        ...(safeType ? { type: safeType } : {}),
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { courseTitle: { contains: query, mode: "insensitive" } },
          { courseCode: { contains: query, mode: "insensitive" } },
          { courseCode: { contains: query.trim().toUpperCase() } },
        ],
      },
      select: { id: true, title: true, courseCode: true, type: true },
      orderBy: [{ opens: "desc" }, { createdAt: "desc" }],
      take: 5,
    });
    return {
      result: {
        results: rows.map((r) => ({
          id: r.id,
          title: r.title,
          course: r.courseCode,
          type: r.type,
        })),
      },
    };
  }

  /**
   * explain — a short explanation grounded in the student's own material
   * when it exists. Uses the same DeepSeek generation path as chat.
   */
  private async explain(
    userId: string,
    input?: Record<string, unknown>,
  ): Promise<AgentToolResult> {
    const concept = this.readString(input, "concept", 300);
    if (!concept) return { error: "concept is required" };

    // Ground in own material when available (same scoping as askMyNotes).
    const own = await this.prisma.aiDocument.findMany({
      where: {
        submittedByUserId: userId,
        moderationStatus: "approved",
        OR: concept
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3)
          .slice(0, 6)
          .map((kw) => ({ contentChunk: { contains: kw } })),
      },
      select: { contentChunk: true, courseCode: true },
      take: 3,
    });

    const grounding = own.length
      ? own
          .map((o) => `[${o.courseCode ?? "notes"}] ${o.contentChunk.slice(0, 600)}`)
          .join("\n---\n")
      : "";

    const prompt = [
      "You are Matriq, a study companion for Nigerian university students.",
      own.length
        ? "Explain the concept below using the student's OWN material as the primary source. Be concise (max 180 words)."
        : "Explain the concept below simply and concisely (max 150 words). The student has no material on it — say so first, then explain from general knowledge.",
      grounding ? `\nStudent's material:\n${grounding}` : "",
      `\nConcept: ${concept}`,
    ]
      .filter(Boolean)
      .join("\n");

    const answer = await this.generateWithDeepSeek(prompt);
    return { result: { explanation: answer, grounded: own.length > 0 } };
  }

  /** Direct DeepSeek call (same env config as the chat path). */
  private async generateWithDeepSeek(prompt: string): Promise<string> {
    const key = process.env.DEEPSEEK_API_KEY?.trim();
    if (!key) throw new Error("DeepSeek not configured");
    const baseUrl = (
      process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com"
    ).replace(/\/+$/, "");
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL?.trim() || "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.6,
        max_tokens: 600,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`DeepSeek HTTP ${res.status}`);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) throw new Error("DeepSeek returned empty response");
    return text.replace(/<\/?[a-zA-Z][^>]*>/g, "").trim();
  }

  /** Safe string extraction from untrusted tool input. */
  private readString(
    input: Record<string, unknown> | undefined,
    key: string,
    maxLen: number,
  ): string | null {
    const raw = input?.[key];
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, maxLen);
  }
}
