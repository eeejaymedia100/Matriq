/**
 * Keyboard-style OCR auto-correction.
 *
 * The phone keyboard's trick, applied to OCR output: know the language
 * (lexicon + frequencies), generate near-neighbours (weighted edit distance
 * where OCR-confusable pairs like 0↔o cost half), then let CONTEXT pick the
 * winner. The document is its own strongest context — a physics paper makes
 * "quantm" → "quantum" near-certain.
 *
 * Design constraints:
 *  - Deterministic and pure (no network, no model): same input → same output.
 *  - Conservative: only confident corrections are applied; every applied
 *    change is recorded with evidence so reviewers can audit the text.
 *  - Protected classes (course codes, acronyms, roman numerals, numbers,
 *    names) are never touched.
 */

// ── Weighted edit distance ───────────────────────────────────────────────

/** Substitution pairs Tesseract commonly confuses — charged at half cost. */
const OCR_CONFUSABLE = new Set([
  "0o", "o0", "1l", "l1", "1i", "i1", "5s", "s5", "8b", "b8", "2z", "z2",
  "ce", "ec", "cg", "gc", "vv", "wv", "vw", "ij", "ji", "cl", "lc", "d0", "0d",
]);

/**
 * Damerau-Levenshtein distance with OCR-aware costs:
 *  - insert / delete: 1
 *  - substitution: 0.5 for OCR-confusable pairs, otherwise 1
 *  - transposition of adjacent characters: 1
 */
export function weightedEditDistance(a: string, b: string): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  const m = s.length;
  const n = t.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Full matrix (rows can be previous + current for DL transposition).
  const INF = m + n;
  const d: number[][] = [];
  for (let i = 0; i <= m + 1; i++) d.push(new Array(n + 1).fill(0));
  const da = new Map<string, number>();

  const subCost = (x: string, y: string): number =>
    x === y ? 0 : OCR_CONFUSABLE.has(x + y) ? 0.5 : 1;

  let maxdist = m + n;
  d[0][0] = maxdist;
  for (let i = 0; i <= m; i++) {
    d[i + 1][0] = maxdist;
    d[i + 1][1] = i;
    maxdist = i;
  }
  for (let j = 0; j <= n; j++) {
    d[1][j + 1] = j;
    d[0][j + 1] = maxdist;
    maxdist = j;
  }
  maxdist = m + n;

  for (let i = 1; i <= m; i++) {
    let db = 0;
    for (let j = 1; j <= n; j++) {
      const k = da.get(t[j - 1]) ?? 0;
      const l = db;
      let cost = subCost(s[i - 1], t[j - 1]);
      if (cost === 0) db = j;
      let best = INF;
      if (d[i][j] + cost < best) best = d[i][j] + cost; // substitution
      if (d[i + 1][j] + 1 < best) best = d[i + 1][j] + 1; // insertion into t
      if (d[i][j + 1] + 1 < best) best = d[i][j + 1] + 1; // deletion from s
      if (k > 0 && l > 0) {
        const trans = d[k][l] + (i - k - 1) + 1 + (j - l - 1);
        if (trans < best) best = trans;
      }
      d[i + 1][j + 1] = best;
    }
    da.set(s[i - 1], i);
  }
  void INF;
  void maxdist;
  return d[m + 1][n + 1];
}

// ── Garble detection ─────────────────────────────────────────────────────

const VOWELS = new Set(["a", "e", "i", "o", "u"]);

/**
 * True when a token looks like OCR damage: no vowels at all, digits mixed
 * into letters, or pathological internal capitalisation ("aBout"). Short
 * tokens (≤3) are never flagged — too much signal/noise.
 */
export function isLikelyOcrGarble(token: string): boolean {
  const t = token;
  if (t.length <= 3) return false;
  const lower = t.toLowerCase();
  let hasVowel = false;
  let hasDigit = false;
  let hasLetter = false;
  for (const ch of lower) {
    if (VOWELS.has(ch)) hasVowel = true;
    if (ch >= "0" && ch <= "9") hasDigit = true;
    else if (ch >= "a" && ch <= "z") hasLetter = true;
  }
  if (hasLetter && hasDigit) return true; // w0rk, b1rd
  if (hasLetter && !hasVowel) return true; // qrtzl
  // Pathological internal case: starts lowercase, gains an uppercase later.
  if (t[0] === t[0].toLowerCase() && /[A-Z]/.test(t.slice(1))) return true;
  return false;
}

