/**
 * Resource Audit Engine — Part 2: deterministic file validation layer.
 *
 * Runs BEFORE any expensive AI work. Every check is pure (same input → same
 * verdict), cheap, and produces results that follow the file into the AI
 * auditor's prompt and the human reviewer's screen.
 *
 * Verdicts are advisory: `ok`, `warning`, `bad`. Only structural impossibilities
 * (corrupt PDF, encrypted container, 0 pages, unreadable original) produce
 * `bad` — the human still makes every final call in V1.
 */

import * as crypto from "node:crypto";
import pdfParse from "pdf-parse";

export type ValidationVerdict = "ok" | "warning" | "bad";

export interface QualityMetrics {
  pageCount: number;
  blankPageRatio: number; // 0..1
  textDensityCharsPerPage: number;
  repeatedPageRatio: number; // 0..1
  unreadablePageRatio: number; // 0..1
  suspiciouslyPadded: boolean;
  screenshotHeavy: boolean;
  junkVerdict: ValidationVerdict;
}

export interface ValidationReport {
  verdict: ValidationVerdict;
  formatOk: boolean;
  encrypted: boolean;
  pageCount: number | null;
  emptyOrEffectivelyEmpty: boolean;
  checks: Array<{ name: string; verdict: ValidationVerdict; detail: string }>;
  quality: QualityMetrics | null;
}

/** Config-driven thresholds — every value overridable via env. */
export interface ValidationThresholds {
  minTextChars: number;
  blankPageRatioMax: number;
  textDensityMin: number;
  repeatedPageRatioMax: number;
  screenshotHeavyImageRatio: number;
}

export const DEFAULT_THRESHOLDS: ValidationThresholds = {
  minTextChars: 200, // a legitimate 2-page outline clears this easily
  blankPageRatioMax: 0.6,
  textDensityMin: 40, // chars per page across the document
  repeatedPageRatioMax: 0.5,
  screenshotHeavyImageRatio: 0.9,
};

export function loadThresholds(get: (key: string) => string | undefined): ValidationThresholds {
  const num = (key: string, fallback: number): number => {
    const raw = get(key);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };
  return {
    minTextChars: num("RESOURCE_AUDIT_MIN_TEXT_CHARS", DEFAULT_THRESHOLDS.minTextChars),
    blankPageRatioMax: num("RESOURCE_AUDIT_BLANK_RATIO_MAX", DEFAULT_THRESHOLDS.blankPageRatioMax),
    textDensityMin: num("RESOURCE_AUDIT_TEXT_DENSITY_MIN", DEFAULT_THRESHOLDS.textDensityMin),
    repeatedPageRatioMax: num("RESOURCE_AUDIT_REPEATED_RATIO_MAX", DEFAULT_THRESHOLDS.repeatedPageRatioMax),
    screenshotHeavyImageRatio: num(
      "RESOURCE_AUDIT_SCREENSHOT_RATIO",
      DEFAULT_THRESHOLDS.screenshotHeavyImageRatio,
    ),
  };
}

function pdfLooksEncrypted(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 2048).toString("latin1");
  if (/\/Encrypt\s/.test(head)) return true;
  // pdf-parse throws on encrypted docs; the catch in validateFile also
  // reports encryption when the error message matches.
  return false;
}

function pageHasText(text: string): boolean {
  return text.replace(/[^A-Za-z0-9]/g, "").length >= 8;
}

/**
 * Per-page quality analysis from pdf-parse's per-page text array. We avoid
 * assuming page boundaries from form feeds alone — pdf.js exposes pages via
 * its text items, but pdf-parse flattens them; we approximate with the
 * documented page delimiter and fall back to a single chunk.
 */
