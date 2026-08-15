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

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return [255, 255, 255];
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
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
      try {
        const result = await this.ocrWithGemini(file);
        if (result) return result;
      } catch (err) {
        this.logger.warn(
          `Gemini OCR failed (${err instanceof Error ? err.message : String(err)}) — falling back to tesseract`,
        );
      }
    }

    return this.ocrWithTesseract(file);
  }

  private async ocrWithGemini(
    file: Express.Multer.File,
  ): Promise<{ text: string; confidence: number; readable: boolean; engine: "gemini" } | null> {
    const url = `${this.geminiBaseUrl}/models/${this.geminiModel}:generateContent?key=${this.geminiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: file.mimetype,
                  data: file.buffer.toString("base64"),
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
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      throw new Error(`Gemini HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text || text === "NO_TEXT") return null;
    return {
      text: text.slice(0, 5000),
      confidence: 100,
      readable: text.length >= 2,
      engine: "gemini",
    };
  }

  private async ocrWithTesseract(file: Express.Multer.File): Promise<{
    text: string;
    confidence: number;
    readable: boolean;
    engine: "tesseract";
  }> {
    const worker = await this.getWorker();
    const start = Date.now();
    const { data } = await worker.recognize(file.buffer);
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

  // ── Passport background remover ────────────────────────────────

  async removePassportBackground(
    file: Express.Multer.File,
    colorHex?: string,
  ): Promise<GeneratedFile> {
    if (!IMAGE_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        "Upload a photo (JPG, PNG or WebP) to remove its background.",
      );
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException("Keep the photo under 10 MB.");
    }

    const [targetR, targetG, targetB] = hexToRgb(colorHex || "#FFFFFF");
    const image = sharp(file.buffer).rotate(); // honour EXIF orientation
    const { data, info } = await image
      .removeAlpha()
      .resize({ width: 1024, height: 1024, fit: "inside" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
    // Sample the outer border to estimate the uniform background colour.
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = 0; y < height; y += 4) {
      for (const x of [0, width - 1]) {
        const i = (y * width + x) * channels;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      }
    }
    for (let x = 0; x < width; x += 4) {
      for (const y of [0, height - 1]) {
        const i = (y * width + x) * channels;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      }
    }
    const bgR = r / n, bgG = g / n, bgB = b / n;
    const threshold = 44;

    for (let i = 0; i < data.length; i += channels) {
      const dr = data[i] - bgR, dg = data[i + 1] - bgG, db = data[i + 2] - bgB;
      if (Math.sqrt(dr * dr + dg * dg + db * db) < threshold) {
        data[i] = targetR; data[i + 1] = targetG; data[i + 2] = targetB;
      }
    }

    const out = await sharp(data, { raw: { width, height, channels } })
      .jpeg({ quality: 90 })
      .toBuffer();
    return {
      fileName: `matriq-passport-${Date.now()}.jpg`,
      mimeType: "image/jpeg",
      base64: bytesToBase64(out),
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
