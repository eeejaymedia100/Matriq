/**
 * Cloud Focus Mode — structured concept map schema.
 *
 * The model is asked for *structured academic data* and the mobile app renders
 * it deterministically. We never ask the model for pixel positions or UI
 * instructions. This module holds the canonical schema, the prompt that asks
 * for it, and strict validation/sanitization of whatever the provider returns,
 * so malformed model output can't reach the client.
 *
 * Staged architecture: the initial request returns the overall map (overview +
 * core concepts with concise details). A per-concept "expand" request later
 * generates/refreshes the full detailed explanation, examples and
 * prerequisites when the student opens that concept. Details are therefore not
 * pre-generated as huge essays for every request (cost control at scale).
 */

export type FocusConceptKind =
  | "topic"
  | "definition"
  | "component"
  | "process"
  | "type"
  | "example"
  | "application"
  | "importance"
  | "prerequisite";

export const FOCUS_KINDS: FocusConceptKind[] = [
  "topic",
  "definition",
  "component",
  "process",
  "type",
  "example",
  "application",
  "importance",
  "prerequisite",
];

export interface FocusConcept {
  id: string;
  label: string;
  kind: FocusConceptKind;
  /** Short caption shown on the node card itself. */
  summary: string;
  /** Staged explanation — concise for core concepts, fuller after expand. */
  detail: string;
  /** Why the concept matters (optional). */
  importance?: string;
  /** Concrete examples / illustrations (optional). */
  examples?: string[];
  /** Concept ids that should be understood first. */
  prerequisites?: string[];
  /** Concept ids this is a sub-part of (hierarchy). */
  parents?: string[];
}

export interface FocusMap {
  version: "1.1";
  topic: string;
  overview: string;
  concepts: FocusConcept[];
  /**
   * The learning journey (UI direction §Focus Mode): an ordered partition of
   * the concepts into stages the student walks through. Optional — maps
   * generated before journeys shipped stay valid, and the client falls back
   * to a single linear stage when absent.
   */
  stages?: FocusStage[];
}

export interface FocusStage {
  id: string;
  title: string;
  /** What the student will understand by the end of the stage. */
  objective: string;
  /** Ordered concept ids shown in this stage (must exist in the map). */
  conceptIds: string[];
}

/** Provider input/output limits — keep responses small and cheap. */
export const MAX_CONCEPTS = 10;
export const MAX_DETAIL_CHARS = 1500;
export const MAX_OVERVIEW_CHARS = 700;
export const MAX_LABEL_CHARS = 90;
export const MAX_SUMMARY_CHARS = 140;

export const PROMPT_VERSION = 2;

const KIND_SET = new Set<string>(FOCUS_KINDS);

