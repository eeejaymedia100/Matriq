import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Request } from "express";
import { FeesService, CreateFeeDto, UpdateFeeDto } from "./fees.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ExecutivesService } from "../auth/executives.service";
import { JwtPayload } from "../auth/auth.service";
import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  IsOptional,
  IsDateString,
} from "class-validator";

class CreateFeeBody implements CreateFeeDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsInt()
  @Min(1)
  amountKobo: number;

  @IsDateString()
  dueDate: string;

  @IsString()
  @IsOptional()
  session?: string;

  @IsString()
  @IsOptional()
  currency?: string;
}

class UpdateFeeBody implements UpdateFeeDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  amountKobo?: number;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsString()
  @IsOptional()
  session?: string;

  @IsString()
  @IsOptional()
  currency?: string;
}

@Controller("v1")
export class FeesController {
  constructor(
    private readonly feesService: FeesService,
    private readonly executivesService: ExecutivesService,
  ) {}

  @Post("associations/:id/fees")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("president", "treasurer")
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param("id") associationId: string,
    @Body() dto: CreateFeeBody,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const { executiveId } = this.executivesService.requireExecutiveFor(
      user,
      associationId,
    );
    const ip = (req.ip || req.socket.remoteAddress || "unknown") as string;
    return this.feesService.create(associationId, executiveId, dto, ip);
  }

  @Patch("fees/:id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("president", "treasurer")
  update(
    @Param("id") feeId: string,
    @Body() dto: UpdateFeeBody,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const ip = (req.ip || req.socket.remoteAddress || "unknown") as string;
    return this.feesService.updateAsExecutive(feeId, user, dto, ip);
  }

  @Get("associations/:id/fees/overview")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("president", "treasurer")
  overview(@Param("id") associationId: string) {
    return this.feesService.overview(associationId);
  }
}
