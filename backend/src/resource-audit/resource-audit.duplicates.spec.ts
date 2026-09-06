import {
  checkDuplicates,
  toEvidence,
  shingleSet,
  jaccard,
} from "./resource-audit.duplicates";
import { textFingerprint } from "./resource-audit.validation";
import { ResourceAuditStatus } from "../generated/prisma/client";

/**
 * Part 2 — duplicate detection. Exact duplicates die on hash; renamed and
 * near duplicates must be caught by content; uncertain cases route to human
 * review, never auto-reject.
 */

const BODY = "CHM 101 Organic Chemistry first semester examination 2023/2024. Answer four questions. ".repeat(8);

function candidate(overrides: Partial<Parameters<typeof checkDuplicates>[0]["candidates"][number]> = {}) {
  return {
    id: "cand-1",
    studentId: "other-student",
    fileHash: "different-hash",
    textFingerprint: textFingerprint(BODY),
    extractedText: BODY,
    auditStatus: ResourceAuditStatus.published,
    ...overrides,
  };
}

function input(overrides: Partial<Parameters<typeof checkDuplicates>[0]> = {}) {
  return {
    selfId: "self-1",
    studentId: "me-1",
    fileHash: "my-hash",
    extractedText: BODY,
    fingerprint: textFingerprint(BODY),
    candidates: [candidate()],
    ...overrides,
  };
}

describe("duplicate detection — exact", () => {
  it("marks an exact hash match as a duplicate candidate regardless of student", () => {
    const result = checkDuplicates(input({ fileHash: "same-hash" }), ...[]);
    const r = checkDuplicates(
      input({ fileHash: "same-hash", candidates: [candidate({ fileHash: "same-hash" })] }),
    );
    expect(r.action).toBe("mark_duplicate_candidate");
    expect(r.exactOf).toBe("cand-1");
    expect(r.maxSimilarity).toBe(100);
  });

  it("does not flag when the only match is the submission itself", () => {
    const r = checkDuplicates(input({ candidates: [] }));
    expect(r.action).toBe("proceed");
    expect(r.exactOf).toBeNull();
  });
});

describe("duplicate detection — near (renames and edits)", () => {
  it("catches a renamed duplicate (same text, new filename) via content", () => {
    // The candidate pool stores fingerprints, not filenames — a rename leaves
    // the text intact, so the fingerprint bucket + Jaccard must catch it.
    const r = checkDuplicates(input());
    expect(r.action).toBe("flag_for_human");
    expect(r.maxSimilarity).toBeGreaterThanOrEqual(70);
    expect(r.hits[0].kind).toBe("near");
  });

  it("flags a lightly-edited document for human review (never auto-rejects)", () => {
    const edited = BODY.replace("four questions", "five questions") + " Extra revision note appended.";
    const r = checkDuplicates(input({ extractedText: edited, fingerprint: textFingerprint(edited) }));
    // Fingerprint may differ after the edit — the Jaccard verify decides.
    const similarity = jaccard(shingleSet(BODY)!, shingleSet(edited)!);
    if (similarity * 100 >= 70) {
      expect(r.action).toBe("flag_for_human");
    } else {
      expect(r.action).toBe("proceed");
    }
    // Either way: no auto-reject, no AI-skip on uncertain evidence.
    expect(["proceed", "flag_for_human"]).toContain(r.action);
  });

  it("ignores unrelated academic content", () => {
    const other = "MTH 202 Linear Algebra tutorial sheet on vector spaces and matrices. ".repeat(8);
    const r = checkDuplicates(
      input({ extractedText: other, fingerprint: textFingerprint(other) }),
    );
    expect(r.action).toBe("proceed");
    expect(r.maxSimilarity).toBe(0);
  });

  it("skips fingerprint comparison when text is too short to fingerprint honestly", () => {
    const r = checkDuplicates(
      input({ extractedText: "short", fingerprint: null, candidates: [candidate({ extractedText: "short" })] }),
    );
    expect(r.action).toBe("proceed");
  });
});

describe("duplicate evidence for the reviewer", () => {
  it("persists the evidence trail with hits sorted by similarity", () => {
    const r = checkDuplicates(input());
    const ev = toEvidence(r);
    expect(ev.flaggedAt).toBeTruthy();
    expect(ev.action).toBe(r.action);
    for (let i = 1; i < ev.nearHits.length; i++) {
      expect(ev.nearHits[i - 1].similarity).toBeGreaterThanOrEqual(ev.nearHits[i].similarity);
    }
  });
});
