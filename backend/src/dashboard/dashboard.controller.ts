import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
} from "@nestjs/common";
import { DashboardService, DashboardStats } from "./dashboard.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ExecutivesService } from "../auth/executives.service";
import { JwtPayload } from "../auth/auth.service";
import { IsObject, IsUUID, IsNotEmpty } from "class-validator";

class VerifyReceiptDto {
  @IsUUID()
  @IsNotEmpty()
  receiptId: string;
}

class TransparencyDto {
  @IsObject()
  breakdown: Record<string, number>;
}

interface ActivityResponse {
  associationId: string;
  activity: Array<Record<string, unknown>>;
}

interface VerifyReceiptResponse {
  message: string;
  receiptId: string;
  paymentId?: string;
  amountKobo?: number;
  feeName?: string;
}

interface TransparencyResponse {
  message: string;
  associationId: string;
  breakdown: Record<string, number>;
}

@Controller("v1")
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly executivesService: ExecutivesService,
  ) {}

  @Get("associations/:id/dashboard")
  async getStats(
    @Param("id") associationId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<DashboardStats> {
    this.executivesService.requireExecutiveFor(user, associationId);
    return this.dashboardService.getStats(associationId);
  }

  @Get("associations/:id/activity")
  async getActivity(
    @Param("id") associationId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<ActivityResponse> {
    this.executivesService.requireExecutiveFor(user, associationId);
    return this.dashboardService.getActivity(associationId);
  }

  @Post("associations/:id/verify-receipt")
  @UseGuards(RolesGuard)
  @Roles("president", "treasurer")
  async verifyReceipt(
    @Param("id") associationId: string,
    @Body() dto: VerifyReceiptDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<VerifyReceiptResponse> {
    const { executiveId } = this.executivesService.requireExecutiveFor(
      user,
      associationId,
    );
    return this.dashboardService.verifyReceipt(
      associationId,
      dto.receiptId,
      executiveId,
    );
  }

  @Patch("associations/:id/transparency")
  @UseGuards(RolesGuard)
  @Roles("president")
  async updateTransparency(
    @Param("id") associationId: string,
    @Body() dto: TransparencyDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TransparencyResponse> {
    this.executivesService.requireExecutiveFor(user, associationId);
    return this.dashboardService.updateTransparency(
      associationId,
      dto.breakdown,
    );
  }
}
