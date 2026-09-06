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
import { Res, StreamableFile } from "@nestjs/common";
import type { Request, Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AdminGuard } from "../admin/admin.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtPayload } from "../auth/auth.service";
import { ResourceAuditService } from "./resource-audit.service";
import { ResourceRewardService } from "./resource-audit.rewards";
import { ResourceAuditStatus, ResourceRewardState } from "../generated/prisma/client";
import {
  DecideSubmissionDto,
  ReviewQueueQueryDto,
  SubmitResourceDto,
  ReopenDto,
  NotesDto,
  PayoutDto,
  DisputeDto,
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
  constructor(
    private readonly audit: ResourceAuditService,
    private readonly rewardsService: ResourceRewardService,
  ) {}

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
    return this.audit.adminReviewQueue({
      status: query.status,
      risk: query.risk,
      aiRecommendation: query.aiRecommendation,
      institutionId: query.institutionId,
      courseCode: query.courseCode,
      materialType: query.materialType,
      take: query.take ? Number(query.take) : undefined,
    });
  }

  @Get("admin/submissions/:id/review")
  @UseGuards(JwtAuthGuard, AdminGuard)
  reviewDetail(@Param("id", ParseUUIDPipe) id: string) {
    return this.audit.adminReviewDetail(id);
  }

  /** Streams the preserved ORIGINAL to an authorized reviewer. */
  @Get("admin/submissions/:id/file")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async reviewFile(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.audit.adminFile(id, user.sub);
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${file.fileName.replace(/"/g, "")}"`);
    res.setHeader("Cache-Control", "private, no-store");
    return new StreamableFile(file.buffer);
  }

  @Patch("admin/submissions/:id/reopen")
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminReopen(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ReopenDto,
  ) {
    return this.audit.adminReopen(id, user.sub, body.note);
  }

  @Patch("admin/submissions/:id/notes")
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminNotes(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: NotesDto,
  ) {
    return this.audit.adminNotes(id, user.sub, body.notes);
  }

  /** AI-vs-human agreement, per risk level and per provider/model. */
  @Get("admin/metrics")
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminMetrics() {
    return this.audit.adminMetrics();
  }

  // ── Reward administration (Part 5) ─────────────────────────────────

  @Get("admin/rewards")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async adminRewards(@Query("state") state?: string) {
    const valid = ["pending", "eligible", "processing", "paid", "rejected", "disputed"];
    const parsed = state && valid.includes(state) ? (state as ResourceRewardState) : undefined;
    return { items: await this.rewardsService.listRewards(parsed) };
  }

  @Post("admin/rewards/:id/paid")
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminMarkPaid(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: PayoutDto,
  ) {
    return this.rewardsService.markPaid(id, user.sub, body.payoutMethod, body.payoutRef);
  }

  @Post("admin/rewards/:id/dispute")
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminDispute(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: DisputeDto,
  ) {
    return this.rewardsService.dispute(id, user.sub, body.note);
  }

  @Get("admin/leaderboard")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async adminLeaderboard(@Query("limit") limit?: string) {
    return { items: await this.rewardsService.leaderboard(limit ? Math.min(Number(limit), 100) : 20) };
  }

  @Get("admin/campaign")
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminCampaign() {
    const c = this.rewardsService.getConfig();
    return {
      id: c.id,
      name: c.name,
      active: c.active,
      pointsPerApproved: c.pointsPerApprovedResource,
      tiers: c.tiers.map((t) => ({
        id: t.id,
        label: t.label,
        threshold: t.requiredPoints,
        kind: t.kind,
        value: t.valueDescription,
      })),
    };
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
