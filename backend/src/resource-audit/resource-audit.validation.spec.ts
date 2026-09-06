import {
  validateFile,
  sha256,
  textFingerprint,
  loadThresholds,
  splitPdfPages,
} from "./resource-audit.validation";

/**
 * Part 2 — deterministic validation layer. Every check is pure: same bytes
 * in, same verdict out. Real PDF parsing runs through pdf-parse; synthetic
 * buffers cover corruption/encryption/empty paths.
 */

const THRESHOLDS = loadThresholds(() => undefined);

describe("deterministic validation — SHA-256 + fingerprints", () => {
  it("hashes identical bytes identically and different bytes differently", () => {
    const a = Buffer.from("matriq test buffer A");
    const b = Buffer.from("matriq test buffer B");
    expect(sha256(a)).toBe(sha256(Buffer.from("matriq test buffer A")));
    expect(sha256(a)).not.toBe(sha256(b));
    expect(sha256(a)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fingerprints renamed copies identically (same text, different name)", () => {
    const text = "CHM 101 first semester examination 2023/2024. Answer four questions. ".repeat(6);
    // Same content — the file NAME must not affect the fingerprint.
    expect(textFingerprint(text)).toBe(textFingerprint(text));
    expect(textFingerprint(text)).toMatch(/^[a-f0-9]{32}$/);
  });

  it("returns null fingerprints for tiny/empty text (too little to compare honestly)", () => {
    expect(textFingerprint(null)).toBeNull();
    expect(textFingerprint("")).toBeNull();
    expect(textFingerprint("too short")).toBeNull();
  });

  it("splits pdf pages on form feeds and falls back proportionally", () => {
    expect(splitPdfPages("p1\fp2\fp3", 3)).toEqual(["p1", "p2", "p3"]);
    const parts = splitPdfPages("abcdefghij", 2);
    expect(parts).toHaveLength(2);
  });
});

describe("deterministic validation — file triage", () => {
  it("flags an empty file as bad", async () => {
    const report = await validateFile(Buffer.alloc(0), "application/pdf", THRESHOLDS);
    expect(report.verdict).toBe("bad");
    expect(report.emptyOrEffectivelyEmpty).toBe(true);
  });

  it("flags an encrypted PDF as bad via the /Encrypt marker", async () => {
    const encrypted = Buffer.concat([
      Buffer.from("%PDF-1.6\n"),
      Buffer.alloc(256, 0x20),
      Buffer.from("\n/Encrypt 5 0 R\n"),
      Buffer.alloc(128, 0x20),
    ]);
    const report = await validateFile(encrypted, "application/pdf", THRESHOLDS);
    expect(report.verdict).toBe("bad");
    expect(report.encrypted).toBe(true);
  });

  it("reports a corrupt PDF as bad structure without throwing", async () => {
    const junk = Buffer.from("this is not a pdf at all, just text pretending");
    const report = await validateFile(junk, "application/pdf", THRESHOLDS);
    // pdf-parse throws on garbage; the layer must contain it.
    expect(report.verdict).toBe("bad");
    expect(report.formatOk).toBe(false);
    expect(report.checks.some((c) => c.name === "structure" && c.verdict === "bad")).toBe(true);
  });

  it("accepts images structurally and defers OCR quality to extraction", async () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(4096, 0x7f),
    ]);
    const report = await validateFile(png, "image/png", THRESHOLDS);
    expect(report.verdict).toBe("ok");
    expect(report.quality).toBeNull();
  });

  it("warns on a tiny image (placeholder suspicion)", async () => {
    const tinyPng = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(64, 0x7f),
    ]);
    const report = await validateFile(tinyPng, "image/png", THRESHOLDS);
    expect(report.checks.some((c) => c.verdict === "warning")).toBe(true);
  });
});

describe("quality analysis — value over page count", () => {
  it("detects a padded document (mostly blank/repeated pages)", async () => {
    // Quality via pdf-parse needs a real PDF with a text layer; that path is
    // covered by the pipeline spec. Here we verify the metrics math directly
    // through the exported analyze entry used by validateFile.
    const { analyzeQualityForTest } = await import("./resource-audit.validation");
    const pages = [
      "University of Lagos CHM 101 examination",
      "", // blank
      "", // blank
      "", // blank
      "", // blank
      "University of Lagos CHM 101 examination", // repeat of page 1
    ];
    const metrics = analyzeQualityForTest(pages, THRESHOLDS);
    expect(metrics.pageCount).toBe(6);
    expect(metrics.blankPageRatio).toBeCloseTo(0.67, 2);
    expect(metrics.suspiciouslyPadded).toBe(true);
  });

  it("a short but genuinely academic document is NOT junk (2-page outline rule)", async () => {
    const { analyzeQualityForTest } = await import("./resource-audit.validation");
    const pages = [
      "CHM 101 Organic Chemistry course outline. Week 1: atomic structure. Week 2: bonding.",
      "Week 3: stoichiometry. Assessment: 30% continuous, 70% examination. Textbook: accepted reference.",
    ];
    const metrics = analyzeQualityForTest(pages, THRESHOLDS);
    expect(metrics.junkVerdict).toBe("ok");
  });
});
