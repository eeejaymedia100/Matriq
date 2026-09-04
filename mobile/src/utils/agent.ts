/**
 * Agent v2 API — POST /ai/agent.
 *
 * The agent is Magic Plus only (server enforces; the UI degrades honestly).
 * One call runs a bounded tool loop server-side (search my notes, read a
 * document, search the library, explain) and returns the final answer with
 * the tool trail for transparency.
 */
import { api, ApiError } from "../api/client";

export type AgentSurface = "reader" | "focus" | "chat";

export interface AgentRequest {
  query: string;
  surface: AgentSurface;
  docTitle?: string;
  courseCode?: string;
  itemId?: string;
  selection?: string;
  nodeLabel?: string;
  nodeKind?: string;
}

export interface AgentResponse {
  answer: string;
  toolCalls: { tool: string; ms: number; ok: boolean }[];
  elapsedMs: number;
  mode: "model" | "degraded" | "failed";
  surface: string;
}

export async function runAgent(req: AgentRequest): Promise<AgentResponse> {
  try {
    return await api.post<AgentResponse>("/ai/agent", req);
  } catch (err) {
    if (err instanceof ApiError && err.code === "MAGIC_PLUS_REQUIRED") {
      throw err; // surfaced verbatim — the upsell context is honest here
    }
    throw err;
  }
}
