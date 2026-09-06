import { ConfigService } from "@nestjs/config";

/**
 * Resource Audit Engine — configurable limits.
 *
 * All values come from environment variables so operations can tune the
 * engine without a redeploy. Defaults are deliberately conservative.
 */

/** MIME types the engine accepts. Magic-byte sniffing re-verifies these. */
export const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const SUPPORTED_MIME_SET: ReadonlySet<string> = new Set(
  SUPPORTED_MIME_TYPES,
);

export interface ResourceAuditConfig {
  /** Hard cap on uploaded file size (bytes). */
  maxFileSizeBytes: number;
  /** MIME types the engine accepts (validated again by magic-byte sniffing). */
  allowedMimeTypes: readonly string[];
  /** Submissions allowed per student per rolling window. */
  submissionsPerWindow: number;
  /** Rolling window length in seconds for the submission cap. */
  windowSeconds: number;
  /** How many times a stage is retried before the submission is marked failed. */
  maxStageAttempts: number;
  /** Text-extraction threshold: below this many chars the doc is "scanned". */
  minExtractedChars: number;
  /** Version string recorded for the rights declaration students accept. */
  rightsVersion: string;
}

const DEFAULTS = {
  maxFileSizeBytes: 20 * 1024 * 1024, // 20 MB — same as the Vault
  submissionsPerWindow: 10,
  windowSeconds: 3600,
  maxStageAttempts: 3,
  minExtractedChars: 200,
  rightsVersion: "1.0",
};

export function loadResourceAuditConfig(
  configService: ConfigService | null,
): ResourceAuditConfig {
  const num = (key: string, fallback: number): number => {
    const raw = configService?.get<string>(key);
    if (!raw) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  const mimeRaw = configService?.get<string>("RESOURCE_AUDIT_MIME_TYPES");
  const mimeList = mimeRaw
    ? mimeRaw
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean)
    : SUPPORTED_MIME_TYPES;

  return {
    maxFileSizeBytes: num(
      "RESOURCE_AUDIT_MAX_FILE_BYTES",
      DEFAULTS.maxFileSizeBytes,
    ),
    allowedMimeTypes: mimeList.length > 0 ? mimeList : SUPPORTED_MIME_TYPES,
    submissionsPerWindow: num(
      "RESOURCE_AUDIT_RATE_LIMIT",
      DEFAULTS.submissionsPerWindow,
    ),
    windowSeconds: num(
      "RESOURCE_AUDIT_RATE_WINDOW_SECONDS",
      DEFAULTS.windowSeconds,
    ),
    maxStageAttempts: num(
      "RESOURCE_AUDIT_MAX_STAGE_ATTEMPTS",
      DEFAULTS.maxStageAttempts,
    ),
    minExtractedChars: num(
      "RESOURCE_AUDIT_MIN_EXTRACTED_CHARS",
      DEFAULTS.minExtractedChars,
    ),
    rightsVersion: configService?.get<string>("RESOURCE_AUDIT_RIGHTS_VERSION") ?? DEFAULTS.rightsVersion,
  };
}

/**
 * Magic-byte sniffing — the client's declared MIME type is never trusted.
 * Returns the detected type, or null when the bytes match nothing we accept.
 */
export function detectMimeType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  // PDF: "%PDF-" at offset 0
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    return "application/pdf";
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  // WEBP: "RIFF" .... "WEBP"
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}
