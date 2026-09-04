import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Deep Read transcription engine.
 *
 * Two model tiers, one key, both env-tunable:
 *  - DEEP_READ_MODEL (default gemini-3.1-pro-preview): the premium Deep Read
 *    pass. Verified live against the billed key — note gemini-2.5-pro is
 *    CLOSED to new API users (404 "no longer available to new users"), which
 *    is exactly why the model id is configurable rather than hardcoded.
 *  - GEMINI_MODEL (default gemini-2.5-flash): the rescue tier, shared with
 *    the free OCR pipeline. Used when the Pro pass fails transiently so a
 *    paying student never gets nothing.
 *
 * Response parsing notes (learned from live calls, not docs):
 *  - candidates[0].content.parts is an ARRAY and thinking models interleave
 *    text parts with thoughtSignature parts — text must be collected across
 *    ALL parts, not taken from parts[0].
 *  - finishReason reason MAX_TOKENS means the page overflowed the output
 *    budget: reported as a distinct failure so the caller can split the page
 *    rather than silently returning a truncated transcription.
 */

const NO_TEXT = "NO_TEXT";

const DEEP_READ_PROMPT = `You are a precision transcription engine for a study app. Transcribe ALL handwritten and printed text in this image VERBATIM.

Rules:
- Preserve the original line breaks and paragraph structure exactly as written.
- Keep course codes, abbreviations, numbers and bullet markers exactly as written (e.g. "CHM 101", "w/").
- Transcribe diagrams as short bracketed descriptions on their own line, e.g. "[diagram: heart with arrows]" — never skip a diagram silently.
- If a word is truly illegible write [?] in its place. Never guess whole sentences.
- Do NOT translate, correct, summarize, or add commentary. Transcription only.
- If the image contains no legible text at all, reply with exactly: NO_TEXT`;

interface GeminiPart {
  text?: string;
  thoughtSignature?: string;
  thought?: boolean;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

export interface TranscriptionResult {
  text: string;
  readable: boolean;
  /** "deep_read" (pro tier) | "rescue" (flash tier) */
  tier: "deep_read" | "rescue";
  /** 0-100 heuristic estimate, null when the engine gives no signal. */
  confidence: number | null;
  latencyMs: number;
  /** Page overflowed the output budget — caller should split and retry. */
  truncated: boolean;
}

@Injectable()
export class DeepReadTranscribeService {
  private readonly logger = new Logger(DeepReadTranscribeService.name);

  constructor(private readonly configService: ConfigService) {}

  private get key(): string {
    return this.configService.get<string>("GEMINI_API_KEY")?.trim() ?? "";
  }

  private get baseUrl(): string {
    return (
      this.configService.get<string>("GEMINI_BASE_URL")?.trim() ||
      "https://generativelanguage.googleapis.com/v1beta"
    );
  }

  get deepReadModel(): string {
    return (
      this.configService.get<string>("DEEP_READ_MODEL")?.trim() ||
      "gemini-3.1-pro-preview"
    );
  }

  get rescueModel(): string {
    return (
      this.configService.get<string>("GEMINI_MODEL")?.trim() ||
      "gemini-2.5-flash"
    );
  }

  get isConfigured(): boolean {
    return this.key.length > 0;
  }

  /**
   * Premium transcription pass. One retry on transient failures; a 4xx is
   * never retried (it will fail again). Throws TranscribeError on hard
   * failure so the caller can decide between rescue tier or page failure.
   */
  async transcribeDeepRead(image: {
    base64: string;
    mime: string;
  }): Promise<TranscriptionResult> {
    return this.call(this.deepReadModel, image, "deep_read");
  }

  /**
   * Rescue pass on the cheaper flash tier — the same engine the free OCR
   * pipeline uses. Quality is lower on messy handwriting but it is the
   * difference between "your notes are ready" and "your page failed".
   */
  async transcribeRescue(image: {
    base64: string;
    mime: string;
  }): Promise<TranscriptionResult> {
    return this.call(this.rescueModel, image, "rescue");
  }

