import { Injectable, Logger } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { AgentToolsService } from "./ai-agent-tools.service";
import { AgentPlanDto } from "./agent.schema";
import type {
  AgentRequestContext,
  AgentRunResult,
  AgentToolResult,
} from "./agent.schema";

/**
 * The deterministic half of Agent v2.
 *
 * Drives the tool loop: builds the tool manifest + page snapshot, asks the
 * fast model for a plan (JSON), VALIDATES it against AgentPlanDto, executes
 * only allowlisted tools (AgentToolsService), feeds observations back, and
 * hard-caps the loop. The model can only NAME tools — it never executes
 * anything and never sees credentials. Unparseable plans end the loop with
 * whatever the tools gathered (degraded mode), so the agent stays useful
 * without its brain.
 */
@Injectable()
export class AiAgentService {
  private static readonly MAX_STEPS = 4;
  private static readonly MAX_OBSERVATION_CHARS = 1_500;

  private readonly logger = new Logger(AiAgentService.name);

  constructor(private readonly tools: AgentToolsService) {}

  async run(
    userId: string,
    query: string,
    context: AgentRequestContext,
  ): Promise<AgentRunResult> {
    const started = Date.now();
    const safeQuery = query.trim().slice(0, 1_000);
    const toolCalls: { tool: string; ms: number; ok: boolean }[] = [];
    const observations: string[] = [];

    const snapshot = this.buildSnapshot(context);
    let answer: string | null = null;
    let mode: AgentRunResult["mode"] = "model";

    for (let step = 0; step < AiAgentService.MAX_STEPS; step += 1) {
      const plan = await this.requestPlan(safeQuery, snapshot, observations, step);

      if (!plan) {
        // Unparseable/unreachable model — degrade honestly from tool results.
        mode = "degraded";
        answer = observations.length
          ? this.synthesizeFromObservations(safeQuery, observations)
          : "I couldn't work out how to help with that right now — try rephrasing, or ask in the usual chat.";
        break;
      }

      if (plan.action === "answer") {
        answer = plan.answer?.trim() || "I couldn't produce an answer — try again.";
        break;
      }

      // Validated tool call — execute through the allowlist.
      const t0 = Date.now();
      let result: AgentToolResult;
      try {
        result = await this.tools.call(userId, plan.tool ?? "", plan.input);
      } catch (err) {
        result = { error: err instanceof Error ? err.message : "tool failed" };
      }
      const ms = Date.now() - t0;
      const toolName = plan.tool ?? "unknown";
      toolCalls.push({ tool: toolName, ms, ok: !result.error });

      observations.push(
        this.truncate(
          `Tool ${toolName} → ${result.error ? `error: ${result.error}` : JSON.stringify(result.result)}`,
          AiAgentService.MAX_OBSERVATION_CHARS,
        ),
      );
    }

    if (answer === null) {
      // Step budget exhausted without a final answer — synthesize.
      mode = observations.length ? "degraded" : "failed";
      answer = observations.length
        ? this.synthesizeFromObservations(safeQuery, observations)
        : "I couldn't complete that in time — please try again.";
    }

    return {
      answer,
      toolCalls,
      elapsedMs: Date.now() - started,
      stepsUsed: toolCalls.length,
      mode,
      surface: context.surface,
    } as AgentRunResult & { stepsUsed: number };
  }

  /** Page-context snapshot — what the agent is told about where it opened. */
  private buildSnapshot(context: AgentRequestContext): string {
    const parts: string[] = [`Surface: ${context.surface}`];
    if (context.docTitle) parts.push(`Open document: ${context.docTitle}`);
    if (context.courseCode) parts.push(`Course: ${context.courseCode}`);
    if (context.itemId) parts.push(`Document id: ${context.itemId}`);
    if (context.selection) {
      parts.push(
        `Selected passage (quoted by the student): "${context.selection.slice(0, 600)}"`,
      );
    }
    if (context.nodeLabel) {
      parts.push(
        `Focus map node: ${context.nodeLabel} (${context.nodeKind ?? "concept"})`,
      );
    }
    return parts.join("\n");
  }

  /** One plan request against the fast cloud model (flash tier). */
  private async requestPlan(
    query: string,
    snapshot: string,
    observations: string[],
    step: number,
  ): Promise<AgentPlanDto | null> {
    const manifest = AgentToolsService.MANIFEST.map(
      (t) => `- ${t.name}: ${t.description}`,
    ).join("\n");

    const system = [
      "You are Matriq's study agent. You help a student by calling tools.",
      "Available tools:",
      manifest,
      "",
      "Rules:",
      "- Respond ONLY with a JSON object, no prose, no markdown fences.",
      '- Shape: {"action":"call","tool":"<name>","input":{...}} to use a tool,',
      '- or {"action":"answer","answer":"<text>"} to answer the student directly.',
      "- Call a tool only when its result would materially change your answer.",
      "- After enough observations (usually 1-2 calls), answer.",
      `- You have ${AiAgentService.MAX_STEPS - step} tool step(s) left.`,
    ].join("\n");

    const user = [
      `Page context:\n${snapshot}`,
      observations.length
        ? `\nObservations so far:\n${observations.join("\n")}`
        : "",
      `\nStudent request: ${query}`,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const raw = await this.modelJson(`${system}\n\n${user}`);
      return await this.parsePlan(raw);
    } catch (err) {
      this.logger.warn(
        `Agent plan failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /** Parse + validate the model's plan. Anything invalid → null (degrade). */
  private async parsePlan(raw: string): Promise<AgentPlanDto | null> {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
    const dto = plainToInstance(AgentPlanDto, parsed);
    const errors = await validate(dto, { whitelist: true });
    if (errors.length > 0) return null;
    return dto;
  }

  /** One JSON generation call against the fast cloud model. */
  private async modelJson(prompt: string): Promise<string> {
    const key = process.env.GEMINI_API_KEY?.trim();
    const model =
      process.env.AGENT_MODEL?.trim() ||
      process.env.GEMINI_MODEL?.trim() ||
      "gemini-2.0-flash";
    if (!key) throw new Error("Agent model not configured");

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 700 },
        }),
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!res.ok) throw new Error(`Agent model HTTP ${res.status}`);
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return text
      .replace(/```(?:json)?\s*/gi, "")
      .replace(/```/g, "")
      .trim();
  }

  /**
   * Degraded final answer built purely from tool observations — used when
   * the model can't be reached. Tool results are already student-shaped, so
   * the agent remains useful without its brain.
   */
  private synthesizeFromObservations(
    query: string,
    observations: string[],
  ): string {
    const lines = observations
      .map((o) => o.replace(/^Tool \S+ → /, ""))
      .filter((o) => !o.startsWith("error:"));
    if (lines.length === 0) {
      return "I couldn't reach the AI service, and no tool results are available. Please try again shortly.";
    }
    return [
      `Here's what I found for "${query.slice(0, 120)}" (AI summary was unavailable):`,
      ...lines.slice(0, 3),
    ].join("\n\n");
  }

  private truncate(text: string, max: number): string {
    return text.length <= max ? text : `${text.slice(0, max)}…`;
  }
}
