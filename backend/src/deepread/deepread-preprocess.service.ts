import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "crypto";
import sharp from "sharp";

/**
 * Deep Read preprocessing — capture quality is the #1 accuracy variable for
 * handwriting transcription, so every page image is normalized before it
 * reaches the vision model:
 *
 *   1. auto-rotate from EXIF (phone photos lie about orientation)
 *   2. grayscale + linear contrast stretch + sharpen (pencil on cheap paper,
 *      shadowed margins, uneven lighting)
 *   3. normalize luminance (fades faint ink, tames glare)
 *   4. downscale to ≤ DEEP_READ_MAX_DIMENSION px on the long edge — phone
 *      cameras produce 3000×4000 images; the model needs nowhere near that,
 *      and payload size is the biggest latency driver
 *   5. re-encode as quality-85 JPEG
 *
 * Returns the processed buffer plus a SHA-256 of the ORIGINAL upload — the
 * OCR result cache key. Hashing the original (not the processed bytes) means
 * the same photo re-uploaded through any pipeline still hits the cache.
 */
export interface PreparedPage {
  buffer: Buffer;
  mime: string;
  contentHash: string;
  width: number;
  height: number;
  bytes: number;
}

@Injectable()
export class DeepReadPreprocessService {
  private readonly logger = new Logger(DeepReadPreprocessService.name);
  private readonly maxDimension: number;

  constructor(configService: ConfigService) {
    const raw = Number(configService.get<string>("DEEP_READ_MAX_DIMENSION"));
    this.maxDimension =
      Number.isFinite(raw) && raw >= 800 && raw <= 6000 ? Math.floor(raw) : 2048;
  }

  async prepare(input: Buffer): Promise<PreparedPage> {
    const contentHash = createSha256Hex(input);
    try {
      const image = sharp(input, { failOn: "none" }).rotate();
      const meta = await image.metadata();

      // Downscale first (cheaper), then the tonal pipeline.
      const needsResize =
        (meta.width ?? 0) > this.maxDimension ||
        (meta.height ?? 0) > this.maxDimension;
      let pipeline = needsResize
        ? image.resize({
            width: this.maxDimension,
            height: this.maxDimension,
            fit: "inside",
            withoutEnlargement: true,
          })
        : image;

      pipeline = pipeline
        .grayscale()
        .linear(1.12, -14) // gentle contrast stretch + lift blacks slightly
        .sharpen({ sigma: 0.8 })
        .normalise({ lower: 1, upper: 99 });

      const { data, info } = await pipeline
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });

      return {
        buffer: data,
        mime: "image/jpeg",
        contentHash,
        width: info.width,
        height: info.height,
        bytes: data.length,
      };
    } catch (err) {
      // Corrupt/unsupported image: let the caller decide. We do NOT fall back
      // to the raw upload — a file sharp can't parse is usually a bad capture
      // or a non-image masquerading as one, and neither deserves an API call.
      this.logger.warn(
        `Deep Read preprocessing failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new PreprocessError(
        "That page couldn't be processed — retake the photo with the whole page in frame.",
      );
    }
  }
}

export class PreprocessError extends Error {}

function createSha256Hex(input: Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}
