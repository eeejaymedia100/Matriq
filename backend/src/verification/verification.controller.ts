import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtPayload, ExecutiveRole } from "../auth/auth.service";
import { VerificationService } from "./verification.service";

@Controller("v1")
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  /**
   * Find the executive record ID for a given association from the JWT payload.
   * Throws if the user isn't an executive of that association.
   */
  private getExecutiveIdFor(user: JwtPayload, associationId: string): string {
    const execRoles = user.executive ?? [];
    const match = execRoles.find(
      (e: ExecutiveRole) => e.associationId === associationId,
    );
    if (!match) {
      throw new ForbiddenException(
        "You are not an executive of this association",
      );
    }
    return match.id; // AssociationExecutive.id
  }

  // ── Student: upload document ─────────────────────────────────

  @Post("me/verification/upload")
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor("document"))
  uploadDocument(
    @CurrentUser() user: JwtPayload,
    @Body("associationId") associationId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.verificationService.uploadDocument(
      user.sub,
      associationId,
      file,
    );
  }

  // ── Student: view own verification status ────────────────────

  @Get("me/verification")
  @UseGuards(JwtAuthGuard)
  getMyVerification(@CurrentUser() user: JwtPayload) {
    return this.verificationService.getMyVerification(user.sub);
  }

  // ── Executive: list verification requests ────────────────────

  @Get("associations/:associationId/verification-requests")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("president", "treasurer", "pro")
  listRequests(
    @Param("associationId") associationId: string,
    @Query("status") status?: "pending" | "approved" | "rejected",
  ) {
    return this.verificationService.listRequests(associationId, status);
  }

  // ── Executive: view document ─────────────────────────────────

  @Get("verification-requests/:id/document")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("president", "treasurer", "pro")
  getDocument(
    @Param("id") requestId: string,
    @Query("associationId") associationId: string,
  ) {
    return this.verificationService.getDocument(requestId, associationId);
  }

  // ── Executive: approve ───────────────────────────────────────

  @Post("verification-requests/:id/approve")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("president", "treasurer", "pro")
  @HttpCode(HttpStatus.OK)
  approve(
    @Param("id") requestId: string,
    @Body("associationId") associationId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const ip = (req.ip || req.socket.remoteAddress || "unknown") as string;
    const executiveId = this.getExecutiveIdFor(user, associationId);
    return this.verificationService.approve(
      requestId,
      associationId,
      executiveId,
      ip,
    );
  }

  // ── Executive: reject ────────────────────────────────────────

  @Post("verification-requests/:id/reject")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("president", "treasurer", "pro")
  @HttpCode(HttpStatus.OK)
  reject(
    @Param("id") requestId: string,
    @Body("associationId") associationId: string,
    @Body("reason") reason: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const ip = (req.ip || req.socket.remoteAddress || "unknown") as string;
    const executiveId = this.getExecutiveIdFor(user, associationId);
    return this.verificationService.reject(
      requestId,
      associationId,
      executiveId,
      reason,
      ip,
    );
  }
}