// ── Protected tokens ─────────────────────────────────────────────────────

const COURSE_CODE_RE = /^[A-Z]{2,4}\d{3}[A-Z]?$/; // PHY202, CSC305A
const ACRONYM_RE = /^[A-Z]{2,6}$/; // NUC, CGPA, DNA
const ROMAN_RE = /^[IVXLC]{2,7}$/; // IV, VII, IX (len ≥ 2 keeps "I"? "I" is single-letter anyway)
const NUMBER_RE = /^\d[\d,.]*%?$/; // 2024, 1,000, 2.5, 50%
const ROMAN_VALUES = new Set(["II", "III", "IV", "VI", "VII", "VIII", "IX", "XI", "XII", "XL", "LX", "XC", "CD", "CM", "VX"]);

/**
 * Tokens the corrector must never touch: course codes, acronyms, roman
 * numerals, numbers/percentages, single letters, and caller-supplied names.
 */
export function isProtectedToken(token: string, names: string[] = []): boolean {
  const t = token;
  if (t.length <= 1) return true;
  if (COURSE_CODE_RE.test(t)) return true;
  if (NUMBER_RE.test(t)) return true;
  if (ACRONYM_RE.test(t)) return true;
  if (ROMAN_RE.test(t) && (ROMAN_VALUES.has(t) || t.length >= 2)) return true;
  const lower = t.toLowerCase();
  if (names.some((n) => n.toLowerCase() === lower)) return true;
  return false;
}

// ── Default lexicon ──────────────────────────────────────────────────────

/**
 * Compact academic + function-word lexicon. Deliberately includes common
 * inflections (-s/-ed/-ing) so legitimate words are never "corrected" into
 * their stems. All lowercase; extended by the document's topic lexicon at
 * runtime.
 */
