/**
 * Cloud Focus Mode — deterministic prompt-enhancement layer.
 *
 * Students type terse topics into Focus Mode ("osmosis", "CHM 101", "ppc").
 * This module turns that raw input into a richer, exam-framed model prompt
 * WITHOUT an extra AI round-trip and WITHOUT changing the cache key (which
 * stays normalized on the raw topic, so equivalent inputs still share a
 * cached map — see FocusService.cacheKey).
 *
 * What it adds, all deterministic and unit-testable:
 *   1. Course-code expansion — "CSC 201" / "CHM101" → "CSC 201 (Computer
 *      Science)" so the model frames the map for the right subject.
 *   2. Terse-topic expansion — single words / acronyms get explicit "explain
 *      from first principles, define every term" framing instead of a map
 *      that assumes prior knowledge.
 *   3. Level + exam framing — the student's level / department / faculty are
 *      injected so depth and examples match where they actually are, and the
 *      model is asked for exam-useful content (definitions, mechanisms,
 *      common question patterns).
 *
 * Cost: zero extra tokens beyond the (small) framing text — the model is
 * called once, with a better prompt.
 */

export interface FocusProfile {
  /** e.g. "300" (year of study). */
  level?: string | null;
  /** e.g. "Computer Science". */
  department?: string | null;
  /** e.g. "Science". */
  faculty?: string | null;
}

// Nigerian tertiary course-code prefixes → subject. Covers the common codes
// students actually type; unknown codes pass through untouched.
const COURSE_CODE_SUBJECTS: Record<string, string> = {
  ACC: "Accounting",
  AGR: "Agricultural Science",
  ANA: "Anatomy",
  BCH: "Biochemistry",
  BIO: "Biology",
  BOT: "Botany",
  BMS: "Biomedical Science",
  BUS: "Business Administration",
  CHM: "Chemistry",
  CIV: "Civil Engineering",
  COM: "Computer Science",
  CSC: "Computer Science",
  ECO: "Economics",
  EEE: "Electrical Engineering",
  ENG: "English",
  EST: "Estate Management",
  FIS: "Fisheries",
  GLY: "Geology",
  GST: "General Studies",
  HIS: "History",
  LAW: "Law",
  LIT: "Literature",
  MAT: "Mathematics",
  MTH: "Mathematics",
  MTK: "Mathematics",
  MIC: "Microbiology",
  MKT: "Marketing",
  NUR: "Nursing",
  PHA: "Pharmacy",
  PHY: "Physics",
  PSY: "Psychology",
  SOC: "Sociology",
  STA: "Statistics",
  ZOO: "Zoology",
};

// Normalize "CHM101", "CHM 101", "chm-101" → code + number.
const COURSE_CODE_RE = /\b([A-Za-z]{2,4})\s*[- ]?\s*(\d{3})\b/;

// Hints that a topic is programming/coding — Focus Mode is for ANY hard
// thing, and coding topics get their own framing (how it works, pitfalls,
// where it's used) instead of course-style framing.
const CODING_HINTS = [
  "javascript", "typescript", "python", "react", "node", "nextjs",
  "git", "sql", "api", "algorithm", "docker", "rust", "java", "c++",
  "html", "css", "regex", "recursion", "closure", "promise", "async",
  "oop", "array", "database", "server", "component", "state", "hook",
  "function", "variable", "loop", "stack", "queue", "binary", "sort",
  "programming", "coding", "code", "syntax", "debug", "deploy",
  "machine learning", "neural", "tensor", "api", "framework", "library",
  "compiler", "interpreter", "thread", "memory", "pointer", "class",
  "object", "inheritance", "polymorphism", "encapsulation", "websocket",
  "http", "json", "graphql", "rest", "kafka", "redis", "sqlite",
  "postgres", "mongodb", "bash", "shell", "linux", "kubernetes",
  "terraform", "cloud", "auth", "encryption", "hashing", "jwt",
];

function subjectFor(prefix: string): string | undefined {
  return COURSE_CODE_SUBJECTS[prefix.toUpperCase()];
}

function isCodingTopic(topic: string): boolean {
  const lower = topic.toLowerCase();
  return CODING_HINTS.some((hint) => lower.includes(hint));
}

export interface EnhancedTopic {
  /** The display title shown on the map (course code expanded when known). */
  title: string;
  /** The full prompt handed to the model (framing + topic). */
  prompt: string;
  /** True when a course code was detected and expanded. */
  courseDetected: boolean;
}

/**
 * Enhance a raw topic for the model. Pure and deterministic — no I/O, safe
 * for unit tests.
 */
export function enhanceTopic(topic: string, profile?: FocusProfile): EnhancedTopic {
  const raw = (topic ?? "").trim();
  const match = COURSE_CODE_RE.exec(raw);
  const subject = match ? subjectFor(match[1]) : undefined;

  const isCourseCode = !!match;
  const courseCode = match ? `${match[1].toUpperCase()} ${match[2]}` : null;
  const title = courseCode
    ? subject
      ? `${courseCode} — ${subject}`
      : courseCode
    : raw;

  const parts: string[] = [];
  parts.push(
    `Topic: "${raw}"` +
      (courseCode ? ` (course code ${courseCode}${subject ? `, ${subject}` : ""})` : ""),
  );

  const level = profile?.level?.trim();
  if (level) {
    parts.push(`Student level: ${level}`);
  }
  const department = profile?.department?.trim();
  const faculty = profile?.faculty?.trim();
  if (department && faculty) {
    parts.push(`Student department: ${department} (${faculty})`);
  } else if (department) {
    parts.push(`Student department: ${department}`);
  }

  // Framing that turns terse input into useful output — chosen by what the
  // topic actually is (course, coding, or general), never a one-size exam
  // template.
  if (isCodingTopic(raw)) {
    parts.push(
      "This is a programming / coding topic. Scope the map for someone learning to build with it: what it is, how it works under the hood, common pitfalls, and where it's used in real projects. Include short code-level examples where they clarify.",
    );
  } else if (isCourseCode) {
    parts.push(
      "This is a course topic. Scope the map to what is actually covered at this level: the definitions, mechanisms and worked patterns a student is expected to know, then the theory behind them.",
    );
  } else if (raw.split(/\s+/).length <= 2) {
    parts.push(
      "This is a terse topic. Explain it from first principles — define every term before going deeper, so the map stands alone without prior context.",
    );
  } else {
    parts.push(
      "Frame the map for deep understanding: lead with what the thing is, then the parts that matter most for actually using or mastering it.",
    );
  }

  parts.push(
    "Match the depth to the learner — no graduate-level detail unless the topic demands it.",
  );

  return {
    title,
    courseDetected: isCourseCode,
    prompt: parts.join("\n"),
  };
}