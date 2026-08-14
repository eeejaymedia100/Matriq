import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { createWorker, type Worker } from "tesseract.js";

/**
 * Image to Text (OCR) — spec §8.
 *
 * Runs server-side (tesseract.js) so both Android and the web build get the
 * same result. Honesty check per spec: if almost no text was detected, we
 * say so plainly instead of returning garbage — the app then shows
 * "No readable text found — try a clearer photo".
 */

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MIN_TEXT_CHARS = 4;
const MIN_CONFIDENCE = 40;

@Injectable()
export class ToolsService {
  private readonly logger = new Logger(ToolsService.name);
  private workerPromise: Promise<Worker> | null = null;

  async ocrImage(file: Express.Multer.File): Promise<{
    text: string;
    confidence: number;
    readable: boolean;
  }> {
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

    try {
      const worker = await this.getWorker();
      const start = Date.now();
      const { data } = await worker.recognize(file.buffer);
      const text = (data.text ?? "").replace(/\s+/g, " ").trim();
      const confidence = Math.round((data.confidence ?? 0) * 10) / 10;
      const readable =
        text.length >= MIN_TEXT_CHARS && confidence >= MIN_CONFIDENCE;

      this.logger.log(
        `OCR done in ${Date.now() - start}ms: ${text.length} chars, confidence ${confidence} — ${readable ? "readable" : "not readable"}`,
      );

      return {
        text: readable ? text.slice(0, 5000) : "",
        confidence,
        readable,
      };
    } catch (err) {
      this.logger.error(
        `OCR failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new BadRequestException(
        "We couldn't read that image right now. Try a clearer photo or try again in a moment.",
      );
    }
  }

  /** Lazy, shared tesseract worker (cold start downloads eng data once). */
  private getWorker(): Promise<Worker> {
    if (!this.workerPromise) {
      this.workerPromise = createWorker("eng").catch((err) => {
        this.workerPromise = null;
        throw err;
      });
      this.logger.log(
        "Tesseract worker warming up (first OCR may take a few seconds)…",
      );
    }
    return this.workerPromise;
  }
}
