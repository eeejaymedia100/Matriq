import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { BannersService } from "./banners.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AdminGuard } from "../admin/admin.guard";
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsInt,
  IsArray,
  ValidateNested,
  IsUrl,
  MinLength,
  MaxLength,
  Min,
  Max,
  IsUUID,
} from "class-validator";
import { Type } from "class-transformer";

class UpsertBannerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @IsNotEmpty()
  body: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  linkLabel?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ["http", "https"] })
  linkUrl?: string;

  @IsOptional()
  @IsBoolean()
  published?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  startsAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  endsAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;
}

class ReorderItemDto {
  @IsUUID()
  id: string;

  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder: number;
}

class ReorderDto {
  @IsArray()
  @MaxLength(50)
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items: ReorderItemDto[];
}

@Controller("v1")
export class BannersController {
  constructor(private readonly bannersService: BannersService) {}

  /** Students' Home banner strip — published + schedule open, ordered. */
  @Get("banners")
  @UseGuards(JwtAuthGuard)
  listActive() {
    return this.bannersService.listActive();
  }

  // ── Admin console ─────────────────────────────────────────

  @Get("admin/banners")
  @UseGuards(JwtAuthGuard, AdminGuard)
  listAll() {
    return this.bannersService.listAll();
  }

  @Post("admin/banners")
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  create(@Body() dto: UpsertBannerDto, @Req() req: Request) {
    const ip = (req.ip || req.socket?.remoteAddress || "unknown") as string;
    return this.bannersService.create(dto, ip);
  }

  @Patch("admin/banners/:id")
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  update(@Param("id") id: string, @Body() dto: UpsertBannerDto, @Req() req: Request) {
    const ip = (req.ip || req.socket?.remoteAddress || "unknown") as string;
    return this.bannersService.update(id, dto, ip);
  }

  @Delete("admin/banners/:id")
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  remove(@Param("id") id: string, @Req() req: Request) {
    const ip = (req.ip || req.socket?.remoteAddress || "unknown") as string;
    return this.bannersService.remove(id, ip);
  }

  @Post("admin/banners/reorder")
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  reorder(@Body() dto: ReorderDto, @Req() req: Request) {
    const ip = (req.ip || req.socket?.remoteAddress || "unknown") as string;
    return this.bannersService.reorder(dto.items, ip);
  }
}