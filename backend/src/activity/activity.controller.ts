import {
  Body,
  Controller,
  Post,
  UseGuards,
} from "@nestjs/common";
import { IsArray, IsIn, IsString, MaxLength, ArrayMaxSize, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { Throttle } from "@nestjs/throttler";
import { ActivityService, ActivityKind, ACTIVITY_KINDS } from "./activity.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtPayload } from "../auth/auth.service";

/**
 * Client activity synchronization.
 *
 * Notes and study tasks live on-device (offline-first), so their existence
 * can't be proven server-side. The app reports the *ids* of notes it has
 * created and tasks it has completed; the server journals each id once
 * (idempotent by unique key), so:
 *  - replaying the same payload double-credits nothing,
 *  - a client that lies about random ids earns nothing (no such records
 *    exist and no board signal reads them),
 *  - the honest app's data survives restarts and re-syncs.
 */
class ClientEventDto {
  @IsIn(ACTIVITY_KINDS, {
    message: "Unsupported activity kind",
  })
  kind: ActivityKind;

  @IsString()
  @MaxLength(180)
  naturalId: string;
}

class SyncActivityDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ClientEventDto)
  events: ClientEventDto[];
}

@Controller("v1/me/activity")
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Post("sync")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async syncActivity(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SyncActivityDto,
  ): Promise<{ journaled: number }> {
    const journaled = await this.activity.journalMany(user.sub, dto.events ?? []);
    return { journaled };
  }
}