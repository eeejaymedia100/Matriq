import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { createWorker, type Worker } from "tesseract.js";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import pdfParse from "pdf-parse";
import * as mammoth from "mammoth";
import { Document, Packer, Paragraph, TextRun } from "docx";
import sharp from "sharp";
import { zipSync } from "fflate";

/**
 * Tools (spec §8 + round-2 QA §7) — server-side utilities so Android and the
 * web build behave identically.
 *
 * OCR now prefers the Gemini vision API (round-2 QA §7/§13) and falls back to
 * the bundled tesseract worker when Gemini isn't configured or errors — so the
 * feature never hard-fails on a missing key.
 */

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const PDF_MIME = "application/pdf";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export interface GeneratedFile {
  fileName: string;
  mimeType: string;
  base64: string;
}

function bytesToBase64(bytes: Uint8Array | Buffer): string {
  return Buffer.from(bytes).toString("base64");
}

/** Paragraph-preserving word-wrap + pagination for text → PDF. */
function paginateText(
  text: string,
  maxCharsPerLine: number,
  linesPerPage: number,
): string[][] {
  const paragraphs = text
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const lines: string[] = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    let current = "";
    for (const word of words) {
      if ((current + " " + word).trim().length > maxCharsPerLine) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = (current + " " + word).trim();
      }
    }
    if (current) lines.push(current);
    lines.push(""); // blank line between paragraphs
  }
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage));
  }
  return pages.length > 0 ? pages : [[]];
}

@Injectable()
export class ToolsService {
  private readonly logger = new Logger(ToolsService.name);
  private workerPromise: Promise<Worker> | null = null;

  private get geminiKey(): string | undefined {
    return process.env.GEMINI_API_KEY?.trim() || undefined;
  }
  private get geminiModel(): string {
    return process.env.GEMINI_MODEL?.trim() || "gemini-3.7-flash";
  }
  private get geminiBaseUrl(): string {
    return (
      process.env.GEMINI_BASE_URL?.trim() ||
      "https://generativelanguage.googleapis.com/v1beta"
    );
  }

  // ── Image to Text (OCR) — Gemini-first, tesseract fallback ──────

  async ocrImage(file: Express.Multer.File): Promise<{
    text: string;
    confidence: number;
    readable: boolean;
    engine: "gemini" | "tesseract";
  }> {
    if (!file?.buffer) {
      throw new BadRequestException("Please choose an image with text to read.");
    }
    if (!IMAGE_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        "That file type isn't supported — upload a photo (JPG, PNG or WebP).",
      );
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException(
        "That image is too large — keep it under 10 MB for text reading.",
      );
    }