export const DEFAULT_LEXICON: string[] = (
  [
    // function words
    "a", "an", "the", "and", "or", "but", "if", "then", "than", "that", "this",
    "these", "those", "there", "here", "of", "to", "in", "on", "at", "by",
    "for", "with", "from", "as", "is", "are", "was", "were", "be", "been",
    "being", "am", "it", "its", "it's", "he", "she", "they", "them", "their",
    "we", "our", "you", "your", "i", "me", "my", "his", "her", "us", "do",
    "does", "did", "done", "doing", "have", "has", "had", "having", "will",
    "would", "can", "could", "should", "shall", "may", "might", "must", "not",
    "no", "yes", "so", "such", "very", "just", "also", "only", "more", "most",
    "much", "many", "some", "any", "all", "each", "every", "both", "few",
    "other", "another", "same", "own", "one", "two", "three", "four", "five",
    "six", "seven", "eight", "nine", "ten", "first", "second", "third",
    "fourth", "fifth", "when", "where", "which", "who", "whom", "whose",
    "what", "why", "how", "because", "while", "until", "about", "between",
    "through", "during", "before", "after", "above", "below", "up", "down",
    "out", "off", "over", "under", "again", "further", "once", "don't",
    "doesn't", "didn't", "can't", "won't", "isn't", "aren't", "wasn't",
    "weren't", "that's", "what's", "let's", "we're", "they're", "you're",
    "i'm", "i've", "we've",
    // academic verbs + inflections
    "study", "studies", "studied", "studying", "explain", "explains",
    "explained", "explaining", "define", "defines", "defined", "defining",
    "measure", "measures", "measured", "measuring", "observe", "observes",
    "observed", "observing", "calculate", "calculates", "calculated",
    "calculating", "increase", "increases", "increased", "increasing",
    "decrease", "decreases", "decreased", "decreasing", "produce", "produces",
    "produced", "producing", "occur", "occurs", "occurred", "occurring",
    "repeat", "repeats", "repeated", "repeating", "happen", "happens",
    "happened", "happening", "apply", "applies", "applied", "applying",
    "solve", "solves", "solved", "solving", "show", "shows", "showed",
    "shown", "showing", "find", "finds", "found", "finding", "give", "gives",
    "given", "giving", "take", "takes", "taken", "taking", "make", "makes",
    "made", "making", "use", "uses", "used", "using", "work", "works",
    "worked", "working", "know", "knows", "known", "knowing", "mean", "means",
    "meant", "meaning", "call", "calls", "called", "calling", "become",
    "becomes", "became", "becoming", "move", "moves", "moved", "moving",
    "cause", "causes", "caused", "causing", "form", "forms", "formed",
    "forming", "hold", "holds", "held", "holding", "bring", "brings",
    "brought", "bringing", "write", "writes", "wrote", "written", "writing",
    "read", "reads", "reading", "speak", "speaks", "spoke", "spoken",
    "speaking", "learn", "learns", "learned", "learning", "teach", "teaches",
    "taught", "teaching", "test", "tests", "tested", "testing", "pass",
    "passes", "passed", "passing", "fail", "fails", "failed", "failing",
    "score", "scores", "scored", "scoring", "answer", "answers", "answered",
    "answering", "ask", "asks", "asked", "asking", "attempt", "attempts",
    "attempted", "attempting", "require", "requires", "required",
    "requiring", "include", "includes", "included", "including", "provide",
    "provides", "provided", "providing", "contain", "contains", "contained",
    "containing", "consist", "consists", "consisted", "consisting", "follow",
    "follows", "followed", "following", "consider", "considers", "considered",
    "considering", "describe", "describes", "described", "describing",
    "discuss", "discusses", "discussed", "discussing", "state", "states",
    "stated", "stating", "start", "starts", "started", "starting", "end",
    "ends", "ended", "ending", "begin", "begins", "began", "beginning",
    "complete", "completes", "completed", "completing", "submit", "submits",
    "submitted", "submitting", "approve", "approves", "approved", "approving",
    // academic nouns + plurals
    "physics", "chemistry", "biology", "mathematics", "economics",
    "government", "history", "literature", "geography", "accounting",
    "engineering", "mechanics", "thermodynamics", "electricity",
    "magnetism", "optics", "gravity", "energy", "force", "forces", "motion",
    "velocity", "acceleration", "momentum", "mass", "weight", "wave",
    "waves", "particle", "particles", "atom", "atoms", "molecule",
    "molecules", "electron", "electrons", "proton", "protons", "neutron",
    "neutrons", "nucleus", "reaction", "reactions", "element", "elements",
    "compound", "compounds", "acid", "acids", "base", "bases", "cell",
    "cells", "tissue", "tissues", "organism", "organisms", "plant", "plants",
    "animal", "animals", "species", "bacteria", "virus", "viruses", "gene",
    "genes", "dna", "enzyme", "enzymes", "photosynthesis", "respiration",
    "quantum", "tunneling", "experiment", "experiments", "experimental",
    "theory", "theories", "theorem", "theorems", "law", "laws", "principle",
    "principles", "formula", "formulas", "equation", "equations", "value",
    "values", "result", "results", "data", "sample", "samples", "graph",
    "graphs", "table", "tables", "figure", "figures", "diagram", "diagrams",
    "measurements", "unit", "units", "meter", "meters", "kilogram",
    "second", "current", "voltage", "resistance", "power", "pressure",
    "temperature", "heat", "light", "sound", "speed", "distance", "time",
    "times", "question", "questions", "paper", "papers", "exam", "exams",
    "examination", "examinations", "semester", "session", "course",
    "courses", "lecture", "lectures", "note", "notes", "chapter",
    "chapters", "topic", "topics", "definition", "definitions", "example",
    "examples", "problem", "problems", "solution", "solutions", "method",
    "methods", "process", "processes", "system", "systems", "structure",
    "structures", "function", "functions", "effect", "effects", "change",
    "changes", "difference", "differences", "relationship",
    "relationships", "principle", "concept", "concepts", "idea", "ideas",
    "fact", "facts", "evidence", "reason", "reasons", "cause", "student",
    "students", "teacher", "teachers", "school", "schools", "university",
    "universities", "department", "departments", "faculty", "faculties",
    "level", "levels", "year", "years", "science", "sciences", "art",
    "arts", "social", "management", "finance", "business", "marketing",
    "computer", "computers", "software", "hardware", "network", "networks",
    "database", "databases", "program", "programs", "language",
    "languages", "algorithm", "algorithms", "memory", "storage", "model",
    "models", "design", "designs", "project", "projects", "research",
    "analysis", "report", "reports", "review", "reviews", "survey",
    "surveys", "introduction", "conclusion", "summary", "abstract",
    "reference", "references", "figure", "appendix",
    // common adjectives / adverbs
    "new", "old", "good", "great", "important", "small", "large", "big",
    "high", "low", "long", "short", "early", "late", "better", "best",
    "worse", "worst", "simple", "complex", "basic", "advanced", "general",
    "specific", "different", "similar", "common", "special", "main",
    "major", "minor", "single", "double", "total", "whole", "part",
    "partial", "full", "empty", "open", "closed", "free", "possible",
    "impossible", "necessary", "useful", "correct", "incorrect", "right",
    "wrong", "true", "false", "real", "actual", "exact", "approximate",
    "equal", "unequal", "opposite", "negative", "positive", "internal",
    "external", "horizontal", "vertical", "constant", "variable",
    "average", "maximum", "minimum", "available", "unable", "usually",
    "always", "never", "often", "sometimes", "rarely", "quickly",
    "slowly", "easily", "hard", "carefully", "together", "alone",
    // Nigerian campus vocabulary
    "matric", "matriculation", "convocation", "semester", "lecturer",
    "lecturers", "handout", "handouts", "past", "questions", "campus",
    "hostel", "hostels", "departmental", "association", "associations",
    "executive", "executives", "welcome", "assignment", "assignments",
    "test", "quiz", "quizzes", "gst", "nuc", "cgpa", "gp", "grade",
    "grades", "carryover", "spillover",
  ] as string[]
)
  .filter((w, i, arr) => arr.indexOf(w) === i)
  .sort();

