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
  studentId: string;
  similarity: number; // 0-100
  kind: "exact" | "near";
}

export interface DuplicateCheckInput {
  selfId: string;
  studentId: string;
  fileHash: string;
  extractedText: string | null;
  fingerprint: string | null;
  /** Recent non-rejected rows with fingerprints or hashes (last 90 days). */
  candidates: Array<{
    id: string;
    studentId: string;
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
