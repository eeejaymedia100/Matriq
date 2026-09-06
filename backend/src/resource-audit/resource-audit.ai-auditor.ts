/**
 * Resource Audit Engine — Part 3: the AI Resource Auditor.
 *
 * Compares what the student DECLARED against what the document actually
 * CONTAINS, and produces a strict structured audit — never prose. The
 * recommendation (APPROVE / REJECT / REVIEW) is advisory forever: in V1
 * every submission reaches a human, regardless of what the AI says.
 *
 * Providers are pluggable via the AUDITOR_PORT. The DeepSeek adapter is the
 * default when DEEPSEEK_API_KEY is present; the deterministic rule-based
 * auditor is always available as a fallback so the pipeline never stalls on
 * a provider outage.
 */

export type AiRecommendation = "approve" | "reject" | "review";
export type RiskLevel = "green" | "yellow" | "red";

export interface DetectedMetadata {
  title: string | null;
  courseCode: string | null;
  university: string | null;
  faculty: string | null;
  department: string | null;
  level: string | null;
  academicSession: string | null;
}

export interface AuditScores {
  academicRelevance: number; // 0-100
  readability: number; // 0-100
  completeness: number; // 0-100
  metadataMatch: number; // 0-100
  duplicateProbability: number; // 0-100
  copyrightRisk: number; // 0-100
  suspiciousContentRisk: number; // 0-100
  rewardAbuseRisk: number; // 0-100
}

/** The strict schema every provider must return (validated before storage). */
export interface StructuredAudit {
  documentType: string;
  detected: DetectedMetadata;
  scores: AuditScores;
  contradictions: string[];
  overallConfidence: number; // 0-100
  recommendation: AiRecommendation;
  reasons: string[];
  riskLevel: RiskLevel;
  provider: string;
  model: string;
}

export interface AuditorInput {
  declared: {
    materialType: string;
    courseCode: string;
    level: string | null;
    academicSession: string | null;
    faculty: string | null;
    department: string | null;
    universityName: string | null;
  };
  fileName: string;
  extractedText: string | null;
  usedOcr: boolean;
  validation: {
    verdict: string;
    pageCount: number | null;
    textDensityCharsPerPage: number | null;
    blankPageRatio: number | null;
    suspiciouslyPadded: boolean;
    screenshotHeavy: boolean;
  } | null;
  duplicateEvidence: {
    maxSimilarity: number;
    nearHitCount: number;
    exactOf: string | null;
  } | null;
}

export const AUDITOR_PORT = Symbol("RESOURCE_AUDIT_AI");

export interface ResourceAiAuditor {
  readonly provider: string;
  readonly model: string;
  audit(input: AuditorInput): Promise<StructuredAudit>;
}

// ── Structured output validation ─────────────────────────────────────

const clamp = (n: unknown, fallback = 50): number => {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(100, Math.round(v)));
};

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim().length > 0 ? v.trim().slice(0, 200) : null;

/**
 * Validate + normalize a raw provider payload into StructuredAudit.
 * Throws when the payload cannot be trusted (missing recommendation etc.) —
 * callers fall back to the rule-based auditor.
 */
export function parseStructuredAudit(raw: unknown, provider: string, model: string): StructuredAudit {
  if (typeof raw !== "object" || raw === null) throw new Error("audit payload is not an object");
  const o = raw as Record<string, unknown>;

  const recommendationRaw = String(o.recommendation ?? "").toLowerCase();
  const recommendation: AiRecommendation =
    recommendationRaw === "approve" || recommendationRaw === "reject" || recommendationRaw === "review"
      ? (recommendationRaw as AiRecommendation)
      : ((): AiRecommendation => {
          if (recommendationRaw === "needs_review") return "review";
          throw new Error(`invalid recommendation: ${recommendationRaw}`);
        })();

  const detectedRaw = (o.detected ?? {}) as Record<string, unknown>;
  const scoresRaw = (o.scores ?? {}) as Record<string, unknown>;

  const num = (key: string, fallback: number): number => clamp(scoresRaw[key], fallback);

  const scores: AuditScores = {
    academicRelevance: num("academicRelevance", 50),
    readability: num("readability", 50),
    completeness: num("completeness", 50),
    metadataMatch: num("metadataMatch", 50),
    duplicateProbability: num("duplicateProbability", 0),
    copyrightRisk: num("copyrightRisk", 20),
    suspiciousContentRisk: num("suspiciousContentRisk", 10),
    rewardAbuseRisk: num("rewardAbuseRisk", 10),
  };

  const reasons = Array.isArray(o.reasons)
    ? o.reasons.map((r) => String(r).slice(0, 300)).slice(0, 8)
    : [];
  const contradictions = Array.isArray(o.contradictions)
    ? o.contradictions.map((r) => String(r).slice(0, 300)).slice(0, 8)
    : [];

  const riskRaw = String(o.riskLevel ?? "").toLowerCase();
  const riskLevel: RiskLevel =
    riskRaw === "green" || riskRaw === "yellow" || riskRaw === "red"
      ? (riskRaw as RiskLevel)
      : riskLevelFromSignals(scores, contradictions.length);

  return {
    documentType: str(o.documentType) ?? "unknown",
    detected: {
      title: str(detectedRaw.title),
      courseCode: str(detectedRaw.courseCode),
      university: str(detectedRaw.university),
      faculty: str(detectedRaw.faculty),
      department: str(detectedRaw.department),
      level: str(detectedRaw.level),
      academicSession: str(detectedRaw.academicSession),
    },
    scores,
    contradictions,
    overallConfidence: clamp(o.overallConfidence, 50),
    recommendation,
    reasons: reasons.length > 0 ? reasons : ["no reasons provided by auditor"],
    riskLevel,
    provider,
    model,
  };
}

