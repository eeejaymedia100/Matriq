import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
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
