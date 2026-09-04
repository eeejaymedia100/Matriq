import {
  IsIn,
  IsOptional,
  IsString,
  IsObject,
  MaxLength,
} from "class-validator";

/**
 * Agent v2 contracts. The model proposes; validation disposes.
 *
 * AgentPlanDto — what the model must return each step: either NAME a tool
 * (we execute it; the model never executes anything) or produce the final
 * answer. Anything else fails validation and ends the loop safely.
 */
export class AgentPlanDto {
  @IsIn(["call", "answer"])
  action!: "call" | "answer";

  /** Tool name — must be one of MANIFEST names (checked at execution). */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  tool?: string;

  /** Free-form tool input; each tool validates its own inputs defensively. */
  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  answer?: string;
}

/** Shape of one executed tool call, for the response + audit trail. */
export interface AgentToolResult {
  result?: unknown;
  error?: string;
}

export interface AgentToolCall {
  tool: string;
  ms: number;
  ok: boolean;
}

export interface AgentRunResult {
  answer: string;
  toolCalls: AgentToolCall[];
  elapsedMs: number;
  /** How the run ended: model answer, degraded synthesis, or failure. */
  mode: "model" | "degraded" | "failed";
  /** Where the agent was invoked from (reader / focus / chat). */
  surface: string;
}

/** Where the agent was opened from — shapes the page-context snapshot. */
export interface AgentRequestContext {
  surface: "reader" | "focus" | "chat";
  docTitle?: string;
  courseCode?: string;
  itemId?: string;
  /** Passage the student quoted/selected in the reader. */
  selection?: string;
  nodeLabel?: string;
  nodeKind?: string;
}
