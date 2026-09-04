import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  Res,
  StreamableFile,
  ForbiddenException,
} from "@nestjs/common";
import { Request, Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { ipAndEmailTracker } from "../throttler/trackers";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AdminGuard } from "./admin.guard";
import {
  AdminAuthService,
  AdminAuthResponse,
  AdminLoginResult,
} from "./admin-auth.service";
import { AdminService } from "./admin.service";
import { AuditService } from "../audit/audit.service";
import { InstitutionsService } from "../institutions/institutions.service";
import { VaultService } from "../vault/vault.service";
import { VerificationService } from "../verification/verification.service";
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

  // Institution scoping (dropdown cascade) — optional to stay compatible
  // with legacy free-text faculty associations.
  @IsOptional()
  institutionId?: string;

  @IsString()
  @IsNotEmpty()
  faculty: string;

  // Optional: scope to a specific department. Null = faculty-wide.
  @IsOptional()
  department?: string;

  @IsString()
  @IsOptional()
  whatsappNumber?: string;

  // Optional: association dashboard login (custom password set by admin).
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @MinLength(8)
  @IsOptional()
  password?: string;
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
    private readonly institutionsService: InstitutionsService,
    private readonly vaultService: VaultService,
    private readonly verificationService: VerificationService,
  ) {}

  // ── Auth ──────────────────────────────────────────────────────

  @Post("auth/login")
  @HttpCode(HttpStatus.OK)
  // Per-IP+email bucket — same rationale as student login (trackers.ts).
  @Throttle({
    default: { ttl: 60000, limit: 5, getTracker: ipAndEmailTracker },
  })
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
    @Req() req: Request,
  ) {
    const ip = (req.ip || req.socket.remoteAddress || "unknown") as string;
    const result = await this.adminService.createAssociation(dto, user.sub, ip);

    return result;
  }

  @Patch("associations/:id/status")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async updateAssociationStatus(
    @Param("id") id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: AdminPayload,
    @Req() req: Request,
  ) {
    const result = await this.adminService.updateAssociationStatus(
      id,
      dto.status,
    );
    const ip = (req.ip || req.socket.remoteAddress || "unknown") as string;

    await this.auditService.log({
      actorType: "admin",
      actorId: user.sub,
      action: "association.status_changed",
      targetType: "association",
      targetId: id,
      ipAddress: ip,
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

  // ── Platform-wide broadcasts (spec §1) ────────────────────────

  @Post("broadcasts")
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(HttpStatus.OK)
  async createBroadcast(
    @Body() dto: { title: string; body: string },
    @CurrentUser() user: AdminPayload,
    @Req() req: Request,
  ) {
    const ip = (req.ip || req.socket.remoteAddress || "unknown") as string;
    return this.adminService.createBroadcast(dto, user.sub, ip);
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

  // ── Payments & fees oversight ─────────────────────────────────

  @Get("payments")
  @UseGuards(JwtAuthGuard, AdminGuard)
  listPayments(
    @Query("status") status?: string,
    @Query("associationId") associationId?: string,
    @Query("cursor") cursor?: string,
    @Query("take") take?: string,
  ) {
    return this.adminService.listPayments({
      status,
      associationId,
      cursor,
      take: take ? Math.min(Number(take), 100) : undefined,
    });
  }

  @Get("fees")
  @UseGuards(JwtAuthGuard, AdminGuard)
  listFees(@Query("associationId") associationId?: string) {
    return this.adminService.listFees(associationId);
  }

  // ── Global verification queue ─────────────────────────────────

  @Get("verification-requests")
  @UseGuards(JwtAuthGuard, AdminGuard)
  listVerificationRequests(
    @Query("status") status?: string,
    @Query("associationId") associationId?: string,
  ) {
    return this.adminService.listVerificationRequests({
      status,
      associationId,
    });
  }

  // ── AI document moderation ────────────────────────────────────

  @Get("ai-documents")
  @UseGuards(JwtAuthGuard, AdminGuard)
  listAiDocuments(@Query("status") status?: string) {
    return this.adminService.listAiDocuments(status);
  }

  // ── Vault moderation queue (spec §15) ──────────────────────────

  @Get("vault-items")
  @UseGuards(JwtAuthGuard, AdminGuard)
  listVaultItems(@Query("status") status?: string) {
    return this.adminService.listVaultItems(status);
  }

  // ── Vault moderation preview (review the actual content) ──────

  @Get("vault-items/:id/text")
  @UseGuards(JwtAuthGuard, AdminGuard)
  vaultItemText(@Param("id") id: string) {
    return this.vaultService.getTextForAdmin(id);
  }

  @Get("vault-items/:id/file")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async vaultItemFile(
    @Param("id") id: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const { buffer, mimeType, fileName } =
      await this.vaultService.getFileForAdmin(id);
    res?.set({
      "Content-Type": mimeType,
      "Content-Disposition": `inline; filename="${this.safeHeaderName(fileName)}"`,
      "Cache-Control": "private, max-age=300",
    });
    return new StreamableFile(buffer);
  }

  // ── Verification document preview (platform oversight) ────────

  @Get("verification-requests/:id/document")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async verificationDocument(
    @Param("id") id: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const { buffer, mimeType, fileName } =
      await this.verificationService.getDocumentForAdmin(id);
    res?.set({
      "Content-Type": mimeType,
      "Content-Disposition": `inline; filename="${this.safeHeaderName(fileName)}"`,
      "Cache-Control": "private, max-age=300",
    });
    return new StreamableFile(buffer);
  }

  private safeHeaderName(name: string): string {
    const cleaned = name
      .replace(/[\r\n"\\]/g, "_")
      .replace(/[^\x20-\x7e]/g, "");
    return cleaned.trim() || "document";
  }

  @Post("vault-items/:id/moderate")
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(HttpStatus.OK)
  moderateVaultItem(
    @Param("id") id: string,
    @Body() dto: { status: "approved" | "rejected"; reason?: string },
    @CurrentUser() user: AdminPayload,
    @Req() req: Request,
  ) {
    const ip = (req.ip || req.socket.remoteAddress || "unknown") as string;
    return this.adminService.moderateVaultItem(
      id,
      dto.status,
      user.sub,
      ip,
      dto.reason,
    );
  }

  @Post("ai-documents/:id/moderate")
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(HttpStatus.OK)
  moderateAiDocument(
    @Param("id") id: string,
    @Body() dto: { status: "approved" | "rejected"; reason?: string },
    @CurrentUser() user: AdminPayload,
    @Req() req: Request,
  ) {
    const ip = (req.ip || req.socket.remoteAddress || "unknown") as string;
    return this.adminService.moderateAiDocument(
      id,
      dto.status,
      user.sub,
      ip,
      dto.reason,
    );
  }

  /**
   * One-click RAG backfill: ingest every approved vault item that has
   * extractable text but no ai_documents yet. Idempotent — safe to re-run;
   * items already ingested are skipped in place.
   */
  @Post("ai/backfill-ingestion")
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 2 } })
  backfillIngestion(@CurrentUser() user: AdminPayload, @Req() req: Request) {
    const ip = (req.ip || req.socket.remoteAddress || "unknown") as string;
    return this.adminService.backfillRagIngestion(user.sub, ip);
  }

  // ── Users ─────────────────────────────────────────────────────

  @Get("users")
  @UseGuards(JwtAuthGuard, AdminGuard)
  searchUsers(@Query("q") q?: string) {
    return this.adminService.searchUsers(q);
  }

  // ── User management: deletion requests (spec §10) ─────────────

  @Post("users/:id/cancel-deletion")
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(HttpStatus.OK)
  cancelUserDeletion(
    @Param("id") userId: string,
    @CurrentUser() user: AdminPayload,
    @Req() req: Request,
  ) {
    const ip = (req.ip || req.socket.remoteAddress || "unknown") as string;
    return this.adminService.cancelUserDeletion(userId, user.sub, ip);
  }

  // ── Executive role management ─────────────────────────────────

  @Get("executives")
  @UseGuards(JwtAuthGuard, AdminGuard)
  listExecutives(@Query("associationId") associationId?: string) {
    return this.adminService.listExecutives(associationId);
  }

  @Post("executives")
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(HttpStatus.CREATED)
  grantExecutiveRole(
    @Body() dto: { userId: string; associationId: string; role: string },
    @CurrentUser() user: AdminPayload,
    @Req() req: Request,
  ) {
    const ip = (req.ip || req.socket.remoteAddress || "unknown") as string;
    return this.adminService.grantExecutiveRole(dto, user.sub, ip);
  }

  // ── Admin account management ──────────────────────────────────

  @Get("admins")
  @UseGuards(JwtAuthGuard, AdminGuard)
  listAdmins() {
    return this.adminService.listAdmins();
  }

  @Post("admins")
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(HttpStatus.CREATED)
  createAdmin(
    @Body() dto: CreateAdminDto,
    @CurrentUser() user: AdminPayload,
    @Req() req: Request,
  ) {
    const ip = (req.ip || req.socket.remoteAddress || "unknown") as string;
    return this.adminService.createAdmin(dto, user.sub, ip);
  }

  // ── Institution management (admin) ────────────────────────────

  @Get("institutions/cascade")
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminCascade() {
    return this.institutionsService.fullCascade();
  }

  @Post("institutions")
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(HttpStatus.CREATED)
  createInstitution(
    @Body()
    dto: {
      name: string;
      shortName?: string;
      type?: string;
      state?: string;
    },
  ) {
    return this.institutionsService.create(dto);
  }

  @Delete("institutions/:id")
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(HttpStatus.OK)
  removeInstitution(@Param("id") id: string) {
    return this.institutionsService.remove(id);
  }

  @Post("institutions/:id/faculties")
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(HttpStatus.CREATED)
  addFaculty(@Param("id") id: string, @Body() dto: { name: string }) {
    return this.institutionsService.addFaculty(id, dto.name);
  }

  @Delete("faculties/:id")
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(HttpStatus.OK)
  removeFaculty(@Param("id") id: string) {
    return this.institutionsService.removeFaculty(id);
  }

  @Post("faculties/:id/departments")
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(HttpStatus.CREATED)
  addDepartment(@Param("id") id: string, @Body() dto: { name: string }) {
    return this.institutionsService.addDepartment(id, dto.name);
  }

  @Delete("departments/:id")
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(HttpStatus.OK)
  removeDepartment(@Param("id") id: string) {
    return this.institutionsService.removeDepartment(id);
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