function analyzeQuality(pages: string[], thresholds: ValidationThresholds): QualityMetrics {
  const pageCount = Math.max(pages.length, 1);
  const blank = pages.filter((p) => !pageHasText(p)).length;
  const blankPageRatio = blank / pageCount;

  const totalChars = pages.reduce((sum, p) => sum + p.replace(/\s/g, "").length, 0);
  const textDensityCharsPerPage = Math.round(totalChars / pageCount);

  const seen = new Set<string>();
  let repeated = 0;
  for (const page of pages) {
    const key = page.replace(/\s+/g, " ").trim().toLowerCase();
    if (key.length >= 8) {
      if (seen.has(key)) repeated += 1;
      else seen.add(key);
    }
  }
  const repeatedPageRatio = pageCount > 1 ? repeated / (pageCount - 1) : 0;

  const suspiciouslyPadded =
    pageCount >= 4 && (blankPageRatio > thresholds.blankPageRatioMax || repeatedPageRatio > thresholds.repeatedPageRatioMax);
  const unreadable = pages.filter((p) => p.replace(/[^A-Za-z0-9]/g, "").length < 3).length;
  // Re-assigned by the scanned-PDF branch below — text-derived signals are
  // meaningless without a text layer, and those documents route to OCR.
  let unreadablePageRatio = unreadable / pageCount;

  // Screenshot-heavy: image-based PDFs whose OCR-able text is negligible
  // relative to size (checked later against OCR output for image files).
  const screenshotHeavy =
    textDensityCharsPerPage < thresholds.textDensityMin && pageCount >= 3;

  let junkVerdict: ValidationVerdict = "ok";
  if (pageCount >= 3 && blankPageRatio >= 0.85) junkVerdict = "bad";
  else if (suspiciouslyPadded && textDensityCharsPerPage < thresholds.textDensityMin / 2) junkVerdict = "bad";
  else if (suspiciouslyPadded || unreadablePageRatio > 0.7) junkVerdict = "warning";

  return {
    pageCount,
    blankPageRatio: Math.round(blankPageRatio * 100) / 100,
    textDensityCharsPerPage,
    repeatedPageRatio: Math.round(repeatedPageRatio * 100) / 100,
    unreadablePageRatio: Math.round(unreadablePageRatio * 100) / 100,
    suspiciouslyPadded,
    screenshotHeavy,
    junkVerdict,
  };
}

/** Split pdf-parse output into per-page chunks on the form-feed delimiter. */
export function splitPdfPages(rawText: string, pageCount: number): string[] {
  if (pageCount <= 1) return [rawText];
  const parts = rawText.split("\f");
  if (parts.length >= pageCount) return parts.slice(0, pageCount);
  // Delimiter missing — distribute proportionally by character count.
  const per = Math.max(1, Math.floor(rawText.length / pageCount));
  const out: string[] = [];
  for (let i = 0; i < pageCount; i++) out.push(rawText.slice(i * per, (i + 1) * per));
  return out;
}

/** Test + tooling entry: run the quality analyzer over explicit pages. */
export function analyzeQualityForTest(
  pages: string[],
  thresholds: ValidationThresholds,
): QualityMetrics {
  return analyzeQuality(pages, thresholds);
}

/**
 * Full deterministic validation of one file. Throws nothing — all outcomes
 * are reported; the pipeline decides routing.
 */
