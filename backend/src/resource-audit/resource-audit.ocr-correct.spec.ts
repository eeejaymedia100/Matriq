/**
 * TDD spec — keyboard-style OCR auto-correction.
 *
 * The phone-keyboard model: know the language (lexicon + frequencies),
 * generate near-neighbours (weighted edit distance), then let CONTEXT pick
 * the winner. The document itself is the strongest context — a physics
 * paper makes "quantm" → "quantum" near-certain.
 *
 * These specs are written BEFORE the implementation (TDD). Each describe
 * block maps to a user journey from the plan.
 */

import {
  weightedEditDistance,
  isLikelyOcrGarble,
  isProtectedToken,
  suggestCorrections,
  buildTopicProfile,
  correctOcrText,
  DEFAULT_LEXICON,
} from "./resource-audit.ocr-correct";

describe("weightedEditDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(weightedEditDistance("quantum", "quantum")).toBe(0);
  });

  it("costs 1 for a plain substitution", () => {
    expect(weightedEditDistance("cat", "hat")).toBe(1);
  });

  it("costs 1 for an insertion or deletion", () => {
    expect(weightedEditDistance("moden", "modern")).toBe(1);
    expect(weightedEditDistance("modern", "moden")).toBe(1);
  });

  it("charges only 0.5 for OCR-confusable substitutions (0↔o, l↔1, c↔e)", () => {
    expect(weightedEditDistance("b0ttle", "bottle")).toBe(0.5);
    expect(weightedEditDistance("bottle", "b0ttle")).toBe(0.5);
    expect(weightedEditDistance("l0ad", "load")).toBe(0.5);
    expect(weightedEditDistance("cect", "cect")).toBe(0);
  });

  it("is symmetric", () => {
    expect(weightedEditDistance("wrold", "world")).toBe(
      weightedEditDistance("world", "wrold"),
    );
  });

  it("is never cheaper to take nonsense paths than real edits", () => {
    expect(weightedEditDistance("quantm", "quantum")).toBeLessThanOrEqual(1);
  });
});

describe("isLikelyOcrGarble", () => {
  it("flags vowel-less words of 4+ letters", () => {
    expect(isLikelyOcrGarble("qrtzl")).toBe(true);
  });

  it("flags digits mixed into letters", () => {
    expect(isLikelyOcrGarble("w0rk")).toBe(true);
  });

  it("flags pathological internal case (aBout)", () => {
    expect(isLikelyOcrGarble("aBout")).toBe(true);
  });

  it("does not flag normal words", () => {
    expect(isLikelyOcrGarble("hello")).toBe(false);
    expect(isLikelyOcrGarble("quantum")).toBe(false);
  });

  it("does not flag short words (3 letters or fewer)", () => {
    expect(isLikelyOcrGarble("teh")).toBe(false);
    expect(isLikelyOcrGarble("ab")).toBe(false);
  });
});

describe("isProtectedToken", () => {
  it("protects course codes (PHY202, CSC305A)", () => {
    expect(isProtectedToken("PHY202")).toBe(true);
    expect(isProtectedToken("CSC305A")).toBe(true);
  });

  it("protects acronyms (NUC, DNA, CGPA)", () => {
    expect(isProtectedToken("NUC")).toBe(true);
    expect(isProtectedToken("CGPA")).toBe(true);
  });

  it("protects roman numerals (IV, VII, IX)", () => {
    expect(isProtectedToken("VII")).toBe(true);
  });

  it("protects numbers, percentages and thousand groups", () => {
    expect(isProtectedToken("2024")).toBe(true);
    expect(isProtectedToken("50%")).toBe(true);
    expect(isProtectedToken("1,000")).toBe(true);
    expect(isProtectedToken("2.5")).toBe(true);
  });

  it("protects single letters and explicit name-list entries", () => {
    expect(isProtectedToken("a")).toBe(true);
    expect(isProtectedToken("Akpevwe", ["Akpevwe"])).toBe(true);
  });

  it("does not protect ordinary words", () => {
    expect(isProtectedToken("quantum")).toBe(false);
    expect(isProtectedToken("mechanis")).toBe(false);
  });
});

describe("suggestCorrections", () => {
  const lexicon = ["quantum", "quarantine", "quality", "quantity", "tunneling", "world"];

  it("returns the nearest word first", () => {
    const out = suggestCorrections("quantm", lexicon);
    expect(out[0].word).toBe("quantum");
    expect(out[0].distance).toBeLessThanOrEqual(2);
  });

  it("excludes candidates beyond maxDistance", () => {
    const out = suggestCorrections("quantm", lexicon, 1);
    expect(out.map((s) => s.word)).toEqual(["quantum"]);
  });

  it("finds insertion errors (tunnling → tunneling)", () => {
    const out = suggestCorrections("tunnling", ["tunneling", "running"]);
    expect(out[0]?.word).toBe("tunneling");
  });

  it("returns an empty array when nothing is close", () => {
    expect(suggestCorrections("zzzzzz", lexicon)).toEqual([]);
  });

  it("returns an empty array for empty input", () => {
    expect(suggestCorrections("", lexicon)).toEqual([]);
  });

  it("includes the token itself if it is already in the lexicon", () => {
    expect(suggestCorrections("world", lexicon)[0]?.word).toBe("world");
  });
});

