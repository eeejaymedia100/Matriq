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
  version: "1.0";
  topic: string;
  overview: string;
  concepts: FocusConcept[];
}

/** Provider input/output limits — keep responses small and cheap. */
export const MAX_CONCEPTS = 10;
export const MAX_DETAIL_CHARS = 1500;
export const MAX_OVERVIEW_CHARS = 700;
export const MAX_LABEL_CHARS = 90;
export const MAX_SUMMARY_CHARS = 140;

export const PROMPT_VERSION = 1;

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

  return {
    version: "1.0",
    topic: clean(topic, 120) || "Concept map",
    overview: clean(obj.overview ?? obj.summary, MAX_OVERVIEW_CHARS),
    concepts,
  };
}

/**
 * The prompt template used to generate a map. Asks the model for *data* only,
 * in the exact schema, with strict size caps so cost stays bounded.
 */
export function buildMapPrompt(topic: string): string {
  return `You are Matriq's Focus Mode, an academic tutor that turns one complex topic into a
structured concept map as strict JSON. This is an educational tool for university students.

Topic: "${topic}"

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
  ]
}

Rules:
- Include the topic itself as one "topic" concept plus "overview".
- Use 6 to 10 concepts total (MAX do not exceed 10).
- Every "id" must be unique, lowercase, no spaces.
- "prerequisites" and "parents" must reference ids that exist, never the concept's own id.
- Keep every string short and accurate. Prefer correct academic content over length.
- No HTML. No markdown formatting. Plain UTF-8 text only.
Return valid JSON with the exact key names above.`;
}

/**
 * Prompt template that expands one concept in an already-generated map into a
 * fuller, exam-useful explanation (staged detail).
 */
export function buildExpandPrompt(topic: string, concept: FocusConcept): string {
  return `You are Matriq's Focus Mode, an academic tutor helping a university student understand one concept deeply.
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