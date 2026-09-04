import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
} from "@nestjs/common";
import { AchievementsService } from "./achievements.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtPayload } from "../auth/auth.service";
import {
  IsInt,
  IsOptional,
  IsBoolean,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";

/** On-device-only signals the app reports so the server can evaluate. */
class ClientSignalsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  notesCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  offlineAiCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  streak?: number;

  @IsOptional()
  @IsBoolean()
  todosDone?: boolean;
}

@Controller("v1/me/achievements")
export class AchievementsController {
  constructor(private readonly achievementsService: AchievementsService) {}

  /** Evaluate against real data, persist new unlocks, return the board. */
  @Post("evaluate")
  @UseGuards(JwtAuthGuard)
  evaluate(
    @CurrentUser() user: JwtPayload,
    @Body() client: ClientSignalsDto,
  ) {
    return this.achievementsService.evaluateBoard(user.sub, client);
  }

  /** Read the board (no evaluation, no writes). */
  @Get()
  @UseGuards(JwtAuthGuard)
  get(@CurrentUser() user: JwtPayload) {
    return this.achievementsService.getBoard(user.sub);
  }
}