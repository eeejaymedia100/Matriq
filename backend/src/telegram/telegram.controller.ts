import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import { TelegramCampaignService } from "./telegram-campaign.service";
import { AdminGuard } from "../admin/admin.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import {
  ResourceAuditService,
  SubmissionValidationError,
} from "../resource-audit/resource-audit.service";
import { TelegramBotService } from "./telegram-bot.service";
import { ToolsService } from "../tools/tools.service";
import { correctOcrText } from "../resource-audit/resource-audit.ocr-correct";
import { TelegramConfig } from "./telegram.config";
import { TgUpdate } from "./telegram.api";
import { TelegramMiniAppAuth, MiniAppSession } from "./telegram-miniapp-auth";
import { TelegramMiniAppGuard, MINIAPP_SESSION_KEY } from "./telegram-miniapp.guard";
import { loadCampaign } from "../resource-audit/resource-audit.rewards";

interface MiniAppRequest extends Request {
  [MINIAPP_SESSION_KEY]?: MiniAppSession;
}

@Controller("v1/telegram")
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(
    private readonly bot: TelegramBotService,
    private readonly miniAppAuth: TelegramMiniAppAuth,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly audit: ResourceAuditService,
    private readonly config: TelegramConfig,
    private readonly campaign: TelegramCampaignService,
    private readonly tools: ToolsService,
  ) {}

  // ── Webhook (Telegram → us) ──────────────────────────────────────

  /**
   * Telegram delivers updates here. The secret path segment is validated
   * against TELEGRAM_WEBHOOK_SECRET — Telegram includes it automatically
   * because setWebhook registered the full path including it.
   */
  @Post("webhook/:secret")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 600 } })
  async webhook(
    @Param("secret") secret: string,
    @Headers("x-telegram-bot-api-secret-token") headerToken: string | undefined,
    @Body() update: TgUpdate,
  ): Promise<{ ok: boolean }> {
    if (!this.config.webhookSecret || secret !== this.config.webhookSecret) {
      // Wrong path secret — do not reveal whether the endpoint exists.
      throw new UnauthorizedException();
    }
    // Defense in depth: when Telegram sends the header token it must match.
    if (headerToken && headerToken !== this.config.webhookSecret) {
      throw new UnauthorizedException();
    }
    if (update?.update_id !== undefined) {
      await this.bot.handleWebhookUpdate(update);
    }
    return { ok: true };
  }

  // ── Public info (waitlist site + Mini App bootstrap) ─────────────

  /** Public bot identity for CTAs. Safe to expose: usernames are public. */
  @Get("public-info")
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  publicInfo() {
    return {
      botUsername: this.config.botUsername,
      communityUrl: this.config.communityUrl,
      miniAppUrl: this.config.miniAppUrl,
      communityGateEnabled: true,
      botConfigured: this.config.isConfigured,
    };
  }

  // ── Mini App auth ────────────────────────────────────────────────

  /** Exchange Telegram initData for a short-lived scoped session token. */
  @Post("miniapp/auth")
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  async miniAppLogin(@Body("initData") initData: string) {
    if (typeof initData !== "string" || initData.length === 0 || initData.length > 4096) {
      throw new BadRequestException("initData missing.");
    }
    const session = this.miniAppAuth.validateInitData(initData);
    if (!session) {
      // The reason lands in the validator's warn log — this line makes the
      // rejection visible in aggregate when debugging webview-only failures.
      this.logger.warn(`miniapp/auth rejected initData (len=${initData.length})`);
      throw new UnauthorizedException("initData failed validation.");
    }
    const accessToken = this.jwt.sign(
      { tgId: session.telegramId, username: session.telegramUsername, scope: session.scope },
      { secret: process.env.JWT_SECRET, expiresIn: "12h" },
    );
    const linked = await this.prisma.user.findFirst({
      where: { telegramId: session.telegramId },
      select: { id: true, fullName: true, email: true, faculty: true, department: true, level: true },
    });
    return { token: accessToken, linked: linked ? true : false, account: linked };
  }

  // ── Mini App endpoints (scoped session) ──────────────────────────

  /** Who am I on Telegram, and is my Matriq account linked? */
  @Get("miniapp/me")
  @UseGuards(TelegramMiniAppGuard)
  async miniAppMe(@Req() req: MiniAppRequest) {
    const session = req[MINIAPP_SESSION_KEY]!;
    const user = await this.prisma.user.findFirst({
      where: { telegramId: session.telegramId },
      select: { id: true, fullName: true, email: true, faculty: true, department: true, level: true, institutionId: true },
    });
    const member = await this.gateCheck(session.telegramId);
    const participant = await this.campaign.getParticipant(session.telegramId);
    return {
      telegramId: session.telegramId,
      username: session.telegramUsername,
      linkedAccount: user,
      communityMember: member,
      verified: member && participant?.verifiedAt != null,
      canUpload: member && participant?.verifiedAt != null,
      points: participant?.points ?? 0,
      approvedCount: participant?.approvedCount ?? 0,
      // The academic context the chat wizard collects — the Mini App offers
      // the same choices as editable fields instead of re-asking every time.
      university: participant?.university ?? null,
      faculty: participant?.faculty ?? null,
      department: participant?.department ?? null,
      communityUrl: this.config.communityUrl,
      botUsername: this.config.botUsername,
      // Reward tiers so the client can show progress toward the next one.
      campaign: loadCampaign((key) => process.env[key]),
    };
  }

  /**
   * Self-serve community verification. The Mini App asks the bot to run the
   * same getChatMember check the chat's Verify button runs, so participants
   * never need to leave the app to prove membership.
   */
  @Post("miniapp/verify")
  @UseGuards(TelegramMiniAppGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async miniAppVerify(@Req() req: MiniAppRequest) {
    const session = req[MINIAPP_SESSION_KEY]!;
    const member = await this.gateCheck(session.telegramId);
    if (!member) {
      return { verified: false, reason: "not_member" };
    }
    await this.campaign.ensureParticipant({ id: Number(session.telegramId) });
    await this.campaign.markVerified(session.telegramId);
    return { verified: true };
  }

  /** Library search — the Mini App's browse view. */
  @Get("miniapp/library")
  @UseGuards(TelegramMiniAppGuard)
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  async miniAppLibrary(@Req() req: MiniAppRequest, @Query("q") q?: string, @Query("type") type?: string) {
    const session = req[MINIAPP_SESSION_KEY]!;
    const items = await this.prisma.vaultItem.findMany({
      where: {
        deletedAt: null,
        moderationStatus: "approved",
        visibility: "public",
        ...(q ? { OR: [{ courseCode: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }] } : {}),
        ...(type === "past_question" || type === "material" ? { type } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        title: true,
        courseCode: true,
        courseTitle: true,
        type: true,
        level: true,
        session: true,
        sizeBytes: true,
        createdAt: true,
      },
    });
    return { items, session: { telegramId: session.telegramId } };
  }

  /** Submit a resource from the Mini App (same audit pipeline as chat). */
  @Post("miniapp/submissions")
  @UseGuards(TelegramMiniAppGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 21 * 1024 * 1024 } }))
  @Throttle({ default: { ttl: 3600000, limit: 5 } })
  async miniAppSubmit(
    @Req() req: MiniAppRequest,
    @Body() body: {
      courseCode?: string;
      materialType?: string;
      academicSession?: string;
      level?: string;
      universityName?: string;
      faculty?: string;
      department?: string;
      rightsDeclared?: string;
    },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const session = req[MINIAPP_SESSION_KEY]!;
    const participant = await this.campaign.ensureParticipant({ id: session.telegramId });
    if (!participant.verifiedAt) {
      throw new ForbiddenException("Join the Matriq Telegram community first, then verify with the bot.");
    }
    if (!file) {
      throw new BadRequestException("A file is required.");
    }
    if (body.rightsDeclared !== "true") {
      throw new BadRequestException("You must confirm you have the right to share this material.");
    }
    try {
      const submission = await this.audit.submit({
        participantId: participant.id,
        fileName: file.originalname,
        buffer: file.buffer,
        courseCode: body.courseCode ?? "",
        materialType: body.materialType ?? "",
        level: body.level ?? null,
        academicSession: body.academicSession ?? null,
        universityName: body.universityName ?? participant.university ?? null,
        faculty: body.faculty ?? participant.faculty ?? null,
        department: body.department ?? participant.department ?? null,
        rightsDeclared: true,
        source: "telegram",
      });
      return { id: submission.id, auditStatus: submission.auditStatus };
    } catch (err) {
      if (err instanceof SubmissionValidationError) {
        throw new BadRequestException(err.getResponse());
      }
      throw err;
    }
  }

  /**
   * Scan to Text — the OCR + keyboard auto-suggestion feature, playable
   * inside the Mini App. One endpoint: the photo goes through the same
   * server OCR pipeline the mobile app uses (Tesseract, with the Gemini
   * rescue pass for handwriting), then the keyboard-style corrector repairs
   * garbled words. Every applied fix is returned with its evidence so the
   * client can show exactly what changed — nothing here is silent.
   *
   * Open to every Mini App user (not gated on verification): it's a
   * try-it feature, reads nothing personal, and writes nothing anywhere.
   */
  @Post("miniapp/scan")
  @UseGuards(TelegramMiniAppGuard)
  @UseInterceptors(FileInterceptor("image", { limits: { fileSize: 10.5 * 1024 * 1024 } }))
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async miniAppScan(@Req() req: MiniAppRequest, @UploadedFile() file?: Express.Multer.File) {
    if (!file?.buffer) {
      throw new BadRequestException("Choose a photo with text to scan.");
    }
    if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype)) {
      throw new BadRequestException("That file type isn't supported — upload a photo (JPG, PNG or WebP).");
    }

    let ocr: { text: string; confidence: number; readable: boolean; engine: string };
    try {
      ocr = await this.tools.ocrBuffer(file.buffer, file.mimetype);
    } catch (err) {
      this.logger.warn(
        `miniapp scan OCR failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new BadRequestException(
        "The text engine couldn't read that image. Try a clearer, closer, better-lit shot.",
      );
    }

    const raw = (ocr.text ?? "").trim();
    if (!ocr.readable || raw.length < 4) {
      return { readable: false, engine: ocr.engine };
    }

    const report = correctOcrText(raw.slice(0, 12000));
    return {
      readable: true,
      engine: ocr.engine,
      confidence: ocr.confidence,
      /** The corrected text — what the student copies. */
      text: (report.corrected || raw).trim().slice(0, 5000),
      /** The untouched OCR output, for the "show original" toggle. */
      rawText: raw.slice(0, 5000),
      tokensTotal: report.tokensTotal,
      tokensCorrected: report.tokensCorrected,
      corrections: report.corrections.slice(0, 12),
    };
  }

  /** My submissions, for the Mini App status view. */
  @Get("miniapp/submissions")
  @UseGuards(TelegramMiniAppGuard)
  async miniAppSubmissions(@Req() req: MiniAppRequest) {
    const session = req[MINIAPP_SESSION_KEY]!;
    const participant = await this.campaign.getParticipant(session.telegramId);
    if (!participant) return { submissions: [], points: 0, approvedCount: 0 };
    const rows = await this.prisma.resourceSubmission.findMany({
      where: { participantId: participant.id },
      orderBy: { submittedAt: "desc" },
      take: 20,
      select: {
        id: true, fileName: true, courseCode: true, materialType: true,
        auditStatus: true, rewardStatus: true, submittedAt: true,
        aiRecommendation: true, riskLevel: true,
      },
    });
    return { submissions: rows, points: participant.points, approvedCount: participant.approvedCount };
  }

  /** Campaign leaderboard for the Mini App. */
  @Get("miniapp/leaderboard")
  @UseGuards(TelegramMiniAppGuard)
  async miniAppLeaderboard(@Req() req: MiniAppRequest) {
    const session = req[MINIAPP_SESSION_KEY]!;
    const items = await this.campaign.leaderboard(20);
    // The client highlights the caller's own row; telegramId never leaves
    // the server — only the derived "you" marker does.
    const me = items.find((r) => r.telegramId === session.telegramId);
    return {
      items: items.map(({ telegramId: _ignored, ...rest }) => rest),
      you: me ? { rank: me.rank, points: me.points, approvedCount: me.approvedCount } : null,
    };
  }

  // ── Admin: webhook management ────────────────────────────────────

  @Post("admin/webhook/set")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async adminSetWebhook(@Body("url") url: string) {
    if (url !== undefined) {
      if (typeof url !== "string" || !/^https:\/\/[^\s]+$/.test(url)) {
        throw new BadRequestException("url must be an https URL.");
      }
      this.config.overrideWebhookUrl(url);
    }
    return this.bot.setWebhook();
  }

  @Post("admin/webhook/delete")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async adminDeleteWebhook() {
    return this.bot.deleteWebhook();
  }

  @Get("admin/webhook")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async adminWebhookInfo() {
    const info = await this.bot.getWebhookInfo();
    return {
      ...info,
      botConfigured: this.config.isConfigured,
      communityId: this.config.communityId ? "set" : "unset",
      miniAppUrl: this.config.miniAppUrl,
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private gateCheck(telegramId: string): Promise<boolean> {
    return this.bot.canUploadCheck(Number(telegramId));
  }
}
