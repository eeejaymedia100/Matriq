import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
} from "@nestjs/common";
import {
  IsOptional,
  IsString,
  IsInt,
  IsObject,
  Min,
  Max,
  Length,
} from "class-validator";
import { Type } from "class-transformer";
import { Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { FocusService } from "./focus.service";
import { EntitlementService } from "../entitlement/entitlement.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtPayload } from "../auth/auth.service";
import { userTracker } from "../throttler/trackers";

class GenerateDto {
  @IsString()
  @Length(1, 300)
  topic!: string;

  /** The Questioner: answered intake set (optional — legacy flows omit it). */
  @IsOptional()
  @IsString()
  @Length(1, 60)
  clarificationId?: string;

  /** Question id → answer (tap-able options or short free text). */
  @IsOptional()
  @IsObject()
  answers?: Record<string, string>;
}

class ExpandDto {
  @IsString()
  @Length(1, 60)
  conceptId!: string;
}

class CheckpointDto {
  @IsString()
  @Length(1, 60)
  conceptId!: string;

  @IsString()
  @Length(1, 2000)
  answer!: string;
}

class AnswersDto {
  @IsObject()
  answers!: Record<string, string>;
}

class ListQuery {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

@Controller("v1")
export class FocusController {
  constructor(
    private readonly focus: FocusService,
    private readonly entitlements: EntitlementService,
  ) {}

  /**
   * Generate a cloud Focus Map. Premium Magic Plus feature; non-premium users
   * get a starter allowance (free generations) before it requires Magic Plus.
   * Authenticated + per-user throttled + daily-capped server-side.
   */
  @Post("focus/generate")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 10, getTracker: userTracker } })
  generate(@CurrentUser() user: JwtPayload, @Body() dto: GenerateDto) {
    return this.focus.generate(user.sub, dto.topic, undefined, {
      clarificationId: dto.clarificationId,
      answers: dto.answers,
    });
  }

  /**
   * The Questioner — 2-3 tap-to-answer intake questions for a topic, before
   * any map is generated. Cached per topic; paywall is surfaced here (before
   * the student answers), and the step is skippable by design.
   */
  @Post("focus/clarify")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 10, getTracker: userTracker } })
  clarify(@CurrentUser() user: JwtPayload, @Body() dto: GenerateDto) {
    return this.focus.clarify(user.sub, dto.topic);
  }

  /**
   * Persist answers for an intake set (progress saving mid-flow; ownership
   * enforced). Answers may also be sent inline to focus/generate.
   */
  @Post("focus/clarify/:id/answers")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 20, getTracker: userTracker } })
  submitAnswers(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: AnswersDto,
  ) {
    return this.focus.submitClarificationAnswers(user.sub, id, dto.answers);
  }

  /**
   * SSE variant of focus/generate emitting honest stage progress
   * (understanding → reading → validating) before the final map event, so
   * the app shows real generation progress instead of a bare spinner. Same
   * quota/authorization path as the JSON endpoint; failures are SSE error
   * events with the same codes the JSON path returns.
   */
  @Post("focus/generate/stream")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 10, getTracker: userTracker } })
  async generateStream(
    @CurrentUser() user: JwtPayload,
    @Body() dto: GenerateDto,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    res.on("close", () => res.end());
    const send = (payload: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    try {
      const result = await this.focus.generate(
        user.sub,
        dto.topic,
        (stage) => send({ type: "progress", stage }),
        { clarificationId: dto.clarificationId, answers: dto.answers },
      );
      send({ type: "map", map: result.map, sessionId: result.sessionId, cached: result.cached, usage: result.usage });
    } catch (err) {
      // Mirror Nest's exception-filter discipline: only messages from real
      // HttpExceptions (which were written for students) reach the client.
      // Anything else (Prisma faults, network internals) is sanitized to a
      // generic 500 — the JSON endpoint never leaks these, neither do we.
      const isHttp = typeof (err as { status?: number }).status === "number";
      const status = isHttp ? (err as { status: number }).status : 500;
      const message = isHttp
        ? err instanceof Error
          ? err.message
          : "Generation failed"
        : "Generation failed — please try again in a moment.";
      const code =
        (err as { response?: { code?: string } }).response?.code ??
        (status === 403 ? "MAGIC_PLUS_REQUIRED" : undefined);
      send({ type: "error", message, status, code });
    } finally {
      res.end();
    }
  }

  /**
   * Stage 2 of the staged architecture: expand one concept of an already
   * generated map into a fuller explanation (generated on open, not up front).
   */
  @Post("focus/maps/:id/expand")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 20, getTracker: userTracker } })
  expand(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: ExpandDto,
  ) {
    return this.focus.expandConcept(user.sub, id, dto.conceptId);
  }

  /**
   * Mastery checkpoint — the AI judges the student's answer against the
   * concept's own explanation. Junk answers are rejected deterministically
   * before any model call (see isObviousBypass).
   */
  @Post("focus/maps/:id/checkpoint")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 20, getTracker: userTracker } })
  checkpoint(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: CheckpointDto,
  ) {
    return this.focus.checkpoint(user.sub, id, dto.conceptId, dto.answer);
  }

  @Get("focus/maps")
  @UseGuards(JwtAuthGuard)
  list(@CurrentUser() user: JwtPayload, @Query() query: ListQuery) {
    return this.focus.listOwn(user.sub, query.cursor, query.limit);
  }

  @Get("focus/maps/:id")
  @UseGuards(JwtAuthGuard)
  get(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.focus.getOwn(user.sub, id);
  }

  /** Entitlement status — for UI display; the server stays authoritative. */
  @Get("focus/status")
  @UseGuards(JwtAuthGuard)
  status(@CurrentUser() user: JwtPayload) {
    return this.entitlements.status(user.sub);
  }
}