// ── Stopwords for the topic profile ──────────────────────────────────────

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "than", "that",
  "this", "these", "those", "there", "here", "of", "to", "in", "on", "at",
  "by", "for", "with", "from", "as", "is", "are", "was", "were", "be",
  "been", "being", "am", "it", "its", "he", "she", "they", "them",
  "their", "we", "our", "you", "your", "i", "me", "my", "his", "her",
  "us", "do", "does", "did", "done", "have", "has", "had", "will",
  "would", "can", "could", "should", "shall", "may", "might", "must",
  "not", "no", "so", "very", "just", "also", "only", "more", "most",
  "some", "any", "all", "each", "every", "both", "when", "where",
  "which", "who", "what", "why", "how", "because", "while", "until",
  "about", "between", "through", "during", "before", "after", "up",
  "down", "out", "off", "over", "under", "again", "once",
]);

// ── Candidate suggestion ─────────────────────────────────────────────────

export interface Suggestion {
  word: string;
  distance: number;
}

/** Length-bucketed lexicon for fast neighbour search. */
const buckets = new Map<string[], Map<number, string[]>>();
function bucketize(lexicon: string[]): Map<number, string[]> {
  const existing = buckets.get(lexicon);
  if (existing) return existing;
  const map = new Map<number, string[]>();
  for (const w of lexicon) {
    const list = map.get(w.length);
    if (list) list.push(w);
    else map.set(w.length, [w]);
  }
  buckets.set(lexicon, map);
  return map;
}

/**
 * Nearest lexicon words for a token, sorted by (distance, word). Includes
 * the token itself when it is already a lexicon word (distance 0).
 */
export function suggestCorrections(
  token: string,
  lexicon: string[],
  maxDistance = 2,
): Suggestion[] {
  const t = token.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!t) return [];
  const byLength = bucketize(lexicon);
  const out: Suggestion[] = [];
  for (let len = Math.max(1, t.length - maxDistance); len <= t.length + maxDistance; len++) {
    const list = byLength.get(len);
    if (!list) continue;
    for (const word of list) {
      const d = weightedEditDistance(t, word);
      if (d <= maxDistance) out.push({ word, distance: d });
    }
  }
  out.sort((a, b) => a.distance - b.distance || a.word.localeCompare(b.word));
  return out;
}

