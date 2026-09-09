/**
 * Resource Audit Engine — near-duplicate detection (Part 2).
 *
 * Exact duplicates die on SHA-256 alone. Near duplicates (renames, metadata
 * edits, minor modifications) need content comparison. We use the stored
 * 5-gram shingle fingerprint for cheap bucketing, then verify candidates
 * with a real Jaccard similarity over the shingle sets computed from the
 * extracted texts. Uncertain cases NEVER auto-reject — they get flagged for
 * human review with the evidence attached.
 */

import * as crypto from "node:crypto";
import { ResourceAuditStatus } from "../generated/prisma/client";

export interface ShingleSet {
  [shingle: string]: true;
}

/** Rebuild the shingle set from extracted text (the fingerprint's source). */
export function shingleSet(text: string | null | undefined): ShingleSet | null {
  if (!text) return null;
  const tokens = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length > 2);
  if (tokens.length < 12) return null;
  const set: ShingleSet = {};
  for (let i = 0; i + 5 <= tokens.length; i++) {
    set[tokens.slice(i, i + 5).join(" ")] = true;
  }
  if (Object.keys(set).length < 8) return null;
  return set;
}

export function jaccard(a: ShingleSet, b: ShingleSet): number {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length === 0 || keysB.length === 0) return 0;
  const [small, large] = keysA.length <= keysB.length ? [keysA, keysB] : [keysB, keysA];
  const largeSet = new Set(large);
  let inter = 0;
  for (const k of small) if (largeSet.has(k)) inter += 1;
  return inter / (keysA.length + keysB.length - inter);
}

export interface DuplicateHit {
  submissionId: string;
  studentId: string | null;
  similarity: number; // 0-100
  kind: "exact" | "near";
}

export interface DuplicateCheckInput {
  selfId: string;
  studentId: string | null;
  fileHash: string;
  extractedText: string | null;
  fingerprint: string | null;
  /** Recent non-rejected rows with fingerprints or hashes (last 90 days). */
  candidates: Array<{
    id: string;
    studentId: string | null;
    fileHash: string;
    textFingerprint: string | null;
    extractedText: string | null;
    auditStatus: ResourceAuditStatus;
  }>;
}

export interface DuplicateCheckResult {
  exactOf: string | null;
  hits: DuplicateHit[];
  /** highest similarity across candidates (0-100) */
  maxSimilarity: number;
  /** Deterministic routing decision for the pipeline. */
  action: "proceed" | "mark_duplicate_candidate" | "flag_for_human";
}

const NEAR_FLAG_THRESHOLD = 70;
const NEAR_CERTAIN_THRESHOLD = 92;

/**
 * Compare two content fingerprints: identical → exact (the byte stream is
 * the same document); different → fall through to normal scoring.
 */
export function contentFingerprintMatches(a: string | null | undefined, b: string | null | undefined): boolean {
  return a != null && b != null && a === b;
}

export function checkDuplicates(input: DuplicateCheckInput): DuplicateCheckResult {
  const hits: DuplicateHit[] = [];
  let exactOf: string | null = null;

  const own = shingleSet(input.extractedText);

  for (const candidate of input.candidates) {
    if (candidate.id === input.selfId) continue;

    // 1. Exact hash match — regardless of which student uploaded it.
    if (candidate.fileHash === input.fileHash) {
      exactOf = exactOf ?? candidate.id;
      hits.push({ submissionId: candidate.id, studentId: candidate.studentId, similarity: 100, kind: "exact" });
      continue;
    }

    // 2. Near-duplicate: same fingerprint bucket, then verify by Jaccard.
    if (input.fingerprint && candidate.textFingerprint === input.fingerprint) {
      const candidateSet = shingleSet(candidate.extractedText);
      const similarity = own && candidateSet ? jaccard(own, candidateSet) : 0;
      if (similarity * 100 >= NEAR_FLAG_THRESHOLD) {
        hits.push({
          submissionId: candidate.id,
          studentId: candidate.studentId,
          similarity: Math.round(similarity * 100),
          kind: "near",
        });
      }
    }
  }

  const maxSimilarity = hits.reduce((m, h) => Math.max(m, h.similarity), 0);

  // Routing: exact duplicate of a pending/published submission → duplicate
  // candidate (no AI spend). High-similarity near duplicates → flagged for
  // human review, never auto-rejected. Anything else → proceed.
  let action: DuplicateCheckResult["action"] = "proceed";
  if (exactOf) {
    action = "mark_duplicate_candidate";
  } else if (maxSimilarity >= NEAR_CERTAIN_THRESHOLD) {
    action = "flag_for_human";
  }
  return { exactOf, hits, maxSimilarity, action };
}

/** Persisted evidence for the reviewer. */
export interface DuplicateEvidence {
  exactOf: string | null;
  nearHits: Array<{ submissionId: string; similarity: number }>;
  maxSimilarity: number;
  action: DuplicateCheckResult["action"];
  flaggedAt: string;
}