function clean(text: unknown, max = 2000): string {
  if (typeof text !== "string") return "";
  return text
    .replace(/<\/?[a-zA-Z][^>]*>/g, "") // strip HTML — rendered as plain text client-side
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function isKind(v: unknown): v is FocusConceptKind {
  return typeof v === "string" && KIND_SET.has(v);
}

function sanitizeId(v: unknown, fallback: string): string {
  if (typeof v !== "string") return fallback;
  const s = v.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return s || fallback;
}

/**
 * Extract the first JSON object from model text, tolerating markdown fences
 * and leading prose. Returns the parsed object, or null when nothing valid is
 * found. Never throws.
 */
export function extractJson(text: string): unknown {
  if (!text) return null;
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Validate + sanitize a FocusMap parsed from provider JSON. Returns the
 * normalized map, or null when it is structurally unusable (< 2 valid
 * concepts, no overview, dangling links). The caller decides whether to fall
 * back to another provider or surface a retryable error.
 */
export function validateFocusMap(raw: unknown, topic: string): FocusMap | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const conceptsRaw = Array.isArray(obj.concepts) ? obj.concepts : [];
  if (conceptsRaw.length < 2) return null;

  const concepts: FocusConcept[] = [];
  const usedIds = new Set<string>();
  for (const c of conceptsRaw.slice(0, MAX_CONCEPTS)) {
    if (!c || typeof c !== "object") continue;
    const node = c as Record<string, unknown>;
    const label = clean(node.label, MAX_LABEL_CHARS);
    if (!label) continue;
    const id = sanitizeId(node.id, `c${concepts.length + 1}`);
    if (usedIds.has(id)) continue;
    usedIds.add(id);

    const kind = isKind(node.kind) ? node.kind : "definition";
    const concept: FocusConcept = {
      id,
      label,
      kind,
      summary: clean(node.summary, MAX_SUMMARY_CHARS),
      detail: clean(node.detail ?? node.explanation, MAX_DETAIL_CHARS),
      importance: clean(node.importance, MAX_SUMMARY_CHARS) || undefined,
      examples: Array.isArray(node.examples)
        ? node.examples
            .map((e) => clean(e, 200))
            .filter(Boolean)
            .slice(0, 5)
        : undefined,
      prerequisites:
        Array.isArray(node.prerequisites)
          ? node.prerequisites.map((p) => sanitizeId(p, "")).filter(Boolean)
          : undefined,
      parents: Array.isArray(node.parents)
        ? node.parents.map((p) => sanitizeId(p, "")).filter(Boolean)
        : undefined,
    };
    concepts.push(concept);
  }

  if (concepts.length < 2) return null;

  // Drop references to concept ids that don't exist (dangling links break the
  // renderer and are never trusted from the model).
  const idSet = new Set(concepts.map((c) => c.id));
  for (const c of concepts) {
    c.prerequisites = c.prerequisites?.filter((p) => idSet.has(p) && p !== c.id);
    c.parents = c.parents?.filter((p) => idSet.has(p) && p !== c.id);
    if (c.prerequisites?.length === 0) c.prerequisites = undefined;
    if (c.parents?.length === 0) c.parents = undefined;
  }

  const map: FocusMap = {
    version: "1.1",
    topic: clean(topic, 120) || "Concept map",
    overview: clean(obj.overview ?? obj.summary, MAX_OVERVIEW_CHARS),
    concepts,
  };

  // Learning journey stages — sanitized hard: every referenced id must exist,
  // each concept appears at most once across stages, and titles are cleaned.
  // When the model's stages are unusable we simply drop them (the map stays
  // valid and the client falls back to one linear stage).
  if (Array.isArray(obj.stages)) {
    const used = new Set<string>();
    const stages: FocusStage[] = [];
    for (const raw of obj.stages.slice(0, 8)) {
      if (!raw || typeof raw !== "object") continue;
      const s = raw as Record<string, unknown>;
      const title = clean(s.title, 80);
      if (!title) continue;
      const conceptIds = [
        ...new Set(
          (Array.isArray(s.conceptIds) ? s.conceptIds : [])
            .map((id) => sanitizeId(id, ""))
            .filter((id) => id && idSet.has(id) && !used.has(id)),
        ),
      ];
      if (conceptIds.length === 0) continue;
      for (const id of conceptIds) used.add(id);
      stages.push({
        id: sanitizeId(s.id, `stage${stages.length + 1}`),
        title,
        objective: clean(s.objective, 200) || "Understand these ideas well.",
        conceptIds,
      });
    }
    if (stages.length > 0) map.stages = stages;
  }

  return map;
}

/**
 * The prompt template used to generate a map. Asks the model for *data* only,
 * in the exact schema, with strict size caps so cost stays bounded. `context`
 * (optional) carries the deterministic enhancement from focus.prompt.ts —
 * course-code expansion, level framing — injected as an extra Context block.
 */
export function buildMapPrompt(topic: string, context = ""): string {
  const contextBlock = context
    ? `

Context (student + topic enrichment — obey this):
${context}`
    : "";
  return `You are Matriq's Focus Mode, a tutor that turns ONE complex thing — a course topic, a
coding concept, a skill, a difficult task — into a structured concept map as strict JSON. The
person using this is a student or self-learner working through something hard.

Topic: "${topic}"${contextBlock}

Produce ONE JSON object only (no markdown, no prose outside the JSON) matching EXACTLY this shape:
{
  "topic": "<the full topic name>",
  "overview": "<one to three sentences summarising the whole topic, what it is and why it matters>",
  "concepts": [
    {
      "id": "<short slug, e.g. \"evaporation\">",
      "label": "<short display name>",
      "kind": "<one of: topic|definition|component|process|type|example|application|importance|prerequisite>",
      "summary": "<one short phrase shown on a card>",
      "detail": "<2-3 concise sentences explaining it - do NOT write an essay>",
      "importance": "<why this concept matters - one sentence>",
      "examples": ["<1-3 short concrete examples, optional>"],
      "prerequisites": ["<concept ids you should understand first, optional>"],
      "parents": ["<concept ids this is part of, optional>"]
    }
  ],
  "stages": [
    {
      "id": "<short slug, e.g. \"basics\">",
      "title": "<short stage name, e.g. \"Start with the basics\">",
      "objective": "<what the student will understand by the end of this stage - one sentence>",
      "conceptIds": ["<concept ids in learning order for THIS stage>"]
    }
  ]
}

Rules:
- Include the topic itself as one "topic" concept plus "overview".
- Use 6 to 10 concepts total (MAX do not exceed 10).
- Every "id" must be unique, lowercase, no spaces.
- "prerequisites" and "parents" must reference ids that exist, never the concept's own id.
- "stages" must be an ordered learning journey: 2 to 5 stages that PARTITION the
  concepts (every concept appears in exactly one stage, concepts listed in the
  order the student should learn them). Earlier stages first — prerequisites
  before the ideas that build on them. Keep each stage's "conceptIds" to 2-4
  concepts.
- Keep every string short and accurate. Prefer correct academic content over length.
- No HTML. No markdown formatting. Plain UTF-8 text only.
Return valid JSON with the exact key names above.`;
}

// ── Mastery checkpoints (UI direction §Mastery Checkpoints) ──────────
// At the end of a stage the student answers a question about one concept; the
// AI evaluates the answer with the concept's own explanation as the rubric.
// The student must not be able to skip with junk — obvious non-answers are
// caught deterministically BEFORE any model call.

export interface CheckpointVerdict {
  passed: boolean;
  /** Concise, rewarding (or guiding) feedback. */
  feedback: string;
  /** Optional: what the answer got wrong / left out. */
  misconception?: string;
  /** Optional: what to review before retrying. */
  suggestion?: string;
}

/**
 * Deterministic bypass pre-check — junk answers never reach the paid model.
 * "I don't understand" is NOT a bypass: it is a valid learning action handled
 * by the caller (it offers a simpler explanation) before this runs.
 */
export function isObviousBypass(answer: string): boolean {
  const a = (answer ?? "").trim().toLowerCase();
  if (a.length < 2) return true;
  if (/^[^a-z0-9]+$/i.test(a)) return true; // punctuation/emoji only
  const compact = a.replace(/[^a-z0-9]/g, "");
  const bypasses = [
    "skip", "next", "pass", "nextquestion", "skipit", "idontknow",
    "idk", "dontknow", "donotknow", "noidea", "whatever", "nothing",
    "passquestion", "imdone", "idontunderstand", "helpless", "random",
  ];
  return bypasses.some((b) => compact === b || compact.startsWith(`${b}please`) || compact.endsWith(`just${b}`));
}

/**
 * Validate + sanitize a checkpoint verdict from provider JSON. Returns null
 * when structurally unusable (caller surfaces a retryable error).
 */
export function validateVerdict(raw: unknown): CheckpointVerdict | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.passed !== "boolean") return null;
  const feedback =
    typeof o.feedback === "string" && o.feedback.trim()
      ? o.feedback.trim().slice(0, 400)
      : "";
  if (!feedback) return null;
  const misconception =
    typeof o.misconception === "string"
      ? o.misconception.trim().slice(0, 240)
      : "";
  const suggestion =
    typeof o.suggestion === "string" ? o.suggestion.trim().slice(0, 240) : "";
  return {
    passed: o.passed,
    feedback,
    misconception: misconception || undefined,
    suggestion: suggestion || undefined,
  };
}