/** Deterministic risk classification used when the provider omits one. */
export function riskLevelFromSignals(scores: AuditScores, contradictionCount: number): RiskLevel {
  if (
    contradictionCount > 0 ||
    scores.suspiciousContentRisk >= 60 ||
    scores.rewardAbuseRisk >= 60 ||
    scores.duplicateProbability >= 80 ||
    scores.metadataMatch < 25
  ) {
    return "red";
  }
  if (
    scores.metadataMatch < 55 ||
    scores.duplicateProbability >= 50 ||
    scores.suspiciousContentRisk >= 30 ||
    scores.rewardAbuseRisk >= 30 ||
    scores.copyrightRisk >= 55
  ) {
    return "yellow";
  }
  return "green";
}

// ── DeepSeek adapter ─────────────────────────────────────────────────

export class DeepSeekAuditor implements ResourceAiAuditor {
  readonly provider = "deepseek";
  readonly model: string;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    model?: string,
  ) {
    this.model = model || "deepseek-chat";
  }

  static fromEnv(get: (key: string) => string | undefined): DeepSeekAuditor | null {
    const apiKey = get("DEEPSEEK_API_KEY");
    if (!apiKey) return null;
    return new DeepSeekAuditor(
      apiKey,
      get("DEEPSEEK_BASE_URL") || "https://api.deepseek.com",
      get("RESOURCE_AUDIT_AI_MODEL"),
    );
  }

  async audit(input: AuditorInput): Promise<StructuredAudit> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(input) },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`deepseek audit failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("deepseek audit returned no content");
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("deepseek audit returned non-JSON content");
    }
    return parseStructuredAudit(parsed, this.provider, this.model);
  }
}

// ── Ollama adapter (self-hosted, no API key) ─────────────────────────

/**
 * The on-server AI auditor — Ollama's native /api/chat with `format: "json"
 * so the model is constrained to a single JSON object. Runs on the same VM
 * as the backend: no per-call cost, no data leaves the server. Used when
 * OLLAMA_HOST is configured; the DeepSeek cloud adapter (if keyed) sits
 * behind it as the escalation path, with the rule auditor last.
 */
export class OllamaAuditor implements ResourceAiAuditor {
  readonly provider = "ollama";
  readonly model: string;

  constructor(
    private readonly host: string,
    model?: string,
    private readonly timeoutMs = 180_000,
  ) {
    this.model = model || "llama3.2:3b";
  }

  static fromEnv(get: (key: string) => string | undefined): OllamaAuditor | null {
    const host = get("OLLAMA_HOST");
    if (!host) return null;
    return new OllamaAuditor(host, get("RESOURCE_AUDIT_AI_MODEL"));
  }

  async audit(input: AuditorInput): Promise<StructuredAudit> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.host.replace(/\/$/, "")}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: "json",
          options: { temperature: 0.1 },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserPrompt(input) },
          ],
        }),
      });
      if (!res.ok) {
        throw new Error(`ollama audit failed: HTTP ${res.status}`);
      }
      const body = (await res.json()) as { message?: { content?: string } };
      const content = body.message?.content;
      if (!content) throw new Error("ollama audit returned no content");
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error("ollama audit returned non-JSON content");
      }
      return parseStructuredAudit(parsed, this.provider, this.model);
    } finally {
      clearTimeout(timer);
    }
  }
}

// ── Rule-based fallback auditor ──────────────────────────────────────

/**
 * Deterministic auditor used when no AI provider is configured or the
 * provider fails. It derives the same StructuredAudit from the validation
 * report and text signals — including a regex sweep for course codes that
 * contradict the student's declaration.
 */
export class RuleBasedAuditor implements ResourceAiAuditor {
  readonly provider = "rules";
  readonly model = "deterministic-v1";