  private async call(
    model: string,
    image: { base64: string; mime: string },
    tier: "deep_read" | "rescue",
  ): Promise<TranscriptionResult> {
    if (!this.isConfigured) {
      throw new TranscribeError("Transcription engine is not configured.", false);
    }

    const started = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await fetch(
          `${this.baseUrl}/models/${model}:generateContent?key=${this.key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      inline_data: { mime_type: image.mime, data: image.base64 },
                    },
                    { text: DEEP_READ_PROMPT },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0,
                // A dense handwritten page transcribes to ~2-4k chars; 8192
                // tokens of output covers even exam-booklet pages.
                maxOutputTokens: 8192,
              },
            }),
            signal: AbortSignal.timeout(90_000),
          },
        );

        if (!res.ok) {
          const status = res.status;
          // Model-id drift / deprecation is a 404: surface a precise message
          // so ops fixes the env var instead of debugging "OCR is broken".
          let detail = `Gemini HTTP ${status}`;
          if (status === 404) {
            detail += ` — model "${model}" not available for this key (deprecated or wrong id; set DEEP_READ_MODEL / GEMINI_MODEL)`;
          } else if (status === 429) {
            detail += " — rate limited";
          }
          throw Object.assign(new Error(detail), { status });
        }

        const data = (await res.json()) as GeminiResponse;

        if (data.promptFeedback?.blockReason) {
          throw new TranscribeError(
            "That page was blocked by the safety filter.",
            false,
          );
        }

        const candidate = data.candidates?.[0];
        const text = collectText(candidate?.content?.parts ?? []);

        // Thinking models can return only a thought block with a MAX_TOKENS
        // finish — that is a truncation, not an empty page.
        const truncated =
          candidate?.finishReason === "MAX_TOKENS" ||
          (!candidate?.content?.parts && candidate?.finishReason === "MAX_TOKENS");

        if (!text && !truncated) {
          // Model genuinely produced nothing readable.
          return {
            text: "",
            readable: false,
            tier,
            confidence: 0,
            latencyMs: Date.now() - started,
            truncated: false,
          };
        }

        const cleaned = this.stripNoTextMarker(text);
        return {
          text: cleaned,
          readable: cleaned.length >= 4,
          tier,
          confidence: estimateConfidence(cleaned),
          latencyMs: Date.now() - started,
          truncated,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (err instanceof TranscribeError) throw err;
        const status = (err as { status?: number })?.status;
        // 4xx (except 429) will not succeed on retry.
        if (status && status >= 400 && status < 500 && status !== 429) break;
        if (attempt === 0) {
          this.logger.warn(
            `Deep Read ${tier} attempt 1 failed (${lastError.message}) — retrying`,
          );
        }
      }
    }

    throw new TranscribeError(
      lastError?.message ?? "Transcription failed.",
      true,
    );
  }

  /** Drop the model's explicit "no text" marker so it can never leak. */
  private stripNoTextMarker(raw: string): string {
    const trimmed = raw.trim();
    if (/^NO_TEXT$/i.test(trimmed)) return "";
    return trimmed.replace(/^["'\s]*NO_TEXT["'\s]*$/i, "");
  }
}

export class TranscribeError extends Error {
  constructor(
    message: string,
    readonly transient: boolean,
  ) {
    super(message);
  }
}

/** Text lives across ALL parts on thinking models — join the text parts. */
function collectText(parts: GeminiPart[]): string {
  return parts
    .filter((p) => typeof p.text === "string" && !p.thought)
    .map((p) => p.text as string)
    .join("")
    .trim();
}

/**
 * Confidence estimate — vision models give no per-word score, so this is an
 * honest heuristic on transcription cleanliness, not a fake precision:
 *  - base 92 for a non-empty verbatim transcription from the pro tier
 *  - minus penalties for transcription-damage signals (many [?], suspicious
 *    markdown leakage, very short output for a full page)
 */
export function estimateConfidence(text: string): number {
  if (!text) return 0;
  let score = 92;
  const illegible = (text.match(/\[\?\]/g) ?? []).length;
  score -= Math.min(30, illegible * 4);
  // Verbatim handwriting should not contain markdown structure.
  if (/^#{1,3}\s/m.test(text) || /\*\*[^*]+\*\*/.test(text)) score -= 10;
  if (text.length < 40) score -= 15;
  return Math.max(5, Math.min(100, score));
}