/**
 * The prompt that asks the AI to judge a mastery-checkpoint answer. The
 * concept's own validated explanation is the rubric, so the judgement has
 * explicit context (never a bare "is this right?").
 */
export function buildCheckpointPrompt(opts: {
  topic: string;
  stageTitle: string;
  conceptLabel: string;
  rubric: string;
  question: string;
  answer: string;
}): string {
  return `You are Matriq's Focus Mode, a tutor running a mastery checkpoint. A student is
learning "${opts.topic}" and just finished the stage "${opts.stageTitle}". You asked:
"${opts.question}"

The concept being checked is "${opts.conceptLabel}". Here is the correct explanation
(the rubric — judge the answer against THIS, not generic knowledge):
${opts.rubric.slice(0, 1600)}

The student answered:
"${opts.answer.slice(0, 2000)}"

Decide whether the answer demonstrates genuine understanding of the core idea.
- PASS only when the answer shows real understanding in the student's own words:
  the mechanism, the "why", or a correct example. Lenient with wording, strict
  with meaning.
- FAIL when the answer is irrelevant, guessed, memorised-but-unexplained,
  contradicts the rubric, or clearly off-topic. Never accept irrelevant text.
- This is a learning tool, not a trap: when they fail, point kindly at what's
  missing and what to re-read. Never shame.

Return ONLY a JSON object (no markdown):
{
  "passed": true|false,
  "feedback": "<1-2 warm, concise sentences — congratulate on success, or guide on what's missing>",
  "misconception": "<optional, what the answer got wrong or left out>",
  "suggestion": "<optional, exactly what to review before retrying>"
}`;
}

/**
 * Prompt template that expands one concept in an already-generated map into a
 * fuller, exam-useful explanation (staged detail).
 */
export function buildExpandPrompt(topic: string, concept: FocusConcept): string {
  return `You are Matriq's Focus Mode, a tutor helping someone master one concept deeply.
Topic: "${topic}"
Concept: "${concept.label}"

Write a thorough but focused explanation of this concept as ONLY a JSON object (no markdown, no prose outside):
{
  "detail": "<3-6 sentences: what it is, how it works, its role in the topic>",
  "importance": "<one or two sentences: why students must understand it>",
  "examples": ["<2-3 concrete, realistic examples>"]
}
Constraints: plain text, no HTML/markdown, at most ~2000 characters total. Return valid JSON.`;
}