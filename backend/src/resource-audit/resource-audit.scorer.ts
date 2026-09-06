/**
 * Resource Audit Engine — advisory scorer.
 *
 * The AI's recommendation is ADVISORY ONLY. It never writes `approved`,
 * `rejected`, or any human-authoritative field; it produces a recommendation
 * + confidence that a human reviewer sees and overrules. Part 1 ships a
 * deterministic, explainable rule engine — the `AuditScorerProvider` port is
 * where a real model adapter plugs in later (Gemini/DeepSeek, same shape).
 *
 * Rules encode the reviewer's first-pass instincts:
 *  - scanned/empty documents (no text layer) can't be audited → needs review
 *  - tiny page counts and garbage text look like mislabeled uploads
 *  - content referencing the declared course code is a genuine signal
 */

export interface AuditInput {
  materialType: string;
  courseCode: string;
  fileName: string;
  fileSize: number;
  pageCount: number | null;
  extractedText: string | null;
  usedOcr: boolean;
}

export interface AuditRecommendation {
  recommendation: "approve" | "needs_review" | "reject";
  /** 0–100 — how confident the scorer is in its own recommendation. */
  confidence: number;
  /** Human-readable explanation shown to the reviewer. */
  summary: string;
  signals: string[];
}

/** Port for a future model-backed scorer. Registered via DI token. */
export interface AuditScorerProvider {
  score(input: AuditInput): Promise<AuditRecommendation>;
}

export const AUDIT_SCORER = Symbol("AUDIT_SCORER");

/** Normalized token overlap between the course code and the text. */
function courseMentionScore(courseCode: string, text: string): number {
  const parts = courseCode.toLowerCase().match(/[a-z]+|\d+/g) ?? [];
  if (parts.length === 0 || text.length === 0) return 0;
  const lower = text.toLowerCase();
  let hits = 0;
  for (const part of parts) {
    // Whole-token match: "101" matches "101" not "4101"; "chm" not "schmuck".
    const re = new RegExp(`(^|[^a-z0-9])${part}([^a-z0-9]|$)`);
    if (re.test(lower)) hits++;
  }
  return hits / parts.length;
}

function looksLikeGarbage(text: string): boolean {
  if (text.length < 80) return true;
  // Ratio of letters+digits+whitespace to total — binary PDFs mis-decoded as
  // text, or OCR garbage, fail this hard.
  const printable = (text.match(/[A-Za-z0-9\s.,;:!?'"()\-]/g) ?? []).length;
  return printable / text.length < 0.85;
}

export class RuleBasedScorer implements AuditScorerProvider {
  async score(input: AuditInput): Promise<AuditRecommendation> {
    const signals: string[] = [];
    let score = 50; // start neutral

    const text = input.extractedText ?? "";
    const textLen = text.replace(/\s+/g, " ").trim().length;

    // ── Text availability ────────────────────────────────────────────
    if (input.usedOcr) {
      signals.push("No text layer — content recovered via OCR");
      score -= 5;
    }
    if (!input.usedOcr && textLen === 0) {
      return {
        recommendation: "needs_review",
        confidence: 90,
        summary:
          "No text could be extracted. The document may be image-only or corrupt; a human must check it.",
        signals: ["zero extractable text"],
      };
    }
    if (textLen > 0 && textLen < 200) {
      signals.push(`Very little text (${textLen} chars)`);
      score -= 15;
    } else if (textLen >= 1200) {
      signals.push(`Substantial content (${textLen} chars)`);
      score += 15;
    }

    // ── Text quality ─────────────────────────────────────────────────
    if (textLen > 0 && looksLikeGarbage(text)) {
      signals.push("Extracted text looks like encoding garbage");
      score -= 25;
    }

    // ── Course relevance ─────────────────────────────────────────────
    const mention = courseMentionScore(input.courseCode, text);
    if (mention >= 0.5) {
      signals.push(`Content references ${input.courseCode}`);
      score += 20;
    } else if (mention === 0 && textLen > 0) {
      signals.push("Declared course never mentioned in content");
      score -= 10;
    }

    // ── Page count sanity ────────────────────────────────────────────
    if (input.pageCount !== null) {
      if (input.pageCount <= 2) {
        signals.push(`Only ${input.pageCount} page(s)`);
        score -= 10;
      } else if (input.pageCount >= 8) {
        signals.push(`${input.pageCount} pages`);
        score += 5;
      }
    }

    // ── Material-type expectations ───────────────────────────────────
    if (input.materialType === "past_question" && input.pageCount !== null && input.pageCount < 4) {
      signals.push("Past questions are rarely this short");
      score -= 10;
    }

    // ── Filename sanity ──────────────────────────────────────────────
    const name = input.fileName.toLowerCase();
    if (/(scan|img|photo|screenshot|whatsapp|download)\d*\.(pdf|jpe?g|png)$/.test(name)) {
      signals.push("Generic/scanner-style filename");
      score -= 5;
    }

    score = Math.max(0, Math.min(100, score));

    if (score >= 70) {
      return {
        recommendation: "approve",
        confidence: score,
        summary: `Content looks genuine and matches the declared course. ${signals.join("; ")}.`,
        signals,
      };
    }
    if (score >= 40) {
      return {
        recommendation: "needs_review",
        confidence: Math.abs(score - 55) < 10 ? 55 : score,
        summary: `Mixed signals — a human should verify. ${signals.join("; ")}.`,
        signals,
      };
    }
    return {
      recommendation: "reject",
      confidence: 100 - score,
      summary: `Content likely doesn't match the declaration. ${signals.join("; ")}.`,
      signals,
    };
  }
}