export function toEvidence(result: DuplicateCheckResult): DuplicateEvidence {
  return {
    exactOf: result.exactOf,
    nearHits: result.hits
      .filter((h) => h.kind === "near")
      .map((h) => ({ submissionId: h.submissionId, similarity: h.similarity }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5),
    maxSimilarity: result.maxSimilarity,
    action: result.action,
    flaggedAt: new Date().toISOString(),
  };
}

/** Stable hash helper reused by the reward engine for abuse windows. */
export function bucketKey(prefix: string, ...parts: (string | number)[]): string {
  return crypto.createHash("sha1").update(`${prefix}:${parts.join(":")}`).digest("hex").slice(0, 24);
}

/**
 * Content fingerprint of the RAW BYTE STREAM — the metadata-immune duplicate
 * key. Re-Encoding (re-export, re-scan, re-save) rewrites every container
 * header/timestamp, which is exactly what breaks a plain SHA-256 match. This
 * fingerprint hashes the file's largest deterministic byte chunks instead:
 *   • PDF   → every `N 0 obj … endobj` body, skipping generation numbers
 *   • Media → every RIFF/PNG/JP2/JPEG chunk segment (ffD8 ffD8-chunked)
 * Only chunks ≥ 64 bytes are included, so tiny structural noise (object
 * counts, xref offsets, EXIF timestamps) can never shift the fingerprint
 * when a file is repackaged. Collisions are theoretically possible but
 * practically negligible — and a hit here routes to a deterministic
 * owner-scoped rejection, the same posture as the exact SHA-256 gate.
 */
export function contentFingerprint(buffer: Buffer, mimeType: string | null | undefined): string | null {
  if (!buffer || buffer.length < 512) return null;
  const head = buffer.subarray(0, 16).toString("latin1");
  let chunks: Buffer[];
  if (head.startsWith("%PDF-")) {
    chunks = pdfObjectChunks(buffer);
  } else if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    chunks = riffChunkBodies(buffer);
  } else if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
  ) {
    chunks = pngChunkBodies(buffer);
  } else if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    // JPEG is a sequence of ffxx markers, not length-prefixed from offset 0.
    // Hash the entropy-coded stream between the SOF markers as one chunk —
    // re-saves preserve scan data byte-for-byte while EXIF/comment segments
    // (the parts that change) are excluded.
    chunks = jpegScanChunks(buffer);
  } else {
    return null; // unknown container — no honest fingerprint
  }
  const significant = chunks.filter((c) => c.length >= 64);
  if (significant.length === 0) return null;
  const hash = crypto.createHash("sha256");
  for (const c of significant) {
    hash.update(c.length.toString(16));
    hash.update(":");
    hash.update(c);
  }
  return hash.digest("hex").slice(0, 32);
}

/** PDF bodies: every `N G obj` … `endobj`, generation number excluded. */
function pdfObjectChunks(buffer: Buffer): Buffer[] {
  const chunks: Buffer[] = [];
  const re = /[^0-9]\d{1,10} \d obj/g;
  const latin = buffer.toString("latin1");
  let m: RegExpExecArray | null;
  while ((m = re.exec(latin)) !== null) {
    const start = m.index + m[0].length;
    const end = latin.indexOf("endobj", start);
    if (end === -1) break;
    chunks.push(buffer.subarray(start, end));
    re.lastIndex = end;
  }
  return chunks;
}

/** RIFF bodies: every length-prefixed sub-chunk after the 12-byte header. */
function riffChunkBodies(buffer: Buffer): Buffer[] {
  const chunks: Buffer[] = [];
  let off = 12;
  while (off + 8 <= buffer.length) {
    const size = buffer.readUInt32LE(off + 4);
    const body = buffer.subarray(off + 8, Math.min(off + 8 + size, buffer.length));
    if (body.length > 0) chunks.push(body);
    off += 8 + size + (size % 2); // chunks are word-aligned
    if (size === 0) break; // guard against corrupt/zero-size loops
  }
  return chunks;
}

/** PNG bodies: every length-prefixed chunk after the 8-byte signature. */
function pngChunkBodies(buffer: Buffer): Buffer[] {
  const chunks: Buffer[] = [];
  let off = 8;
  while (off + 8 <= buffer.length) {
    const size = buffer.readUInt32BE(off);
    const body = buffer.subarray(off + 8, Math.min(off + 8 + size, buffer.length));
    if (body.length > 0) chunks.push(body);
    off += 12 + size; // 4 len + 4 type + body + 4 crc
    if (size === 0 && body.length === 0) break;
  }
  return chunks;
}

/**
 * JPEG entropy-coded data: the bytes between each RST-marker-bounded scan
 * segment. We approximate by slicing from the first SOS (ffDA) to EOI
 * (ffD9), then splitting on restart-interval-safe boundaries at ffD0–ffD7
 * runs — re-encoders preserve scan bytes even when they reshuffle metadata.
 */
function jpegScanChunks(buffer: Buffer): Buffer[] {
  const latin = buffer.toString("latin1");
  const sos = latin.indexOf("\xff\xda");
  const eoi = latin.lastIndexOf("\xff\xd9");
  if (sos === -1 || eoi <= sos) return [];
  return [buffer.subarray(sos + 2, eoi)];
}
