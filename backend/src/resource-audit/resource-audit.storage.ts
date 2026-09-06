import { Injectable } from "@nestjs/common";
import * as crypto from "node:crypto";
import { StorageService } from "../storage/storage.service";

/**
 * Resource Audit Engine — storage adapter.
 *
 * Deliberately thin: the engine never talks to MinIO/S3 directly. This is
 * the seam where storage is separated from audit logic — swap the backing
 * store and the pipeline doesn't change.
 *
 * Rule: the original upload is IMMUTABLE. Every processing stage (extraction,
 * OCR, AI audit) re-reads the original bytes, which is what makes stages
 * retryable and idempotent — a retry starts from the same input, always.
 */
@Injectable()
export class ResourceAuditStorage {
  constructor(private readonly storage: StorageService) {}

  /** Object key under which a submission's original file is preserved. */
  originalKey(submissionId: string, fileName: string): string {
    // Strip anything path-like from the filename; the key structure is the
    // authority, the name is display-only.
    const safeName = fileName
      .replace(/[^A-Za-z0-9._-]/g, "_")
      .replace(/_{2,}/g, "_")
      .slice(-80);
    return `resource-audit/${submissionId}/original-${safeName || "file"}`;
  }

  /**
   * Persist the original bytes. Returns the storage key.
   * When object storage is disabled (dev), returns a data-URI reference —
   * the same fallback the Vault uses.
   */
  async saveOriginal(
    submissionId: string,
    fileName: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    const key = this.originalKey(submissionId, fileName);
    const stored = await this.storage.put(key, buffer, mimeType);
    if (stored) return key;
    // Disabled-storage fallback (never used in production — S3_ENDPOINT set).
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  }

  /** Read the original bytes back for a processing stage. */
  async readOriginal(storageRef: string): Promise<Buffer | null> {
    if (storageRef.startsWith("data:")) {
      const base64 = storageRef.slice(storageRef.indexOf(",") + 1);
      return Buffer.from(base64, "base64");
    }
    return this.storage.getBuffer(storageRef);
  }

  /** SHA-256 of the file bytes — the duplicate-detection key. */
  hash(buffer: Buffer): string {
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }
}
