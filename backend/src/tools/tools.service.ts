import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { createWorker, type Worker } from "tesseract.js";
import { spawn } from "child_process";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import pdfParse from "pdf-parse";
import * as mammoth from "mammoth";
import sharp from "sharp";

/**
 * Tools (spec §8 + round-2 QA §7) — server-side utilities so Android and the
 * web build behave identically.
 *
 * OCR is a two-tier pipeline: Tesseract (open source, free, fast) handles the
 * easy case — clean printed text — and a Gemini vision pass rescues everything
 * Tesseract can't read confidently (handwriting, low light, messy photos).
 * The Gemini pass is env-gated and only runs when Tesseract's confidence is
 * below the rescue threshold, so the cheap/open path stays the default and the
 * paid API only touches the scans that actually need it. Without a GEMINI key
 * the behaviour is exactly the old Tesseract-only pipeline.
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

export interface OcrResult {
  text: string;
  confidence: number;
  readable: boolean;
  engine: "tesseract" | "gemini";
}

/**
 * Below this Tesseract confidence we stop trusting it and escalate to the
 * Gemini vision pass. Printed text usually scores 80+, handwriting usually
 * scores < 30 — 55 is a clean split that rescues the genuinely bad scans
 * without paying for the good ones.
 */
const TESSERACT_RESCUE_CONFIDENCE = 55;

/** Longest image side we send to Gemini (photos arrive at 3000×4000; the
 *  downscale is the single biggest latency lever for a vision call). */
const GEMINI_MAX_SIDE = 2048;

/**
 * Gemini OCR prompt — verbatim transcription engineered for handwriting:
 * keep every word / abbreviation / course code / number exactly as written,
 * preserve line breaks, never correct or summarize. NO_TEXT is the
 * machine-readable "there is nothing to read" answer the caller checks for.
 */
const OCR_PROMPT = [
  "Extract every piece of text from this image exactly as written.",
  "The text may be printed or handwritten — read handwriting carefully, including abbreviations, course codes (e.g. CHM 101), numbers and symbols.",
  "Transcribe verbatim: do not correct spelling, expand abbreviations, or summarize.",
  "Preserve line breaks and paragraph structure.",
  "If the image contains no legible text at all, reply with exactly: NO_TEXT",
].join(" ");

@Injectable()
export class ToolsService {
  private readonly logger = new Logger(ToolsService.name);
  private workerPromise: Promise<Worker> | null = null;

  // ── Image to Text (OCR) — system Tesseract (open source) ───────

