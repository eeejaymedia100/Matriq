import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AdminGuard } from "../admin/admin.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtPayload } from "../auth/auth.service";
import { ResourceAuditService } from "./resource-audit.service";
import { ResourceAuditStatus } from "../generated/prisma/client";
import {
  DecideSubmissionDto,
  ReviewQueueQueryDto,
  SubmitResourceDto,
} from "./dto/submit-resource.dto";

/**
 * Resource Audit Engine — external API.
 *
 * Channel-agnostic by design: the app calls these endpoints today; the future
 * Telegram bot calls the same service methods (or these same endpoints with
 * its own token) — see docs/resource-audit-engine.md for the connection map.
 *
 * Layered rate limiting:
 *   - @Throttle on submit (transport-level, per-IP)
 *   - in-service rolling window per student (10/hour by default)
 *   - global ThrottlerModule guard applies to everything else
 */
@Controller("resource-audit")
export class ResourceAuditController {
  constructor(private readonly audit: ResourceAuditService) {}

  // ── Student endpoints ──────────────────────────────────────────────

  @Post("submissions")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 21 * 1024 * 1024 } }))
  submit(
    @CurrentUser() user: JwtPayload,
    @Body() body: SubmitResourceDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      // Mirror Nest's own 400 for a missing multipart part.
      throw new BadRequestException(
        "No file received. Attach the resource as the `file` form field.",
      );
    }
    return this.audit.submit({
      studentId: user.sub,
      fileName: file.originalname,
      buffer: file.buffer,
      courseCode: body.courseCode,
      materialType: body.materialType,
      level: body.level ?? null,
      academicSession: body.academicSession ?? null,
      rightsDeclared: body.rightsDeclared,
      institutionId: body.institutionId ?? null,
      faculty: body.faculty ?? null,
      department: body.department ?? null,
      source: "app",
    });
  }

  @Get("submissions/:id")
  @UseGuards(JwtAuthGuard)
  getStatus(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    // JwtPayload.role is the student literal; admins authenticate through the
    // admin session path, so owner-or-admin is owner-or-executive here.
    const isElevated = Array.isArray(user.executive) && user.executive.length > 0;
    return this.audit.getStatus(id, user.sub, isElevated);
  }

  @Get("me/submissions")
  @UseGuards(JwtAuthGuard)
  listMine(@CurrentUser() user: JwtPayload) {
    return this.audit.listByStudent(user.sub, user.sub, false);
  }

  // ── Admin endpoints ────────────────────────────────────────────────

  @Get("admin/review-queue")
  @UseGuards(JwtAuthGuard, AdminGuard)
  reviewQueue(@Query() query: ReviewQueueQueryDto) {
    return this.audit.reviewQueue(query.status as ResourceAuditStatus | undefined);
  }

  @Patch("admin/submissions/:id/decide")
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  decide(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: DecideSubmissionDto,
  ) {
    return this.audit.decide(id, user.sub, body.decision, body.reason);
  }

  @Post("admin/submissions/:id/retry")
  @UseGuards(JwtAuthGuard, AdminGuard)
  retry(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.audit.retryStage(id, user.sub);
  }
}
