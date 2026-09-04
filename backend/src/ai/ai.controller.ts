import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Res,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from "@nestjs/common";
import {
  IsInt,
  IsOptional,
  IsString,
  IsIn,
  Max,
  Min,
  MaxLength,
} from "class-validator";
import { Type } from "class-transformer";
import { Response } from "express";
import type { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { AiService } from "./ai.service";
import { AiQuotaService } from "./ai-quota.service";
import { AiAgentService } from "./ai-agent.service";
import { AuditService } from "../audit/audit.service";
import { EntitlementService } from "../entitlement/entitlement.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtPayload } from "../auth/auth.service";

class AgentRequestDto {
  @IsString()
  @MaxLength(1_000)
  query!: string;

  @IsOptional()
  @IsIn(["reader", "focus", "chat"])
  surface?: "reader" | "focus" | "chat";

  @IsOptional()
  @IsString()
  @MaxLength(200)
  docTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  courseCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  itemId?: string;

  /** Passage the student selected in the reader (bounded, server-side too). */
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  selection?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nodeLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  nodeKind?: string;
}

class FactsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(12)
  count?: number;
}

class QuizDto {
  @IsOptional()
  @IsString()
  courseCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(10)
  count?: number;
}

@Controller("v1")
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly quota: AiQuotaService,
    private readonly agentService: AiAgentService,
    private readonly entitlements: EntitlementService,
    private readonly audit: AuditService,
  ) {}

  /** Quickie daily-quota snapshot for the chat UI. */
  @Get("ai/quota")
  @UseGuards(JwtAuthGuard)
  quotaStatus(@CurrentUser() user: JwtPayload) {
    return this.quota.status(user.sub);
  }

  @Post("ai/query")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  query(@CurrentUser() user: JwtPayload, @Body() dto: { query: string }) {
    return this.aiService.query(user.sub, dto);
  }

  /**
   * "Ask my notes" — answers strictly from the student's own ingested
   * material (vault uploads + Deep Read transcriptions). Premium-gated,
   * owner-scoped retrieval; distinct from Quickie's daily cap.
   */
  @Post("ai/ask-my-notes")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  askMyNotes(@CurrentUser() user: JwtPayload, @Body() dto: { query: string }) {
    return this.aiService.askMyNotes(user.sub, dto?.query);
  }

  /**
   * Agent v2 — the bounded tool-using assistant (reader companion, Focus
   * assist, library runner). Premium-gated like the other cloud-AI flows;
   * tool access is allowlisted and owner-scoped inside AgentToolsService.
   */
  @Post("ai/agent")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async agent(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AgentRequestDto,
    @Req() req: Request,
  ) {
    const ent = await this.entitlements.status(user.sub);
    if (!ent.isPremium) {
      throw new ForbiddenException({
        code: "MAGIC_PLUS_REQUIRED",
        message:
          "The study agent is a Magic Plus feature — it can search your notes, read your documents and explain concepts on command.",
      });
    }
    const result = await this.agentService.run(user.sub, dto.query ?? "", {
      surface: (dto.surface ?? "chat") as "reader" | "focus" | "chat",
      docTitle: dto.docTitle,
      courseCode: dto.courseCode,
      itemId: dto.itemId,
      selection: dto.selection,
      nodeLabel: dto.nodeLabel,
      nodeKind: dto.nodeKind,
    });
    // Audit trail: which tools ran, for whom, from where. No content —
    // answers may include student material, the log must not.
    this.audit
      .log({
        actorType: "student",
        actorId: user.sub,
        action: "ai.agent.run",
        targetType: "ai_agent",
        ipAddress: (req.ip || req.socket?.remoteAddress || "unknown") as string,
        metadata: {
          surface: result.surface,
          tools: result.toolCalls.map((t) => t.tool),
          steps: result.toolCalls.length,
          ms: result.elapsedMs,
          mode: result.mode,
        },
      })
      .catch(() => undefined);
    return result;
  }

  /**
   * SSE streaming variant of /ai/query. Emits `data:` events with
   * { type: "content" | "sources" | "done" } payloads, then closes.
   * Falls back to a single content event on any streaming failure.
   */
  @Post("ai/query/stream")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async streamQuery(
    @CurrentUser() user: JwtPayload,
    @Body() dto: { query: string },
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    // If the client disconnects, abort the upstream Ollama stream.
    res.on("close", () => {
      res.end();
    });

    try {
      await this.aiService.streamQuery(user.sub, dto, res);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Stream failed";
      res.write(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
    } finally {
      res.end();
    }
  }

  /**
   * Cloud-AI study facts (round-2 QA §8). Gemini-generated batch, cached
   * server-side; the client rotates the cached copy. Never called on a timer
   * — fetched once a day at most.
   */
  @Post("ai/facts")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  facts(@Body() dto: FactsDto) {
    return this.aiService.generateFacts(dto?.count);
  }

  /**
   * Cloud-AI quiz (round-2 QA §8), personalised to the student's own approved
   * uploaded materials. Seed fallback when no materials or no Gemini key.
   */
  @Post("ai/quiz")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  quiz(@CurrentUser() user: JwtPayload, @Body() dto: QuizDto) {
    return this.aiService.generateQuiz(
      user.sub,
      dto?.courseCode,
      dto?.count,
    );
  }

  @Get("ai/conversations")
  @UseGuards(JwtAuthGuard)
  getConversations(
    @CurrentUser() user: JwtPayload,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.aiService.getConversations(
      user.sub,
      cursor,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Post("ai/materials")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  submitMaterial(
    @CurrentUser() user: JwtPayload,
    @Body()
    dto: {
      sourceType: string;
      courseCode?: string;
      associationId?: string;
      contentChunk: string;
    },
  ) {
    return this.aiService.submitMaterial(user.sub, dto);
  }
}
