import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Req,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { WaitlistService, JoinWaitlistDto } from "./waitlist.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AdminGuard } from "../admin/admin.guard";
import {
  IsEmail,
  IsOptional,
  IsString,
  IsBoolean,
  MaxLength,
} from "class-validator";

class PublicJoinDto implements JoinWaitlistDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  source?: string;

  // Growth survey (waitlist launch package §3) — all optional, never block a
  // signup on them.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  painPoint?: string;

  @IsOptional()
  @IsBoolean()
  isAssociationExec?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  execLevel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  execDepartment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  execFaculty?: string;

  // Honeypot: bots fill hidden fields. If present, we answer politely but
  // silently drop the request.
  @IsOptional()
  @IsString()
  website?: string;
}

@Controller("v1")
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  /**
   * Public waitlist signup — deliberately unauthenticated and throttled.
   */
  @Post("waitlist")
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  join(
    @Body() dto: PublicJoinDto,
    @Req() req: Request,
    @Headers("user-agent") userAgent?: string,
  ) {
    // Honeypot trap: silently pretend success for bots.
    if (dto.website && dto.website.length > 0) {
      return { message: "You're on the list!", position: 0 };
    }

    const ip = (req.ip || req.socket.remoteAddress || "unknown") as string;
    return this.waitlistService.join(
      {
        email: dto.email,
        fullName: dto.fullName,
        source: dto.source,
        painPoint: dto.painPoint,
        isAssociationExec: dto.isAssociationExec,
        execLevel: dto.execLevel,
        execDepartment: dto.execDepartment,
        execFaculty: dto.execFaculty,
      },
      ip,
      userAgent ?? "",
    );
  }

  /** Public: live signup counter (number only). */
  @Get("waitlist/count")
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  async count() {
    const total = await this.waitlistService.publicCount();
    return { total };
  }

  // ── Admin ────────────────────────────────────────────────────

  @Get("admin/waitlist")
  @UseGuards(JwtAuthGuard, AdminGuard)
  list(@Query("cursor") cursor?: string, @Query("take") take?: string) {
    return this.waitlistService.adminList(
      cursor,
      take ? Math.min(Number(take), 100) : undefined,
    );
  }

  @Get("admin/waitlist/stats")
  @UseGuards(JwtAuthGuard, AdminGuard)
  stats() {
    return this.waitlistService.adminStats();
  }
}