// ── Topic profile ────────────────────────────────────────────────────────

export interface TopicProfile {
  /** Most frequent content words, most-significant first. */
  topWords: string[];
  /** Adjacent content-bigram counts within sentences. */
  bigramCounts: Map<string, number>;
}

const TOP_WORDS_LIMIT = 40;

/** Frequency profile of the document: its own strongest context signal. */
export function buildTopicProfile(text: string): TopicProfile {
  const wordCounts = new Map<string, number>();
  const bigramCounts = new Map<string, number>();
  const sentences = text.toLowerCase().split(/[.!?;\n]+/);
  for (const sentence of sentences) {
    const words = sentence.split(/[^a-z0-9']+/).filter((w) => w.length > 1);
    const content: string[] = [];
    for (const w of words) {
      if (STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
      content.push(w);
      wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
    }
    for (let i = 0; i + 1 < content.length; i++) {
      const bg = content[i] + " " + content[i + 1];
      bigramCounts.set(bg, (bigramCounts.get(bg) ?? 0) + 1);
    }
  }
  const topWords = [...wordCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_WORDS_LIMIT)
    .map(([w]) => w);
  return { topWords, bigramCounts };
}

// ── The correction pass ──────────────────────────────────────────────────

export interface CorrectionRecord {
  /** Original token as it appeared (original casing). */
  from: string;
  /** Replacement token (casing adapted from the original). */
  to: string;
  /** Why this correction was confident enough to apply. */
  evidence: "topic-lexicon" | "document-topic" | "common-ocr";
  /** Weighted edit distance of the applied correction. */
  distance: number;
}

export interface CorrectionReport {
  corrected: string;
  corrections: CorrectionRecord[];
  tokensTotal: number;
  tokensCorrected: number;
  /** Share of tokens not found in any lexicon (0–1). High = heavy garble. */
  oovRatio: number;
}

export interface CorrectOptions {
  /** Domain words for this document (e.g. course-related vocabulary). */
  topicLexicon?: string[];
  /** Proper nouns that must never be altered. */
  names?: string[];
  /** Maximum weighted edit distance for candidates (default 2). */
  maxDistance?: number;
}

/** Confidence gate: distance ≤ 1 applies outright; ≤ max needs context. */
const CONFIDENT_DISTANCE = 1;

function matchCasing(original: string, replacement: string): string {
  if (original[0] === original[0]?.toUpperCase() && original !== original.toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

const SEGMENT_SPLIT = /(\s+)/;
const CORE_SPLIT = /^([^A-Za-z0-9]*)([\s\S]*?)([^A-Za-z0-9]*)$/;

/**
 * Correct one document's OCR text using the keyboard model:
 * lexicon membership → protected classes → garble/OOV detection →
 * neighbour generation → context ranking → conservative application.
 * Identical garbled tokens resolve identically (decision cache).
 */
export function correctOcrText(text: string, options: CorrectOptions = {}): CorrectionReport {
  if (!text || !text.trim()) {
    return { corrected: "", corrections: [], tokensTotal: 0, tokensCorrected: 0, oovRatio: 0 };
  }

  const topicLexicon = (options.topicLexicon ?? []).map((w) => w.toLowerCase());
  const names = options.names ?? [];
  const maxDistance = options.maxDistance ?? 2;
  const profile = buildTopicProfile(text);
  const topicSet = new Set(topicLexicon);
  const known = new Set([...DEFAULT_LEXICON, ...topicLexicon]);
  const decisionCache = new Map<string, { to: string; evidence: CorrectionRecord["evidence"]; distance: number } | null>();

  const segments = text.split(SEGMENT_SPLIT);
  const corrections: CorrectionRecord[] = [];
  let tokensTotal = 0;
  let tokensCorrected = 0;
  let oovCount = 0;

  // Pre-index lowercased cores for neighbour lookups inside the pass.
  const cores: string[] = [];
  const coreIdx: number[] = [];
  for (let i = 0; i < segments.length; i += 2) {
    const m = segments[i].match(CORE_SPLIT);
    if (m && m[2]) {
      cores.push(m[2].toLowerCase());
      coreIdx.push(i);
    }
  }
  const corePos = new Map<number, number>();
  coreIdx.forEach((segIdx, k) => {
    corePos.set(segIdx, k);
  });

  function contextSupports(candidate: string, position: number): boolean {
    const k = corePos.get(position) ?? -1;
    const prev = k > 0 ? cores[k - 1] : "";
    const next = k >= 0 && k + 1 < cores.length ? cores[k + 1] : "";
    return (
      profile.topWords.includes(candidate) ||
      (prev !== "" && profile.bigramCounts.has(prev + " " + candidate)) ||
      (next !== "" && profile.bigramCounts.has(candidate + " " + next))
    );
  }

  for (let i = 0; i < segments.length; i += 2) {
    const seg = segments[i];
    const m = seg.match(CORE_SPLIT);
    if (!m || !m[2]) continue;
    const pre = m[1];
    const core = m[2];
    const post = m[3];
    tokensTotal += 1;

    const lowerCore = core.toLowerCase();
    let replacement: string | null = null;
    let evidence: CorrectionRecord["evidence"] = "common-ocr";
    let appliedDistance = 0;

    if (isProtectedToken(core, names)) {
      // leave untouched
    } else if (known.has(lowerCore)) {
      // already a real word — untouched
    } else {
      oovCount += 1;
      const cached = decisionCache.get(lowerCore);
      if (cached !== undefined) {
        if (cached) {
          replacement = cached.to;
          evidence = cached.evidence;
          appliedDistance = cached.distance;
        }
      } else {
        // Generate candidates from both lexicons, deduped by word: the same
        // word appearing in topic AND default lexicon is agreement about the
        // target, not ambiguity. Ambiguity = two DISTINCT words tying.
        const merged = new Map<
          string,
          { word: string; distance: number; source: "topic-lexicon" | "common-ocr" }
        >();
        for (const c of topicLexicon.length
          ? suggestCorrections(lowerCore, topicLexicon, maxDistance)
          : []) {
          merged.set(c.word, { word: c.word, distance: c.distance, source: "topic-lexicon" });
        }
        for (const c of suggestCorrections(lowerCore, DEFAULT_LEXICON, maxDistance)) {
          if (!merged.has(c.word)) {
            merged.set(c.word, { word: c.word, distance: c.distance, source: "common-ocr" });
          }
        }
        const ranked = [...merged.values()].sort(
          (a, b) => a.distance - b.distance || a.word.localeCompare(b.word),
        );
        const best = ranked[0] ?? null;

        if (!best) {
          decisionCache.set(lowerCore, null);
        } else {
          const secondD = ranked[1]?.distance ?? Infinity;
          const ambiguous = secondD === best.distance;
          const supported = contextSupports(best.word, i);
          const confident = best.distance <= CONFIDENT_DISTANCE && !ambiguous;
          const contextual = best.distance <= maxDistance && supported && !ambiguous;

          if (confident || contextual) {
            let src: CorrectionRecord["evidence"] = "common-ocr";
            if (best.source === "topic-lexicon") src = "topic-lexicon";
            else if (supported) src = "document-topic";
            decisionCache.set(lowerCore, { to: best.word, evidence: src, distance: best.distance });
          } else {
            decisionCache.set(lowerCore, null);
          }
        }
        const decided = decisionCache.get(lowerCore);
        if (decided) {
          replacement = decided.to;
          evidence = decided.evidence;
          appliedDistance = decided.distance;
        }
      }
    }

    if (replacement && replacement !== lowerCore) {
      const cased = matchCasing(core, replacement);
      segments[i] = pre + cased + post;
      corrections.push({ from: core, to: cased, evidence, distance: appliedDistance });
      tokensCorrected += 1;
    }
  }

  return {
    corrected: segments.join(""),
    corrections,
    tokensTotal,
    tokensCorrected,
    oovRatio: tokensTotal === 0 ? 0 : Math.min(1, oovCount / tokensTotal),
  };
}
