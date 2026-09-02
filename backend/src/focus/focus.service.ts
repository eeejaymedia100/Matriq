import {
  Injectable,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
  NotFoundException,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "crypto";
import Redis from "ioredis";
import { PrismaService } from "../prisma/prisma.service";
import { EntitlementService } from "../entitlement/entitlement.service";
import {
  FocusMap,
  FocusConcept,
  validateFocusMap,
  buildMapPrompt,
  buildExpandPrompt,
  extractJson,
  PROMPT_VERSION,
} from "./focus.schema";
import { enhanceTopic, EnhancedTopic } from "./focus.prompt";

/**
 * Cloud Focus Mode — DeepSeek powered, server-side only.
 *
 * Flow (all secure, backend-authoritative):
 *   1. JWT authenticates the student.
 *   2. EntitlementService verifies Magic Plus OR a remaining free allowance.
 *   3. Request is validated + abuse-limited (daily cap + per-user throttle).
 *   4. A normalized cache key is checked; identical topics skip the model.
 *   5. DeepSeek generates a strict JSON concept map (OpenAI-compatible);
 *      NVIDIA NIM and Gemini are fallbacks. Nothing trusts the model — the
 *      response is validated + sanitized (see focus.schema).
 *   6. Client never sees provider internals or keys; failures surface as a
 *      clean retryable message. Every request is logged for cost/scale.
 *
 * DeepSeek API key lives ONLY here, read from a backend env secret — never in
 * the React Native bundle.
 */

export interface GeneratedMap {
  map: FocusMap;
  sessionId: string;
  cached: boolean;
  usage?: { freeRemaining?: number | null; isPremium: boolean };
}

interface ProviderResult {
  json: unknown;
  provider: "deepseek" | "nvidia" | "gemini";
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
}

interface CallResult {
  json: unknown;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

// JSON-round-trip a validated map into plain Prisma-compatible Json data.
// `any` is intentional — JSON.parse yields object data Prisma accepts as Json,
// and the schema is strictly validated before reaching here.
function toJson(v: FocusMap): // eslint-disable-next-line @typescript-eslint/no-explicit-any
any {
  return JSON.parse(JSON.stringify(v));
}

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat";
const DEFAULT_NVIDIA_MODEL = "meta/llama-3.2-11b-vision-instruct";
const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

@Injectable()
export class FocusService {
  private readonly logger = new Logger(FocusService.name);
  private readonly redis?: Redis;
  private redisHealthy = false;
  private redisRetryAfter = 0;
  private readonly memoryCache = new Map<
    string,
    { value: FocusMap; expiresAt: number }
  >();

  private static readonly REDIS_RETRY_COOLDOWN_MS = 5_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly entitlements: EntitlementService,
  ) {
    const redisUrl = this.configService.get<string>("REDIS_URL");
    if (redisUrl && redisUrl.length > 0) {
      try {
        const client = new Redis(redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          retryStrategy: (times) => Math.min(times * 500, 5_000),
        });
        client.on("error", () => {
          this.redisHealthy = false;
          this.redisRetryAfter =
            Date.now() + FocusService.REDIS_RETRY_COOLDOWN_MS;
        });
        client.on("ready", () => {
          if (!this.redisHealthy) {
            this.logger.log("Focus cache: Redis connected");
          }
          this.redisHealthy = true;
        });
        this.redis = client;
      } catch (err) {
        this.logger.warn(
          `Focus cache Redis init failed — in-memory only: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  // ── Config getters (env-driven, clamped) ────────────────────

  private deepseekKey(): string | undefined {
    return this.configService.get<string>("DEEPSEEK_API_KEY")?.trim() || undefined;
  }
  private get deepseekBaseUrl(): string {
    return (
      this.configService.get<string>("DEEPSEEK_BASE_URL")?.trim() ||
      DEEPSEEK_BASE_URL
    ).replace(/\/+$/, "");
  }
  private get deepseekModel(): string {
    return (
      this.configService.get<string>("DEEPSEEK_MODEL")?.trim() ||
      DEFAULT_DEEPSEEK_MODEL
    );
  }
  private get nvidiaKey(): string | undefined {
    return this.configService.get<string>("NVIDIA_API_KEY")?.trim() || undefined;
  }
  private get nvidiaModel(): string {
    return (
      this.configService.get<string>("NVIDIA_MODEL")?.trim() ||
      DEFAULT_NVIDIA_MODEL
    );
  }
  private get geminiKey(): string | undefined {
    return this.configService.get<string>("GEMINI_API_KEY")?.trim() || undefined;
  }
  private get geminiModel(): string {
    return (
      this.configService.get<string>("GEMINI_MODEL")?.trim() || "gemini-3.7-flash"
    );
  }
  private envInt(key: string, fallback: number): number {
    const parsed = Number(process.env[key]);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  }
  private envFloat(key: string, fallback: number): number {
    const parsed = Number(process.env[key]);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }
  /** Per-user daily cloud Focus Mode cap (abuse protection). */
  private get dailyCap(): number {
    return this.envInt("FOCUS_DAILY_LIMIT", 25);
  }
  private get modelVersion(): string {
    return this.deepseekModel;
  }
  private get inputPriceUsdPerM(): number {
    return this.envFloat("DEEPSEEK_INPUT_PRICE_USD_PER_M", 0.27);
  }
  private get outputPriceUsdPerM(): number {
    return this.envFloat("DEEPSEEK_OUTPUT_PRICE_USD_PER_M", 1.1);
  }

  // ── Public API ──────────────────────────────────────────────

  /**
   * Generate (or serve from cache) a Focus Map for a topic.
   */
  async generate(
    userId: string,
    topicInput: string,
  ): Promise<GeneratedMap> {
    const topic = (topicInput ?? "").trim();
    if (!topic) {
      throw new BadRequestException("A topic is required.");
    }
    if (topic.length > 300) {
      throw new BadRequestException("Topic is too long (max 300 characters).");
    }

    // 1. Authorize (Magic Plus OR free allowance) — backend authority.
    const entitlement = await this.entitlements.authorizeGeneration(userId);

    // 2. Abuse protection: per-user daily cap (counts all cloud calls incl. errors).
    await this.assertDailyCap(userId);

    // 3. Cache key (normalized topic + prompt + model version) so identical /
    //    substantially equivalent topics don't repeatedly hit the paid model.
    const cacheKey = this.cacheKey(topic);
    const cached = await this.getCachedMap(cacheKey);
    if (cached) {
      const session = await this.prisma.focusModeSession.create({
        data: {
          userId,
          topic: cached.topic,
          topicHash: cacheKey.hash,
          conceptMap: toJson(cached),
          promptVersion: PROMPT_VERSION,
          provider: "cache",
          model: this.modelVersion,
          fromCache: true,
        },
      });
      await this.logUsage(userId, session.id, "generate", {
        provider: "cache",
        model: this.modelVersion,
        cached: true,
      });
      return {
        map: cached,
        sessionId: session.id,
        cached: true,
        usage: {
          freeRemaining: entitlement.freeRemaining,
          isPremium: entitlement.isPremium,
        },
      };
    }

    // 4. Enhance the topic deterministically (course codes, level framing) —
    //    a better prompt costs nothing extra and produces better maps. The
    //    cache key above stays on the RAW topic, so equivalent inputs still
    //    share a map.
    const profile = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { level: true, department: true, faculty: true },
    });
    const enhanced = enhanceTopic(topic, profile ?? undefined);

    // 5. Call the model chain: DeepSeek → NVIDIA → Gemini.
    const result = await this.generateMapWithFallbacks(enhanced);

    // 6. Validate (already done in fallback loop, but guard the empty case).
    const map = validateFocusMap(result.json, enhanced.title);
    if (!map) {
      await this.recordError(userId, null, "generate", result.provider, "schema");
      throw new ServiceUnavailableException(
        "The AI returned an unexpected format. Please try again in a moment.",
      );
    }

    // 6. Persist + cache (best-effort cache write never fails the request).
    const session = await this.prisma.focusModeSession.create({
      data: {
        userId,
        topic: map.topic,
        topicHash: cacheKey.hash,
        conceptMap: toJson(map),
        promptVersion: PROMPT_VERSION,
        provider: result.provider,
        model: result.model,
        fromCache: false,
      },
    });
    await this.setCachedMap(cacheKey, map);
    await this.logUsage(userId, session.id, "generate", {
      provider: result.provider,
      model: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      latencyMs: result.latencyMs,
      cached: false,
    });

    return {
      map,
      sessionId: session.id,
      cached: false,
      usage: {
        freeRemaining: entitlement.freeRemaining,
        isPremium: entitlement.isPremium,
      },
    };
  }

  /**
   * Expand one concept in a generated map into a fuller explanation (staged
   * detail — generated only when the student opens it, not up front).
   */
  async expandConcept(
    userId: string,
    sessionId: string,
    conceptId: string,
  ): Promise<{ sessionId: string; concept: FocusConcept }> {
    const session = await this.prisma.focusModeSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) {
      throw new NotFoundException("Focus map not found.");
    }

    const map = session.conceptMap as unknown as FocusMap;
    const idx = map.concepts.findIndex((c) => c.id === conceptId);
    if (idx === -1) {
      throw new NotFoundException("Concept not found in this map.");
    }
    const concept = map.concepts[idx];

    // Authorization for the cloud call (premium / free allowance).
    await this.entitlements.authorizeGeneration(userId);
    await this.assertDailyCap(userId);

    // Per-concept cache within the stored map to avoid repeated paid calls.
    if (isExpanded(concept)) {
      return { sessionId, concept };
    }

    // Do not send conversation history or the full map — only the one concept
    // and the topic title (token + cost minimisation).
    const result = await this.expandWithFallbacks(topicOf(map), concept);
    if (!result) {
      throw new ServiceUnavailableException(
        "The AI couldn't expand this concept right now. Please try again shortly.",
      );
    }

    // Merge the validated enrichment into the stored concept.
    const enriched = applyEnrichment(concept, normalizeEnrichment(result.json));
    const nextConcepts = [...map.concepts];
    nextConcepts[idx] = enriched;
    const nextMap: FocusMap = { ...map, concepts: nextConcepts };

    await this.prisma.focusModeSession.update({
      where: { id: sessionId },
      data: { conceptMap: toJson(nextMap) },
    });
    await this.logUsage(userId, sessionId, "expand", {
      provider: result.provider,
      model: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      latencyMs: result.latencyMs,
      cached: false,
    });

    return { sessionId, concept: enriched };
  }

  /** List the user's own Focus maps (ids only — light pagination). */
  async listOwn(userId: string, cursor?: string, limit = 20) {
    const sessions = await this.prisma.focusModeSession.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, topic: true, createdAt: true, provider: true },
    });
    const hasMore = sessions.length > limit;
    if (hasMore) sessions.pop();
    return {
      sessions,
      nextCursor: hasMore ? (sessions[sessions.length - 1]?.id ?? null) : null,
    };
  }

  /** Fetch one of the user's own maps by id (ownership enforced). */
  async getOwn(userId: string, sessionId: string) {
    const session = await this.prisma.focusModeSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) throw new NotFoundException("Focus map not found.");
    return {
      id: session.id,
      topic: session.topic,
      createdAt: session.createdAt,
      map: session.conceptMap as unknown as FocusMap,
    };
  }

  // ── Abuse protection ────────────────────────────────────────

  private async assertDailyCap(userId: string): Promise<void> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const count = await this.prisma.focusModeUsage.count({
      where: { userId, createdAt: { gte: since } },
    });
    if (count >= this.dailyCap) {
      throw new HttpException(
        {
          code: "FOCUS_RATE_LIMITED",
          message:
            "You've reached today's Focus Mode limit. Please come back tomorrow or unlock more with Magic Plus.",
          retryAfterMs: 24 * 60 * 60 * 1000,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  // ── Provider chain ─────────────────────────────────────────

  /**
   * Generate a map, trying DeepSeek → NVIDIA → Gemini. Returns the first
   * *validated* map. Throws ServiceUnavailableException only once every provider
   * failed or produced unusable JSON — with a safe client message.
   */
  private async generateMapWithFallbacks(
    enhanced: EnhancedTopic,
  ): Promise<ProviderResult> {
    const prompt = buildMapPrompt(enhanced.title, enhanced.prompt);
    const attempts: Array<"deepseek" | "nvidia" | "gemini"> = [
      "deepseek",
      "nvidia",
      "gemini",
    ];

    for (const provider of attempts) {
      const started = Date.now();
      const call = await this.safeCall(prompt, provider);
      if (!call) continue;
      const result: ProviderResult = {
        ...call,
        provider,
        latencyMs: Date.now() - started,
      };

      const map = validateFocusMap(result.json, enhanced.title);
      if (!map) {
        this.logger.warn(`Focus: ${provider} returned invalid map JSON`);
        await this.recordError(null, null, "generate", provider, "schema");
        continue;
      }
      return result;
    }

    throw new ServiceUnavailableException(
      "Focus Mode couldn't reach an AI right now. Please try again in a moment.",
    );
  }

  private async expandWithFallbacks(
    topic: string,
    concept: FocusConcept,
  ): Promise<ProviderResult | null> {
    const prompt = buildExpandPrompt(topic, concept);
    const attempts: Array<"deepseek" | "nvidia" | "gemini"> = [
      "deepseek",
      "nvidia",
      "gemini",
    ];
    for (const provider of attempts) {
      const started = Date.now();
      const call = await this.safeCall(prompt, provider);
      if (!call) continue;
      if (!normalizeEnrichment(call.json)) {
        this.logger.warn(`Focus expand: ${provider} returned invalid JSON`);
        continue;
      }
      return {
        ...call,
        provider,
        latencyMs: Date.now() - started,
      };
    }
    return null;
  }

  /** Call one provider, parse JSON, and never throw (caller handles null). */
  private async safeCall(
    prompt: string,
    provider: "deepseek" | "nvidia" | "gemini",
  ): Promise<CallResult | null> {
    try {
      if (provider === "deepseek") {
        return await this.callDeepSeek(prompt);
      }
      if (provider === "nvidia") {
        return await this.callNvidia(prompt);
      }
      return await this.callGemini(prompt);
    } catch (err) {
      this.logger.warn(
        `Focus: ${provider} call failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /**
   * DeepSeek — OpenAI-compatible chat completions with structured JSON output.
   * This is the primary provider; the key is a backend env secret.
   */
  private async callDeepSeek(prompt: string) {
    const key = this.deepseekKey();
    if (!key) throw new Error("DEEPSEEK_API_KEY not configured");
    const res = await fetch(`${this.deepseekBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: this.deepseekModel,
        messages: [
          {
            role: "system",
            content:
              "You produce strict, valid JSON matching the user's schema. No markdown, no commentary outside the JSON.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 1800,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(this.envInt("DEEPSEEK_TIMEOUT_MS", 45_000)),
    });
    if (!res.ok) {
      throw new Error(`DeepSeek HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    return {
      json: extractJson(text),
      model: this.deepseekModel,
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
    };
  }

  /** NVIDIA NIM (OpenAI-compatible) fallback. May not support response_format. */
  private async callNvidia(prompt: string) {
    const key = this.nvidiaKey;
    if (!key) throw new Error("NVIDIA_API_KEY not configured");
    const res = await fetch(NVIDIA_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: this.nvidiaModel,
        messages: [
          { role: "system", content: "You output only valid JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 1800,
      }),
      signal: AbortSignal.timeout(this.envInt("FOCUS_FALLBACK_TIMEOUT_MS", 45_000)),
    });
    if (!res.ok) throw new Error(`NVIDIA HTTP ${res.status}`);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      json: extractJson(data.choices?.[0]?.message?.content ?? ""),
      model: this.nvidiaModel,
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
    };
  }

  /** Gemini fallback (generateContent). */
  private async callGemini(prompt: string) {
    const key = this.geminiKey;
    if (!key) throw new Error("GEMINI_API_KEY not configured");
    const res = await fetch(
      `${GEMINI_BASE_URL}/models/${this.geminiModel}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1800 },
        }),
        signal: AbortSignal.timeout(this.envInt("FOCUS_FALLBACK_TIMEOUT_MS", 45_000)),
      },
    );
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    return {
      json: extractJson(data.candidates?.[0]?.content?.parts?.[0]?.text ?? ""),
      model: this.geminiModel,
      promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }

  // ── Cache ──────────────────────────────────────────────────

  private cacheKey(topic: string): { prime: string; hash: string } {
    const normalized = topic.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 300);
    const prime = `focus:map:v${PROMPT_VERSION}:${this.modelVersion}:${normalized}`;
    return { prime, hash: createHash("sha256").update(prime).digest("hex") };
  }

  private async getCachedMap(key: { prime: string; hash: string }): Promise<FocusMap | null> {
    // In-memory first (fast, per-process).
    const mem = this.memoryCache.get(key.hash);
    if (mem && mem.expiresAt > Date.now()) return mem.value;
    if (this.redis && (this.redisHealthy || Date.now() >= this.redisRetryAfter)) {
      try {
        const raw = await this.redis.get(key.prime);
        this.redisHealthy = true;
        if (raw) {
          const parsed = validateFocusMap(JSON.parse(raw) as unknown, "");
          if (parsed) {
            this.memoryCache.set(key.hash, {
              value: parsed,
              expiresAt: Date.now() + this.cacheTtlSeconds() * 1000,
            });
            return parsed;
          }
        }
      } catch (err) {
        this.redisHealthy = false;
        this.redisRetryAfter = Date.now() + FocusService.REDIS_RETRY_COOLDOWN_MS;
      }
    }
    return null;
  }

  private async setCachedMap(key: { prime: string; hash: string }, map: FocusMap): Promise<void> {
    const ttl = this.cacheTtlSeconds();
    this.memoryCache.set(key.hash, { value: map, expiresAt: Date.now() + ttl * 1000 });
    if (this.redis && (this.redisHealthy || Date.now() >= this.redisRetryAfter)) {
      try {
        await this.redis.set(key.prime, JSON.stringify(map), "EX", ttl);
        this.redisHealthy = true;
      } catch (err) {
        this.redisHealthy = false;
        this.redisRetryAfter = Date.now() + FocusService.REDIS_RETRY_COOLDOWN_MS;
      }
    }
  }

  private cacheTtlSeconds(): number {
    return this.envInt("FOCUS_CACHE_TTL_HOURS", 48) * 3600;
  }

  // ── Usage / economics tracking ─────────────────────────────

  private costMicros(
    provider: string,
    promptTokens: number,
    completionTokens: number,
  ): number {
    const input = promptTokens * this.inputPriceUsdPerM;
    const output = completionTokens * this.outputPriceUsdPerM;
    return Math.round((input + output) * 1_000_000);
  }

  private async logUsage(
    userId: string,
    sessionId: string,
    operation: "generate" | "expand",
    opts: {
      provider: string;
      model: string;
      cached: boolean;
      promptTokens?: number;
      completionTokens?: number;
      latencyMs?: number;
    },
  ): Promise<void> {
    const p = opts.promptTokens ?? 0;
    const c = opts.completionTokens ?? 0;
    try {
      await this.prisma.focusModeUsage.create({
        data: {
          userId,
          sessionId: opts.cached ? undefined : (sessionId ?? undefined),
          operation,
          provider: opts.provider,
          model: opts.model,
          promptVersion: PROMPT_VERSION,
          promptTokens: p,
          completionTokens: c,
          totalTokens: p + c,
          latencyMs: opts.latencyMs ?? 0,
          estimatedCostMicros: opts.cached
            ? 0
            : this.costMicros(opts.provider, p, c),
          cached: opts.cached,
          error: false,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to log Focus usage: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async recordError(
    userId: string | null,
    sessionId: string | null,
    operation: "generate" | "expand",
    provider: string,
    errorKind: string,
  ): Promise<void> {
    if (!userId) return;
    try {
      await this.prisma.focusModeUsage.create({
        data: {
          userId,
          sessionId: sessionId ?? undefined,
          operation,
          provider,
          model: this.modelVersion,
          promptVersion: PROMPT_VERSION,
          error: true,
          errorKind,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to log Focus error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

/** Normalize an "expand" response into detail/importance/examples. */
function normalizeEnrichment(
  raw: unknown,
): { detail: string; importance: string; examples: string[] } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const detail =
    typeof o.detail === "string" && o.detail.trim() ? o.detail.trim() : "";
  if (!detail) return null;
  const examples = Array.isArray(o.examples)
    ? o.examples
        .map((e) => (typeof e === "string" ? e.trim() : ""))
        .filter(Boolean)
        .slice(0, 5)
    : [];
  return {
    detail,
    importance:
      typeof o.importance === "string" ? o.importance.trim().slice(0, 300) : "",
    examples,
  };
}

function isExpanded(concept: FocusConcept): boolean {
  return (concept.detail?.length ?? 0) > 240;
}

function topicOf(map: FocusMap): string {
  return map.topic;
}

function applyEnrichment(
  concept: FocusConcept,
  enrichment: { detail: string; importance: string; examples: string[] } | null,
): FocusConcept {
  if (!enrichment) return concept;
  const next: FocusConcept = {
    ...concept,
    detail: enrichment.detail.slice(0, 2600),
  };
  if (enrichment.importance) next.importance = enrichment.importance;
  if (enrichment.examples.length) next.examples = enrichment.examples;
  return next;
}