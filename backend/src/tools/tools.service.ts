import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { createWorker, type Worker } from "tesseract.js";
import { spawn } from "child_process";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
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
 * OCR is fully open source: the system Tesseract 5 engine (LSTM) does the
 * actual recognition with sharp image preprocessing — no API key, no network,
 * so it always works. A bundled tesseract.js worker is the fallback for
 * environments without the tesseract binary (e.g. local dev).
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

  // ── Image to Text (OCR) — system Tesseract (open source) ───────

  async ocrImage(file: Express.Multer.File): Promise<{
    text: string;
    confidence: number;
    readable: boolean;
    engine: "tesseract";
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

    // Sharpen the input once (EXIF rotation, grayscale, contrast stretch,
    // upscale small text) — this is what makes Tesseract accurate on photos.
    const preprocessed = await this.preprocessForOcr(file.buffer);

    // Primary: the system `tesseract` binary (installed in the Docker image).
    if (await this.tesseractAvailable()) {
      try {
        return await this.ocrWithSystemTesseract(preprocessed);
      } catch (err) {
        this.logger.warn(
          `System tesseract OCR failed (${err instanceof Error ? err.message : String(err)}) — falling back to the tesseract.js worker`,
        );
      }
    }

    // Fallback: bundled tesseract.js worker (local dev, no binary installed).
    return this.ocrWithTesseract(file);
  }

  /** Lazily probe for the system `tesseract` binary (installed in the Docker image). */
  private tesseractProbe: Promise<boolean> | null = null;

  private tesseractAvailable(): Promise<boolean> {
    if (!this.tesseractProbe) {
      this.tesseractProbe = new Promise((resolve) => {
        const child = spawn("tesseract", ["--version"], { stdio: "ignore" });
        child.on("error", () => resolve(false));
        child.on("close", (code) => resolve(code === 0));
      });
    }
    return this.tesseractProbe;
  }

  /**
   * Run the system tesseract binary with TSV output (per-word confidence) so
   * we can report an honest confidence score, not a made-up 100%.
   */
  private async ocrWithSystemTesseract(
    preprocessed: Buffer,
  ): Promise<{
    text: string;
    confidence: number;
    readable: boolean;
    engine: "tesseract";
  }> {
    const dir = await mkdtemp(join(tmpdir(), "matriq-ocr-"));
    const inputPath = join(dir, "input.png");
    await writeFile(inputPath, preprocessed);

    const start = Date.now();
    try {
      const { text, confidence } = await this.runTesseract(inputPath);
      const readable = text.length >= 4 && confidence >= 40;
      this.logger.log(
        `OCR (tesseract) done in ${Date.now() - start}ms: ${text.length} chars, ${confidence}% conf — ${readable ? "readable" : "not readable"}`,
      );
      return {
        text: readable ? text.slice(0, 5000) : "",
        confidence,
        readable,
        engine: "tesseract",
      };
    } finally {
      void rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private runTesseract(
    inputPath: string,
  ): Promise<{ text: string; confidence: number }> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        "tesseract",
        [inputPath, "stdout", "-l", "eng", "--psm", "3", "tsv"],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      const kill = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("tesseract timed out after 60s"));
      }, 60_000);
      child.on("error", (err) => {
        clearTimeout(kill);
        reject(err);
      });
      child.on("close", (code) => {
        clearTimeout(kill);
        if (code !== 0) {
          reject(
            new Error(`tesseract exited ${code}: ${stderr.slice(0, 200)}`),
          );
          return;
        }
        resolve(this.parseTesseractTsv(stdout));
      });
    });
  }

  /**
   * Parse tesseract's TSV output into line text + mean word confidence.
   * Tesseract leaves the line-level (level 4) text column empty, so we
   * reconstruct each line by grouping the word-level (level 5) rows by their
   * (block, paragraph, line) keys — preserving reading order and line breaks.
   */
  private parseTesseractTsv(tsv: string): { text: string; confidence: number } {
    const rows = tsv.split("\n");
    if (rows.length <= 1) return { text: "", confidence: 0 };
    const lines = new Map<string, string[]>();
    const confs: number[] = [];
    for (let i = 1; i < rows.length; i += 1) {
      const cols = rows[i].split("\t");
      if (cols.length < 12 || cols[0] !== "5") continue; // word-level rows only
      const conf = parseFloat(cols[10]);
      const word = (cols[11] ?? "").trim();
      if (!word) continue;
      const key = `${cols[2]}\u0000${cols[3]}\u0000${cols[4]}`; // block·par·line
      const line = lines.get(key);
      if (line) line.push(word);
      else lines.set(key, [word]);
      if (Number.isFinite(conf) && conf >= 0) confs.push(conf);
    }
    const text = [...lines.values()].map((w) => w.join(" ")).join("\n").trim();
    const confidence = confs.length
      ? Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 10) / 10
      : 0;
    return { text, confidence };
  }

  /**
   * Sharpen the photo for OCR: honour EXIF rotation, convert to grayscale,
   * stretch contrast, and double the size of small text so Tesseract reads it
   * reliably. Best-effort — on any sharp failure we use the original buffer.
   */
  private async preprocessForOcr(input: Buffer): Promise<Buffer> {
    try {
      const image = sharp(input).rotate();
      const meta = await image.metadata();
      const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
      const scale = longest > 0 && longest < 1200 ? 2 : 1;
      const pipeline = image.grayscale().normalize();
      if (scale > 1) {
        pipeline.resize({
          width: Math.round((meta.width ?? 0) * scale) || undefined,
          height: Math.round((meta.height ?? 0) * scale) || undefined,
          fit: "inside",
        });
      }
      return await pipeline.png().toBuffer();
    } catch {
      return input;
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
      `OCR (tesseract.js) done in ${Date.now() - start}ms: ${text.length} chars — ${readable ? "readable" : "not readable"}`,
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
