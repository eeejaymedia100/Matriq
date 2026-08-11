import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { AiService } from "./ai.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtPayload } from "../auth/auth.service";

@Controller("v1")
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post("ai/query")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  query(@CurrentUser() user: JwtPayload, @Body() dto: { query: string }) {
    return this.aiService.query(user.sub, dto);
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