    if (this.geminiKey) {
      // Gemini is the primary engine — a single retry absorbs the transient
      // 5xx / "high demand" 503s the API returns under load.
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const result = await this.ocrWithGemini(file);
          if (result) return result;
          // null = the model said there is no text — don't retry, fall through.
          break;
        } catch (err) {
          const retryable = this.isRetryableGeminiError(err);
          this.logger.warn(
            `Gemini OCR attempt ${attempt} failed (${err instanceof Error ? err.message : String(err)})${retryable && attempt === 1 ? " — retrying once" : " — falling back to tesseract"}`,
          );
          if (!retryable || attempt === 2) break;
        }
      }
    }

    return this.ocrWithTesseract(file);
  }

  /** A 4xx (bad request / model gated) won't heal on retry — 5xx/timeouts will. */
  private isRetryableGeminiError(err: unknown): boolean {
    const msg =
      err instanceof Error ? err.message : String(err);
    if (msg.startsWith("Gemini HTTP 5")) return true;
    return /timeout|aborted|fetch failed|ECONN|ETIMEDOUT|ENOTFOUND/i.test(msg);
  }

  private async ocrWithGemini(
    file: Express.Multer.File,
  ): Promise<{ text: string; confidence: number; readable: boolean; engine: "gemini" } | null> {
    // Phones upload 3000×4000 photos — downscale before sending so the API
    // round-trip is fast and stays well under Gemini's 20 MB inline limit.
    const prepared = await this.prepareImageForGemini(file);
    const url = `${this.geminiBaseUrl}/models/${this.geminiModel}:generateContent?key=${this.geminiKey}`;
    const controller = new AbortController();
    // Gemini can be slow under load (observed 14s+ on this key) — allow up
    // to 60s before giving up, then the tesseract fallback takes over.
    const timer = setTimeout(() => controller.abort(), 60_000);
    const start = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: prepared.mimeType,
                    data: prepared.data,
                  },
                },
                {
                  text:
                    "Extract all the readable text from this image. Return only the extracted text, " +
                    "preserving line breaks where possible. If there is no readable text, reply with exactly: NO_TEXT",
                },
              ],
            },
          ],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      throw new Error(`Gemini HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    // Defensive: strip any markdown fences the model wraps the answer in.
    const text = raw
      .replace(/```(?:text)?\s*/gi, "")
      .replace(/```/g, "")
      .replace(/\s+/g, " ")
      .trim();
    this.logger.log(
      `OCR (gemini) done in ${Date.now() - start}ms: ${text.length} chars`,
    );
    // The model signals "no readable text" — handle quoting/punctuation.
    if (!text || /^["'`\s]*(NO_TEXT|NO TEXT)[.!]?["'`\s]*$/i.test(text)) {
      return null;
    }
    return {
      text: text.slice(0, 5000),
      confidence: 100,
      readable: text.length >= 2,
      engine: "gemini",
    };
  }

  /**
   * Normalise the upload for the Gemini API: honour EXIF rotation and cap the
   * longest edge at 2048px (re-encoding JPEG keeps photos small and fast).
   */
  private async prepareImageForGemini(
    file: Express.Multer.File,
  ): Promise<{ mimeType: string; data: string }> {
    try {
      const image = sharp(file.buffer).rotate();
      const meta = await image.metadata();
      const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
      if (longest > 2048) {
        const out = await image
          .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
        return { mimeType: "image/jpeg", data: out.toString("base64") };
      }
      return { mimeType: file.mimetype, data: file.buffer.toString("base64") };
    } catch {
      // sharp is best-effort here — send the original if preprocessing fails.
      return { mimeType: file.mimetype, data: file.buffer.toString("base64") };
    }
  }

  private async ocrWithTesseract(file: Express.Multer.File): Promise<{
    text: string;
    confidence: number;
    readable: boolean;
    engine: "tesseract";
  }> {
    // The first run downloads eng traineddata — never let either step hang
    // forever (tesseract.js has no abort handle in this version, so race it).
    const worker = await this.withTimeout(
      this.getWorker(),
      90_000,
      "OCR worker warm-up",
    );
    const start = Date.now();
    const { data } = await this.withTimeout(
      worker.recognize(file.buffer),
      60_000,
      "OCR recognition",
    );
    const text = (data.text ?? "").replace(/\s+/g, " ").trim();
    const confidence = Math.round((data.confidence ?? 0) * 10) / 10;
    const readable = text.length >= 4 && confidence >= 40;

    this.logger.log(
      `OCR (tesseract) done in ${Date.now() - start}ms: ${text.length} chars — ${readable ? "readable" : "not readable"}`,
    );
    return {
      text: readable ? text.slice(0, 5000) : "",
      confidence,
      readable,
      engine: "tesseract",
    };
  }

  /** Reject a promise if it doesn't settle in time (best-effort timeout). */
  private async withTimeout<T>(
    p: Promise<T>,
    ms: number,
    label: string,
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} timed out after ${ms / 1000}s`)),
        ms,
      );
    });
    try {
      return await Promise.race([p, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** Lazy, shared tesseract worker (cold start downloads eng data once). */
  private getWorker(): Promise<Worker> {
    if (!this.workerPromise) {
      this.workerPromise = createWorker("eng").catch((err) => {
        this.workerPromise = null;
        throw err;
      });
      this.logger.log("Tesseract worker warming up…");
    }
    return this.workerPromise;
  }

  // ── PDF merge ──────────────────────────────────────────────────

  async mergePdfs(files: Express.Multer.File[]): Promise<GeneratedFile> {
    if (!files?.length) {
      throw new BadRequestException("Choose at least one PDF to merge.");
    }
    const merged = await PDFDocument.create();
    for (const f of files) {
      this.assertPdf(f);
      const src = await PDFDocument.load(f.buffer);
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
    }
    const bytes = await merged.save();
    return {
      fileName: `matriq-merged-${Date.now()}.pdf`,
      mimeType: PDF_MIME,
      base64: bytesToBase64(bytes),
    };
  }

  // ── PDF split (every page → its own PDF, zipped) ────────────────

  async splitPdf(file: Express.Multer.File): Promise<GeneratedFile> {
    this.assertPdf(file);
    const src = await PDFDocument.load(file.buffer);
    const parts: Record<string, Uint8Array> = {};
    const indices = src.getPageIndices();
    if (indices.length === 0) {
      throw new BadRequestException("This PDF has no pages to split.");
    }
    for (const i of indices) {
      const single = await PDFDocument.create();
      const [page] = await single.copyPages(src, [i]);
      single.addPage(page);
      parts[`page-${String(i + 1).padStart(2, "0")}.pdf`] = await single.save();
    }
    const zip = zipSync(parts, { level: 6 });
    return {
      fileName: `matriq-pages-${Date.now()}.zip`,
      mimeType: "application/zip",
      base64: bytesToBase64(zip),
    };
  }

  // ── PDF → Word (.docx) ─────────────────────────────────────────

  async pdfToWord(file: Express.Multer.File): Promise<GeneratedFile> {
    this.assertPdf(file);
    // NOTE: pdf-parse is pinned to 1.1.1 (the `{ text }` contract). v2.x has a
    // totally different structured API — don't "upgrade" it blindly.
    const data = await pdfParse(file.buffer);
    const text = data.text?.trim();
    if (!text) {
      throw new BadRequestException(
        "No text could be extracted from this PDF — it may be scanned images. Try OCR instead.",
      );
    }
    const lines = text.split(/\r?\n/);
    const doc = new Document({
      sections: [
        {
          children: lines.map(
            (line) =>
              new Paragraph({
                children: [new TextRun(line || "")],
                spacing: { after: 120 },
              }),
          ),
        },
      ],
    });
    const buf = await Packer.toBuffer(doc);
    return {
      fileName: `matriq-converted-${Date.now()}.docx`,
      mimeType: DOCX_MIME,
      base64: bytesToBase64(buf),
    };
  }

  // ── Word (.docx) → PDF ─────────────────────────────────────────

  async wordToPdf(file: Express.Multer.File): Promise<GeneratedFile> {
    if (file.mimetype !== DOCX_MIME && !/\.docx$/i.test(file.originalname ?? "")) {
      throw new BadRequestException(
        "Upload a .docx file to convert to PDF.",
      );
    }
    const { value: text } = await mammoth.extractRawText({ buffer: file.buffer });
    if (!text?.trim()) {
      throw new BadRequestException("This document appears to be empty.");
    }

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontSize = 11;
    const lineHeight = 16;
    const margin = 60;
    const pageW = 612;
    const pageH = 792;
    const maxChars = 90;
    const linesPerPage = Math.floor((pageH - margin * 2) / lineHeight);

    const pages = paginateText(text, maxChars, linesPerPage);
    for (const pageLines of pages) {
      const page = pdf.addPage([pageW, pageH]);
      let y = pageH - margin;
      for (const line of pageLines) {
        if (line) {
          page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
        }
        y -= lineHeight;
      }
    }
    const bytes = await pdf.save();
    return {
      fileName: `matriq-converted-${Date.now()}.pdf`,
      mimeType: PDF_MIME,
      base64: bytesToBase64(bytes),
    };
  }

  // ── Helpers ────────────────────────────────────────────────────

  private assertPdf(file: Express.Multer.File): void {
    if (!file?.buffer) {
      throw new BadRequestException("Choose a PDF file first.");
    }
    if (file.mimetype !== PDF_MIME && !/\.pdf$/i.test(file.originalname ?? "")) {
      throw new BadRequestException("Upload a PDF file.");
    }
  }
}
