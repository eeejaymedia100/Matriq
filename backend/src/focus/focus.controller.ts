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
} from "@nestjs/common";
import { IsOptional, IsString, IsInt, Min, Max, Length } from "class-validator";
import { Type } from "class-transformer";
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
    return this.focus.generate(user.sub, dto.topic);
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