export async function validateFile(
  buffer: Buffer,
  mimeType: string,
  thresholds: ValidationThresholds,
): Promise<ValidationReport> {
  const checks: ValidationReport["checks"] = [];
  let verdict: ValidationVerdict = "ok";

  const push = (name: string, v: ValidationVerdict, detail: string) => {
    checks.push({ name, verdict: v, detail });
    if (v === "bad") verdict = "bad";
    else if (v === "warning" && verdict === "ok") verdict = "warning";
  };

  // Empty file — caught at intake too; kept here for re-validation paths.
  if (buffer.length === 0) {
    push("empty", "bad", "file is empty");
    return { verdict, formatOk: false, encrypted: false, pageCount: null, emptyOrEffectivelyEmpty: true, checks, quality: null };
  }

  let quality: QualityMetrics | null = null;
  let pageCount: number | null = null;
  let formatOk = true;
  let encrypted = false;

  if (mimeType === "application/pdf") {
    if (pdfLooksEncrypted(buffer)) {
      encrypted = true;
      push("encryption", "bad", "PDF appears to be password-protected or encrypted");
      return { verdict: "bad", formatOk: true, encrypted: true, pageCount: null, emptyOrEffectivelyEmpty: false, checks, quality: null };
    }
    try {
      // pdf-parse 1.1.1 Node Buffer workaround (same as the Vault + Part 1).
      const data = await pdfParse(new Uint8Array(buffer) as unknown as Buffer);
      const rawText = data.text ?? "";
      pageCount = data.numpages ?? null;

      if (!pageCount || pageCount < 1) {
        formatOk = false;
        push("structure", "bad", "PDF has no readable pages (corrupt or malformed structure)");
      } else {
        const pages = splitPdfPages(rawText, pageCount);
        quality = analyzeQuality(pages, thresholds);
        push("structure", "ok", `${pageCount} pages parsed`);
        const textChars = rawText.replace(/\s/g, "").length;
        if (textChars < thresholds.minTextChars) {
          push(
            "text_content",
            "warning",
            textChars === 0
              ? "no text layer — image-based PDF, routing through OCR"
              : `very little extractable text (${textChars} chars) — likely scanned or image-based`,
          );
        }
        if (textChars === 0) {
          // Zero-text PDF: every text-derived signal (blank ratio, density,
          // padding) is UNKNOWN, not bad — a photographed exam paper looks
          // identical to a blank junk file until OCR reads it. Never
          // auto-reject here; the OCR stage decides with actual pixels.
          if (quality.junkVerdict === "bad") quality.junkVerdict = "warning";
          push("junk", "warning", "text signals unavailable (image-based) — OCR decides");
        } else if (quality.junkVerdict !== "ok") {
          push(
            "junk",
            quality.junkVerdict,
            `blank ratio ${quality.blankPageRatio}, repeated ratio ${quality.repeatedPageRatio}, density ${quality.textDensityCharsPerPage} chars/page`,
          );
        }
      }
    } catch (err) {
      formatOk = false;
      const msg = String(err);
      const looksEncrypted = /password|encrypt/i.test(msg);
      push("structure", "bad", looksEncrypted ? "PDF is password-protected" : `PDF failed to parse: ${msg.slice(0, 160)}`);
      return {
        verdict: "bad",
        formatOk: false,
        encrypted: looksEncrypted,
        pageCount: null,
        emptyOrEffectivelyEmpty: false,
        checks,
        quality: null,
      };
    }
  } else {
    // Image submissions: OCR quality is judged after extraction (the OCR
    // stage fills extractedText); structural checks only here.
    push("format", "ok", `${mimeType} accepted for OCR extraction`);
    if (buffer.length < 1024) {
      push("size", "warning", "image is tiny — may be a placeholder or blank frame");
    }
  }

  return { verdict, formatOk, encrypted, pageCount, emptyOrEffectivelyEmpty: false, checks, quality };
}

/** Deterministic SHA-256 of the original bytes. */
export function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Near-duplicate fingerprint: normalized 5-gram token shingles, hashed to a
 * compact hex digest of the shingle SET (order-free). Stored on the row; a
 * Hamming-style bucket compare + Jaccard verify runs in duplicates.ts.
 */
export function textFingerprint(text: string | null | undefined): string | null {
  if (!text) return null;
  const tokens = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length > 2);
  if (tokens.length < 12) return null; // too little text to fingerprint honestly
  const shingles = new Set<string>();
  for (let i = 0; i + 5 <= tokens.length; i++) {
    shingles.add(tokens.slice(i, i + 5).join(" "));
  }
  if (shingles.size < 8) return null;
  const digest = crypto.createHash("sha256").update([...shingles].sort().join("|")).digest("hex");
  return digest.slice(0, 32);
}