  async audit(input: AuditorInput): Promise<StructuredAudit> {
    const text = input.extractedText ?? "";
    const textUpper = text.toUpperCase();
    const declaredCourse = input.declared.courseCode.replace(/\s+/g, "");

    // Course-code contradiction sweep: find other course codes in the text.
    const foundCodes = new Set<string>();
    const codeRe = /\b([A-Z]{2,4})\s?(\d{3,4}[A-Z]?)\b/g;
    let m: RegExpExecArray | null;
    while ((m = codeRe.exec(textUpper)) !== null) {
      const candidate = `${m[1]}${m[2]}`;
      if (candidate !== declaredCourse) foundCodes.add(candidate);
      if (foundCodes.size >= 5) break;
    }
    const contradictions: string[] = [];
    if (foundCodes.size > 0 && !textUpper.includes(declaredCourse)) {
      contradictions.push(
        `Declared ${input.declared.courseCode} but the document mentions ${[...foundCodes].slice(0, 3).join(", ")} and never mentions ${input.declared.courseCode}.`,
      );
    }

    const pageCount = input.validation?.pageCount ?? null;
    const density = input.validation?.textDensityCharsPerPage ?? 0;
    const blankRatio = input.validation?.blankPageRatio ?? null;

    // Academic relevance heuristic: presence of academic vocabulary.
    const academicMarkers = [
      "university", "department", "faculty", "semester", "examination", "exam",
      "lecture", "course", "question", "answer", "instructions", "marks", "time allowed",
    ];
    const markerHits = academicMarkers.filter((k) => textLowerIncludes(text, k)).length;
    const academicRelevance = clampScore((markerHits / academicMarkers.length) * 100);

    // Readability: with page-level data, chars/page is the signal. Without
    // it (OCR'd images), text volume is the only honest proxy — a 0 would
    // claim evidence of unreadability we do not have.
    const readability = clampScore(
      density > 0
        ? Math.min(100, (density / 220) * 100)
        : Math.min(60, Math.floor(text.length / 50)),
    );
    // Completeness: length-banded, not a cliff. A short but genuine paper
    // (a two-page course outline, a quiz) must not be punished for being
    // brief — short is not the same as low-value.
    const lengthComponent =
      text.length >= 4000 ? 40 : text.length >= 1500 ? 35 : text.length >= 600 ? 25 : 10;
    const completeness = clampScore(
      lengthComponent + (pageCount ? Math.min(pageCount / 6, 1) * 60 : 25),
    );

    // Metadata match: declared course appears in the text? Check both the
    // spaced ("CHM 101") and unspaced ("CHM101") forms — documents use both.
    const courseMentioned =
      textUpper.includes(declaredCourse) ||
      textUpper.includes(input.declared.courseCode.toUpperCase());
    const metadataMatch = clampScore(courseMentioned ? 85 : contradictions.length > 0 ? 15 : 45);

    const duplicateProbability = clampScore(input.duplicateEvidence?.maxSimilarity ?? 0);
    const suspiciousContentRisk = clampScore(
      (input.validation?.suspiciouslyPadded ? 45 : 0) + (blankRatio !== null && blankRatio > 0.6 ? 25 : 0),
    );
    const rewardAbuseRisk = clampScore(duplicateProbability * 0.7 + suspiciousContentRisk * 0.3);
    const copyrightRisk = clampScore(
      /textbook|©|all rights reserved|publisher/i.test(text) ? 55 : 20,
    );

    const overallConfidence = clampScore(
      (text.length > 1500 ? 70 : text.length > 600 ? 55 : 35) +
        (input.usedOcr ? -10 : 10) +
        (pageCount ? 10 : 0),
    );

    const scores: AuditScores = {
      academicRelevance,
      readability,
      completeness,
      metadataMatch,
      duplicateProbability,
      copyrightRisk,
      suspiciousContentRisk,
      rewardAbuseRisk,
    };

    let recommendation: AiRecommendation = "review";
    if (contradictions.length > 0 || duplicateProbability >= 80 || suspiciousContentRisk >= 60) {
      recommendation = "reject";
    } else if (
      academicRelevance >= 55 &&
      metadataMatch >= 70 &&
      completeness >= 45 &&
      duplicateProbability < 50
    ) {
      recommendation = "approve";
    }

    const reasons = [
      courseMentioned
        ? `Declared course ${input.declared.courseCode} appears in the document text.`
        : contradictions.length > 0
          ? "Declared course code not found in the document."
          : "Declared course code not found in the text (may still be a scan).",
      `Text density ${density} chars/page across ${pageCount ?? "?"} pages.`,
      input.validation?.suspiciouslyPadded ? "Document shows padding patterns (blank/repeated pages)." : "No padding patterns detected.",
    ];

    return {
      documentType: input.declared.materialType,
      detected: {
        title: guessTitle(input.fileName, text),
        courseCode: courseMentioned ? input.declared.courseCode : [...foundCodes][0] ?? null,
        university: null,
        faculty: null,
        department: null,
        level: null,
        academicSession: guessSession(text),
      },
      scores,
      contradictions,
      overallConfidence,
      recommendation,
      reasons,
      riskLevel: riskLevelFromSignals(scores, contradictions.length),
      provider: this.provider,
      model: this.model,
    };
  }
}

