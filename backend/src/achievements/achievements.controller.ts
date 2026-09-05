import {
  Controller,
  Get,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AchievementsService } from "./achievements.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtPayload } from "../auth/auth.service";

@Controller("v1/me/achievements")
export class AchievementsController {
  constructor(private readonly achievementsService: AchievementsService) {}

  /** Evaluate against real data, persist new unlocks, return the board. */
  @Post("evaluate")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  evaluate(@CurrentUser() user: JwtPayload) {
    return this.achievementsService.evaluateBoard(user.sub);
  }

  /** Read the board (no evaluation, no writes). */
  @Get()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  get(@CurrentUser() user: JwtPayload) {
    return this.achievementsService.getBoard(user.sub);
  }
}