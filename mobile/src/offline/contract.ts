import type { OfflineModel } from "./models";
import type { Material } from "../utils/materials";
import type { FocusMap } from "./focus";

/**
 * Shared contract between the native (llama.rn) and web (transformers.js)
 * offline-AI providers. Both OfflineAiContext.tsx and
 * OfflineAiContext.web.tsx implement exactly this surface so screens work
 * identically on Android/iOS and the browser.
 */

export type EngineState = "idle" | "loading" | "ready" | "error";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Optional facts about the student, injected into the system prompt. */
export interface StudentContext {
  name?: string | null;
  level?: string | null;
  faculty?: string | null;
  department?: string | null;
}

/** The student's own imported study files (see utils/materials). */
export interface MaterialsContext {
  materials: Material[];
  query: string;
}

export interface DownloadedInfo {
  sizeBytes: number;
  downloadedAt: number;
}

export interface DownloadInfo {
  progress: number; // 0..1
  error: string | null;
  speedBps?: number;
  etaSeconds?: number | null;
}

export interface OfflineAiContextValue {
  models: OfflineModel[];
  downloaded: Record<string, DownloadedInfo>;
  activeModelId: string | null;
  preferOffline: boolean;
  engineState: EngineState;
  engineProgress: number;
  engineError: string | null;
  downloads: Record<string, DownloadInfo>;
  freeSpace: number | null;
  isDownloaded: (id: string) => boolean;
  isActive: (id: string) => boolean;
  startDownload: (id: string) => Promise<void>;
  cancelDownload: (id: string) => Promise<void>;
  deleteModel: (id: string) => Promise<void>;
  selectModel: (id: string) => Promise<void>;
  warmUp: () => Promise<void>;
  setPreferOffline: (value: boolean) => Promise<void>;
  refreshFreeSpace: () => Promise<void>;
  ask: (
    history: ChatTurn[],
    onToken?: (text: string) => void,
    opts?: { student?: StudentContext; materials?: MaterialsContext },
  ) => Promise<string>;
  /**
   * Focus Mode: ask the local model for a structured concept map of a topic
   * and return it as data (never UI instructions). Falls back to a linear
   * chain when the model's JSON is unusable.
   */
  buildFocusMap: (topic: string) => Promise<FocusMap>;
}

/** Chat persona + rules shared by both the native and web engines. */
export const SYSTEM_PROMPT =
  "You are the **AI Study Companion**, an intelligent, concise, and highly supportive academic assistant running locally on the student's device. " +
  "Your mission is to help students understand complex academic concepts, prepare for exams, break down past questions, and summarize study materials efficiently.\n\n" +
  "---\n\n" +
  "### Core Guidelines & Rules:\n\n" +
  "1. **Direct & Structured Responses:**\n" +
  "   - Always get straight to the point without filler phrases (e.g., avoid \"Certainly!\", \"As an AI...\", \"I hope this helps!\").\n" +
  "   - Use clear markdown formatting: bullet points, bold key terms, numbered steps, and short scannable paragraphs.\n" +
  "   - For mathematical equations, chemical formulas, or technical notation, use clear standard formatting or standard LaTeX syntax.\n" +
  "2. **Pedagogical Approach (Study Aid):**\n" +
  "   - **Explain, Don't Just Solve:** When answering questions or walking through past questions, break down the *concept* and *methodology* so the student learns the underlying principle.\n" +
  "   - **Step-by-Step Logic:** Present complex problem-solving in numbered sequential steps.\n" +
  "   - **Summarization:** When summarizing text, provide the main takeaway first, followed by key supporting points.\n" +
  "3. **Tone & Style:**\n" +
  "   - Clear, encouraging, academic, and engaging.\n" +
  "   - Maintain a conversational yet grounded peer-tutor persona.\n" +
  "   - Keep answers focused—prioritize clarity and precision over long-winded explanations.\n" +
  "4. **Offline & Knowledge Boundaries:**\n" +
  "   - Rely strictly on verified academic knowledge and the contextual course materials provided.\n" +
  "   - If a specific past paper, syllabus, or detail is missing or ambiguous, state what is missing briefly and offer the closest general academic principle rather than hallucinating details.";

/**
 * Focus Mode prompt — the model is asked for *data* (a strict JSON concept
 * map), never UI. The app renders the JSON deterministically; a tolerant
 * parser + linear fallback keep the workspace working even when the small
 * model's JSON comes back imperfect.
 */
export const FOCUS_SYSTEM_PROMPT = `You are the AI Study Companion, an expert academic tutor. The student is trying to understand a complex academic topic properly. Produce a structured concept map of the topic as ONE valid JSON object and nothing else — no markdown fences, no commentary, no text before or after the JSON.

Schema:
{
  "nodes": [
    {"id": "n1", "label": "Short concept name", "kind": "definition|type|component|process|example|application|importance|note", "summary": "One short sentence (under 15 words).", "detail": "A proper explanation of 3-6 sentences: what it is, how it works, why it matters, with a concrete example."}
  ],
  "links": [
    {"from": "n1", "to": "n2", "label": "relationship like 'has parts' or 'depends on'"}
  ]
}

Rules:
- Include the topic itself as a node with kind "topic".
- Use 6 to 12 nodes total.
- Cover the important facets of a full academic explanation: definitions, types or classifications, components, processes or steps, examples, applications, and why the topic matters.
- Every node id must be unique and match n1, n2, n3… (use n1, n2, n3…).
- Every link must reference existing node ids. Connect the topic node to its major sub-concepts, and connect sub-concepts to each other where a real relationship exists.
- The "detail" fields must be genuinely educational — progressive and complete, not one-liners.`;