describe("DEFAULT_LEXICON", () => {
  it("contains core academic vocabulary", () => {
    expect(DEFAULT_LEXICON).toContain("quantum");
    expect(DEFAULT_LEXICON).toContain("physics");
    expect(DEFAULT_LEXICON).toContain("experiment");
    expect(DEFAULT_LEXICON).toContain("government");
  });

  it("contains common function words", () => {
    expect(DEFAULT_LEXICON).toContain("the");
    expect(DEFAULT_LEXICON).toContain("and");
  });

  it("is lowercase and non-empty", () => {
    expect(DEFAULT_LEXICON.length).toBeGreaterThan(200);
    for (const w of DEFAULT_LEXICON) expect(w).toBe(w.toLowerCase());
  });
});

describe("buildTopicProfile", () => {
  it("ranks frequent content words and drops stopwords", () => {
    const text =
      "Quantum tunneling is a quantum effect. The quantum tunneling model explains tunneling.";
    const profile = buildTopicProfile(text);
    expect(profile.topWords[0]).toBe("quantum");
    expect(profile.topWords).not.toContain("the");
    expect(profile.topWords).not.toContain("is");
  });

  it("counts adjacent bigrams across sentence boundaries", () => {
    const text = "Quantum tunneling appears. Quantum tunneling works.";
    const profile = buildTopicProfile(text);
    expect(profile.bigramCounts.get("quantum tunneling")).toBe(2);
  });

  it("handles empty text", () => {
    const profile = buildTopicProfile("");
    expect(profile.topWords).toEqual([]);
    expect(profile.bigramCounts.size).toBe(0);
  });
});

describe("correctOcrText", () => {
  it("corrects OCR garble using the document topic + topic lexicon", () => {
    const result = correctOcrText(
      "The quantm tunnling experiment was repeated.",
      { topicLexicon: ["quantum", "tunneling"] },
    );
    expect(result.corrected).toContain("quantum tunneling");
    expect(result.corrections).toHaveLength(2);
    expect(result.tokensCorrected).toBe(2);
  });

  it("uses the DEFAULT_LEXICON when no topicLexicon is provided", () => {
    const result = correctOcrText("Basic phyiscs is the study of matter and energy.");
    expect(result.corrected).toContain("physics");
  });

  it("leaves already-correct text untouched", () => {
    const result = correctOcrText("The quantum experiment worked perfectly.");
    expect(result.corrected).toBe("The quantum experiment worked perfectly.");
    expect(result.corrections).toHaveLength(0);
    expect(result.tokensCorrected).toBe(0);
  });

  it("never touches course codes, acronyms or numbers", () => {
    const result = correctOcrText(
      "PHY202 quantm test. NUC approved. 50% of 1,000 students scored 2.5.",
      { topicLexicon: ["quantum"] },
    );
    expect(result.corrected).toContain("PHY202");
    expect(result.corrected).toContain("NUC");
    expect(result.corrected).toContain("50%");
    expect(result.corrected).toContain("1,000");
    expect(result.corrected).toContain("2.5");
    expect(result.corrected).toContain("quantum");
  });

  it("preserves Title case of the original token", () => {
    const result = correctOcrText("Quantm mechanics is hard.", {
      topicLexicon: ["quantum", "mechanics"],
    });
    expect(result.corrected).toContain("Quantum mechanics");
  });

  it("maps the same garbled token consistently across the document", () => {
    const result = correctOcrText("quantm theory. quantm proof.", {
      topicLexicon: ["quantum"],
    });
    expect(result.corrections).toHaveLength(2);
    for (const c of result.corrections) expect(c.to).toBe("quantum");
  });

  it("leaves unknown words with no close candidate alone", () => {
    const result = correctOcrText("The flurbenquo was observed.");
    expect(result.corrected).toContain("flurbenquo");
    expect(result.tokensCorrected).toBe(0);
  });

  it("fixes digit-for-letter OCR damage (w0rk → work)", () => {
    const result = correctOcrText("The team will w0rk overnight.", {
      topicLexicon: ["work"],
    });
    expect(result.corrected).toContain("work");
  });

  it("reports oovRatio for very garbled documents", () => {
    const result = correctOcrText("the quantm xyzzy qtz");
    expect(result.oovRatio).toBeGreaterThan(0.5);
    expect(result.oovRatio).toBeLessThanOrEqual(1);
  });

  it("returns an empty result for empty text", () => {
    expect(correctOcrText("")).toEqual({
      corrected: "",
      corrections: [],
      tokensTotal: 0,
      tokensCorrected: 0,
      oovRatio: 0,
    });
  });

  it("records evidence for each correction", () => {
    const result = correctOcrText("quantm tunnling happened.", {
      topicLexicon: ["quantum", "tunneling"],
    });
    expect(result.corrections.length).toBeGreaterThan(0);
    for (const c of result.corrections) {
      expect(["topic-lexicon", "document-topic", "common-ocr"]).toContain(c.evidence);
      expect(c.from.length).toBeGreaterThan(0);
      expect(c.to.length).toBeGreaterThan(0);
    }
  });

  it("is idempotent — correcting already-corrected text changes nothing", () => {
    const once = correctOcrText("quantm tunnling happened.", {
      topicLexicon: ["quantum", "tunneling"],
    });
    const twice = correctOcrText(once.corrected, {
      topicLexicon: ["quantum", "tunneling"],
    });
    expect(twice.corrections).toHaveLength(0);
    expect(twice.corrected).toBe(once.corrected);
  });
});