  async ocrImage(file: Express.Multer.File): Promise<OcrResult> {
    if (!file?.buffer) {
      throw new BadRequestException(
        "Please choose an image with text to read.",
      );
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

    return this.ocrBuffer(file.buffer, file.mimetype);
  }

  /**
   * Run OCR on an in-memory image buffer — shared by /tools/ocr, the Vault
   * document reader and offline-AI file import. Two tiers:
   *
   *   1. Tesseract first (open source, free, fast on printed text).
   *   2. If Tesseract's confidence is below the rescue threshold — the classic
   *      handwriting / low-light / noisy-photo failure — escalate to a Gemini
   *      vision pass (env-gated; without a key this round-trips straight back
   *      to Tesseract's best effort, exactly like the old pipeline).
   */
  async ocrBuffer(buffer: Buffer, mimeType: string): Promise<OcrResult> {
    // Sharpen the input once (EXIF rotation, grayscale, contrast stretch,
    // upscale small text) — this is what makes Tesseract accurate on photos.
    const preprocessed = await this.preprocessForOcr(buffer);

    // Tier 1: the system `tesseract` binary (installed in the Docker image),
    // falling back to the bundled tesseract.js worker when it's unavailable
    // or exits nonzero (local dev, minimal images).
    let tesseractResult: OcrResult | null = null;
    if (await this.tesseractAvailable()) {
      try {
        tesseractResult = await this.ocrWithSystemTesseract(preprocessed);
      } catch (err) {
        this.logger.warn(
          `System tesseract OCR failed (${err instanceof Error ? err.message : String(err)}) — falling back to the tesseract.js worker`,
        );
      }
    }
    if (!tesseractResult) {
      try {
        tesseractResult = await this.ocrWithTesseract(preprocessed);
      } catch (err) {
        this.logger.warn(
          `tesseract.js OCR failed (${err instanceof Error ? err.message : String(err)}) — trying Gemini`,
        );
      }
    }

    // Tier 2: the quality gate. Tesseract nailed it → ship it, no paid API.
    if (tesseractResult && this.isTesseractConfident(tesseractResult)) {
      return tesseractResult;
    }

    // Handwriting / low-quality scans: escalate to the Gemini vision pass.
    if (await this.isGeminiOcrEnabled()) {
      const rescued = await this.ocrWithGemini(preprocessed, mimeType);
      if (rescued && rescued.readable && rescued.text) {
        this.logger.log(
          `OCR (gemini rescue) succeeded — ${rescued.text.length} chars (tesseract was ${tesseractResult ? `${tesseractResult.confidence}% conf` : "unavailable"})`,
        );
        return rescued;
      }
      this.logger.warn(
        `Gemini rescue found no readable text either — keeping tesseract's best effort`,
      );
    }

    // Best effort: whatever Tesseract managed (honest low-confidence result),
    // or an explicit empty result when no engine produced anything.
    return (
      tesseractResult ?? { text: "", confidence: 0, readable: false, engine: "tesseract" }
    );
  }

  /** Tesseract's confidence is trustworthy enough to skip the Gemini pass. */
  private isTesseractConfident(result: OcrResult): boolean {
    return result.readable && result.confidence >= TESSERACT_RESCUE_CONFIDENCE;
  }

  private async isGeminiOcrEnabled(): Promise<boolean> {
    return !!process.env.GEMINI_API_KEY?.trim();
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
  private async ocrWithSystemTesseract(preprocessed: Buffer): Promise<{
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
    const text = [...lines.values()]
      .map((w) => w.join(" "))
      .join("\n")
      .trim();
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

  private async ocrWithTesseract(buffer: Buffer): Promise<OcrResult> {
    // The first run downloads eng traineddata — never let either step hang
    // forever (tesseract.js has no abort handle in this version, so race it).
    const worker = await this.withTimeout(
      this.getWorker(),
      90_000,
      "OCR worker warm-up",
    );
    const start = Date.now();
    const { data } = await this.withTimeout(
      worker.recognize(buffer),
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

  /**
   * Gemini vision pass — the handwriting / low-light rescue. The image is
   * downscaled to ≤GEMINI_MAX_SIDE on the longest side and re-encoded as
   * JPEG before upload (photos arrive at 3000×4000; the downscale is the
   * biggest latency lever for a vision call). One retry on transient failures
   * (5xx/timeout) — same policy as voice transcription. Never throws; returns
   * null only when Gemini is unreachable after the retry, so the caller keeps
   * Tesseract's result instead of failing the request.
   */
  private async ocrWithGemini(
    buffer: Buffer,
    mimeType: string,
  ): Promise<OcrResult | null> {
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) return null;
    const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.7-flash";
    const baseUrl =
      process.env.GEMINI_BASE_URL?.trim() ||
      "https://generativelanguage.googleapis.com/v1beta";

    // Downscale + JPEG re-encode so the vision call stays fast and small.
    let image = buffer;
    let imageMime = mimeType || "image/jpeg";
    try {
      const resized = await sharp(buffer)
        .rotate()
        .resize({
          width: GEMINI_MAX_SIDE,
          height: GEMINI_MAX_SIDE,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 88 })
        .toBuffer();
      image = resized;
      imageMime = "image/jpeg";
    } catch {
      // Keep the original — sharp can still fail on corrupt headers.
    }

    const base64 = image.toString("base64");
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await fetch(
          `${baseUrl}/models/${model}:generateContent?key=${key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { inline_data: { mime_type: imageMime, data: base64 } },
                    { text: OCR_PROMPT },
                  ],
                },
              ],
              generationConfig: { temperature: 0, maxOutputTokens: 8192 },
            }),
            signal: AbortSignal.timeout(60_000),
          },
        );
        if (!res.ok) {
          throw Object.assign(new Error(`Gemini HTTP ${res.status}`), {
            status: res.status,
          });
        }
        const data = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const raw = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? "")
          .trim();
        const text = this.stripNoTextMarker(raw);
        const readable = text.length >= 4;
        this.logger.log(
          `OCR (gemini rescue) attempt ${attempt + 1}: ${text.length} chars — ${readable ? "readable" : "not readable"}`,
        );
        return {
          // Gemini has no per-word confidence; a readable answer means the
          // model genuinely read text off the image, which is the strongest
          // signal we have — the honest marker is the readable flag, not a
          // made-up per-word score.
          text: readable ? text.slice(0, 5000) : "",
          confidence: readable ? 100 : 0,
          readable,
          engine: "gemini",
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        // Transient (network / 5xx / timeout) gets one retry; a 4xx won't
        // succeed on retry.
        const status = (err as { status?: number })?.status;
        if (status && status >= 400 && status < 500) break;
        if (attempt === 0) {
          this.logger.warn(
            `Gemini OCR attempt 1 failed (${lastError.message}) — retrying`,
          );
        }
      }
    }
    this.logger.warn(
      `Gemini OCR unavailable (${lastError?.message ?? "unknown"}) — keeping the tesseract result`,
    );
    return null;
  }

  /** Drop the model's explicit "no text" marker so it can never leak into results. */
  private stripNoTextMarker(raw: string): string {
    const trimmed = raw.trim();
    if (/^NO_TEXT$/i.test(trimmed)) return "";
    // The model can also wrap the marker in quotes or pad it with whitespace.
    return trimmed.replace(/^["'\s]*NO_TEXT["'\s]*$/i, "");
  }

  // ── Extract plain text from a study file (offline-AI material import) ──
  // The mobile app imports the student's own files (with picker permission)
  // and needs plain text to feed the on-device model. PDF/DOCX/photo text
  // extraction runs here once, then the app caches the text on the device so
  // the AI can use it forever after, fully offline.

  async extractText(file: Express.Multer.File): Promise<{
    text: string;
    source: "pdf" | "docx" | "text" | "ocr" | "none";
  }> {
    if (!file?.buffer || !file.buffer.length) {
      throw new BadRequestException("Choose a file to read first.");
    }
    if (file.size > 21 * 1024 * 1024) {
      throw new BadRequestException(
        "That file is too large — keep it under 20 MB for text extraction.",
      );
    }

    const name = (file.originalname ?? "").toLowerCase();

    // PDF → text layer (pdf-parse 1.1.1, Uint8Array trick — see pdfToWord).
    if (file.mimetype === PDF_MIME || name.endsWith(".pdf")) {
      try {
        const data = await pdfParse(
          new Uint8Array(file.buffer) as unknown as Buffer,
        );
        const text = (data.text ?? "").replace(/\s+/g, " ").trim();
        if (text) return { text: text.slice(0, 50_000), source: "pdf" };
      } catch {
        // fall through to "none"
      }
      return { text: "", source: "none" };
    }

    // DOCX → raw text (mammoth preserves paragraph breaks).
    if (file.mimetype === DOCX_MIME || name.endsWith(".docx")) {
      try {
        const { value } = await mammoth.extractRawText({ buffer: file.buffer });
        const text = value?.replace(/\s+/g, " ").trim();
        if (text) return { text: text.slice(0, 50_000), source: "docx" };
      } catch {
        // fall through
      }
      return { text: "", source: "none" };
    }

    // Plain text / markdown → read directly.
    if (
      file.mimetype.startsWith("text/") ||
      name.endsWith(".txt") ||
      name.endsWith(".md")
    ) {
      const text = file.buffer.toString("utf8").replace(/\r\n/g, "\n").trim();
      if (text) return { text: text.slice(0, 50_000), source: "text" };
      return { text: "", source: "none" };
    }

    // Images → OCR (system Tesseract, open source — always works).
    if (IMAGE_MIME_TYPES.has(file.mimetype)) {
      const result = await this.ocrBuffer(file.buffer, file.mimetype);
      if (result.readable && result.text) {
        return { text: result.text, source: "ocr" };
      }
      return { text: "", source: "none" };
    }

    throw new BadRequestException(
      "That file type isn't supported for reading — try a PDF, Word document, text file, or photo.",
    );
  }

  // ── Transcribe a voice note (server-side, Gemini audio understanding) ──
  // Used by the mobile app for voice notes in the AI companion. The on-device
  // whisper model handles this fully offline when downloaded; this endpoint
  // is the online path (and the only path on the web build, which can't run
  // whisper). Env-gated like the AI module: no key → 503 with a clear reason.

  async transcribeAudio(
    file: Express.Multer.File,
  ): Promise<{ text: string; readable: boolean }> {
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) {
      throw new BadRequestException(
        "Voice transcription isn't configured on the server yet.",
      );
    }
    if (!file?.buffer || !file.buffer.length) {
      throw new BadRequestException("Choose a voice note to transcribe.");
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException(
        "That voice note is too long — keep recordings under 10 MB (a few minutes).",
      );
    }
    const mimeType = file.mimetype.startsWith("audio/")
      ? file.mimetype
      : "audio/mpeg";

    const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.7-flash";
    const baseUrl =
      process.env.GEMINI_BASE_URL?.trim() ||
      "https://generativelanguage.googleapis.com/v1beta";
    const base64 = file.buffer.toString("base64");

    let lastError: Error | null = null;
    // One retry on transient failures (5xx/timeout) — same policy as OCR.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await fetch(
          `${baseUrl}/models/${model}:generateContent?key=${key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      inline_data: { mime_type: mimeType, data: base64 },
                    },
                    {
                      text: "Transcribe this voice note verbatim. Keep the student's exact words and any numbers. Return only the transcript, no commentary.",
                    },
                  ],
                },
              ],
              generationConfig: { temperature: 0, maxOutputTokens: 4096 },
            }),
            signal: AbortSignal.timeout(60_000),
          },
        );
        if (!res.ok) {
          throw new Error(`Gemini HTTP ${res.status}`);
        }
        const data = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const text = (
          data.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
        ).trim();
        const readable = text.length >= 2;
        this.logger.log(
          `Voice note transcribed: ${text.length} chars (attempt ${attempt + 1})`,
        );
        return { text: readable ? text.slice(0, 5000) : "", readable };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        // Only transient failures (network, 5xx) get the retry — a 4xx won't
        // succeed on retry.
        const status = (err as { status?: number })?.status;
        if (status && status >= 400 && status < 500) break;
        if (attempt === 0) {
          this.logger.warn(
            `Voice transcription attempt 1 failed (${lastError.message}) — retrying`,
          );
        }
      }
    }
    throw new BadRequestException(
      `Couldn't transcribe the voice note right now (${lastError?.message ?? "unknown error"}). Try again in a moment.`,
    );
  }
}
