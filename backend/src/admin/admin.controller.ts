import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  ForbiddenException,
} from "@nestjs/common";
import { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AdminGuard } from "./admin.guard";
import {
  AdminAuthService,
  AdminAuthResponse,
  AdminLoginResult,
} from "./admin-auth.service";
import { AdminService } from "./admin.service";
import { AuditService } from "../audit/audit.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AdminPayload } from "./admin-auth.service";
import {
  IsEmail,
  IsString,
  IsNotEmpty,
  IsIn,
  IsOptional,
  MinLength,
  Length,
} from "class-validator";

class AdminLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

class AdminMfaChallengeDto {
  @IsString()
  @MinLength(10)
  challengeToken: string;

  @IsString()
  @Length(6, 6)
  code: string;
}

class AdminMfaCodeDto {
  @IsString()
  @Length(6, 6)
  code: string;
}

class CreateAssociationDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  shortCode: string;

  @IsString()
  @IsNotEmpty()
  faculty: string;

  @IsString()
  @IsOptional()
  whatsappNumber?: string;
}

class UpdateStatusDto {
  @IsString()
  @IsIn(["active", "suspended"])
  status: "active" | "suspended";
}

class CreateAdminDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(12)
  password: string;
}

@Controller("v1/admin")
export class AdminController {
  constructor(
    private readonly adminAuthService: AdminAuthService,
    private readonly adminService: AdminService,
    private readonly auditService: AuditService,
  ) {}

  // ── Auth ──────────────────────────────────────────────────────

  @Post("auth/login")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  login(
    @Body() dto: AdminLoginDto,
    @Req() req: Request,
  ): Promise<AdminLoginResult> {
    const ip = (req.ip || req.socket.remoteAddress || "unknown") as string;
    return this.adminAuthService.login(dto.email, dto.password, ip);
  }

  // Step 2 of MFA login for MFA-enabled admin accounts.
  @Post("auth/mfa/challenge")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  completeMfaLogin(
    @Body() dto: AdminMfaChallengeDto,
    @Req() req: Request,
  ): Promise<AdminAuthResponse> {
    const ip = (req.ip || req.socket.remoteAddress || "unknown") as string;
    return this.adminAuthService.completeMfaLogin(
      dto.challengeToken,
      dto.code,
      ip,
    );
  }

  // ── MFA management (authenticated admin only) ──────────────────

  @Post("auth/mfa/enroll")
  @UseGuards(JwtAuthGuard, AdminGuard)
  enrollMfa(@CurrentUser() user: AdminPayload) {
    return this.adminAuthService.enrollMfa(user.sub);
  }

  @Post("auth/mfa/verify")
  @UseGuards(JwtAuthGuard, AdminGuard)
  verifyMfaEnrollment(
    @CurrentUser() user: AdminPayload,
    @Body() dto: AdminMfaCodeDto,
  ) {
    return this.adminAuthService.verifyAndEnableMfa(user.sub, dto.code);
  }

  @Post("auth/mfa/disable")
  @UseGuards(JwtAuthGuard, AdminGuard)
  disableMfa(@CurrentUser() user: AdminPayload) {
    return this.adminAuthService.disableMfa(user.sub);
  }

  @Get("auth/mfa-status")
  @UseGuards(JwtAuthGuard, AdminGuard)
  mfaStatus(@CurrentUser() user: AdminPayload) {
    return this.adminAuthService.mfaStatus(user.sub);
  }

  @Get("auth/me")
  @UseGuards(JwtAuthGuard, AdminGuard)
  me(@CurrentUser() user: AdminPayload) {
    return this.adminAuthService.me(user.sub);
  }

  // ── Associations ──────────────────────────────────────────────

  @Get("associations")
  @UseGuards(JwtAuthGuard, AdminGuard)
  listAssociations(
    @Query("cursor") cursor?: string,
    @Query("take") take?: string,
  ) {
    return this.adminService.listAssociations(
      cursor,
      take ? Math.min(Number(take), 50) : undefined,
    );
  }

  @Post("associations")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async createAssociation(
    @Body() dto: CreateAssociationDto,
    @CurrentUser() user: AdminPayload,
  ) {
    const result = await this.adminService.createAssociation(dto);

    await this.auditService.log({
      actorType: "admin",
      actorId: user.sub,
      action: "association.created",
      targetType: "association",
      targetId: result.id,
      ipAddress: "0.0.0.0", // TODO: use request IP
      metadata: { name: result.name, shortCode: result.shortCode },
    });

    return result;
  }

  @Patch("associations/:id/status")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async updateAssociationStatus(
    @Param("id") id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: AdminPayload,
  ) {
    const result = await this.adminService.updateAssociationStatus(
      id,
      dto.status,
    );

    await this.auditService.log({
      actorType: "admin",
      actorId: user.sub,
      action: "association.status_changed",
      targetType: "association",
      targetId: id,
      ipAddress: "0.0.0.0", // TODO: use request IP
      metadata: {
        previousStatus: (result as { previousStatus: string }).previousStatus,
        newStatus: dto.status,
      },
    });

    return result;
  }

  // ── Analytics ─────────────────────────────────────────────────

  @Get("analytics")
  @UseGuards(JwtAuthGuard, AdminGuard)
  getAnalytics() {
    return this.adminService.getAnalytics();
  }

  // ── Audit logs ────────────────────────────────────────────────

  @Get("audit-logs")
  @UseGuards(JwtAuthGuard, AdminGuard)
  getAuditLogs(
    @Query("cursor") cursor?: string,
    @Query("take") take?: string,
    @Query("action") action?: string,
    @Query("actorType") actorType?: "executive" | "admin",
  ) {
    return this.auditService.query({
      action,
      actorType,
      limit: take ? Math.min(Number(take), 100) : 50,
      offset: cursor ? Number(cursor) : 0,
    });
  }

  // ── Bootstrap (development only) ──────────────────────────────
  // Never reachable in production: creating an admin account is a privileged
  // action and this endpoint is intentionally unauthenticated for bootstrapping.

  @Post("auth/setup")
  @Throttle({ default: { ttl: 60000, limit: 2 } })
  setupAdmin(@Body() dto: CreateAdminDto) {
    if (process.env.NODE_ENV === "production") {
      throw new ForbiddenException("Admin bootstrap is disabled in production");
    }
    return this.adminAuthService.createInitialAdmin(dto.email, dto.password);
  }
}