function textLowerIncludes(text: string, needle: string): boolean {
  return text.toLowerCase().includes(needle);
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function guessTitle(fileName: string, text: string): string | null {
  const firstLine = text.split(/\n|\. /).find((l) => l.trim().length >= 12 && l.trim().length <= 120);
  if (firstLine) return firstLine.trim().slice(0, 120);
  return fileName.replace(/\.[a-z0-9]+$/i, "").slice(0, 120);
}

function guessSession(text: string): string | null {
  const m = /(20\d{2})\s*\/\s*(20\d{2})/.exec(text);
  return m ? `${m[1]}/${m[2]}` : null;
}

// ── Prompt construction ──────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the Matriq Resource Auditor. You assess student-submitted academic materials (past questions, lecture notes, handouts, slide decks, textbook summaries) for a Nigerian university study platform.

You receive: the student's declared metadata, the document's extracted text, deterministic validation results, and duplicate-detection evidence.

You MUST reply with a single JSON object, no prose, matching exactly this schema:
{
  "documentType": string,
  "detected": { "title": string|null, "courseCode": string|null, "university": string|null, "faculty": string|null, "department": string|null, "level": string|null, "academicSession": string|null },
  "scores": { "academicRelevance": 0-100, "readability": 0-100, "completeness": 0-100, "metadataMatch": 0-100, "duplicateProbability": 0-100, "copyrightRisk": 0-100, "suspiciousContentRisk": 0-100, "rewardAbuseRisk": 0-100 },
  "contradictions": string[],
  "overallConfidence": 0-100,
  "recommendation": "approve" | "reject" | "review",
  "reasons": string[],
  "riskLevel": "green" | "yellow" | "red"
}

Guidelines:
- metadataMatch: how well the declared course/type/level agree with the document evidence. A declared course code that never appears while other codes dominate is a contradiction — list it in "contradictions".
- judge ACADEMIC VALUE, not length. A genuine 2-page course outline is valuable; a 40-page padded scan of blank pages is junk.
- duplicateProbability comes mostly from the supplied duplicate evidence, not your own guess.
- copyrightRisk: high for textbook chapters, publisher material, "all rights reserved" content; low for student notes and past questions.
- recommendation "approve" = clearly useful academic material matching its metadata; "reject" = junk, contradicts metadata, or high abuse risk; "review" = anything uncertain. Humans make every final decision — your recommendation is advisory.
- riskLevel: green = apparently normal, yellow = uncertain signals, red = contradictions or high abuse/suspicion scores.`;

const TEXT_EXCERPT_CHARS = 6000;

export function buildUserPrompt(input: AuditorInput): string {
  const d = input.declared;
  const v = input.validation;
  const dup = input.duplicateEvidence;
  const excerpt = (input.extractedText ?? "(no text extracted — image-only or unreadable document)").slice(
    0,
    TEXT_EXCERPT_CHARS,
  );
  return [
    "STUDENT DECLARED:",
    `  materialType: ${d.materialType}`,
    `  courseCode: ${d.courseCode}`,
    `  level: ${d.level ?? "unspecified"}`,
    `  academicSession: ${d.academicSession ?? "unspecified"}`,
    `  university: ${d.universityName ?? "unspecified"}`,
    `  faculty: ${d.faculty ?? "unspecified"} / department: ${d.department ?? "unspecified"}`,
    `  fileName: ${input.fileName}`,
    "",
    "DETERMINISTIC VALIDATION:",
    v
      ? `  verdict=${v.verdict} pages=${v.pageCount ?? "?"} textDensity=${v.textDensityCharsPerPage ?? "?"} chars/page blankRatio=${v.blankPageRatio ?? "?"} padded=${v.suspiciouslyPadded} screenshotHeavy=${v.screenshotHeavy}`
      : "  (no validation report)",
    "",
    "DUPLICATE EVIDENCE:",
    dup
      ? `  maxSimilarity=${dup.maxSimilarity}% nearHits=${dup.nearHitCount} exactOf=${dup.exactOf ?? "none"}`
      : "  none",
    "",
    "DOCUMENT TEXT (first 6000 chars):",
    excerpt,
  ].join("\n");
}
