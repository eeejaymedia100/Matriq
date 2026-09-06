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
import { AdminGuard } from "../admin/admin.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import {
  ResourceAuditService,
  SubmissionValidationError,
} from "../resource-audit/resource-audit.service";
import { TelegramBotService } from "./telegram-bot.service";
import { TelegramConfig } from "./telegram.config";
import { TgUpdate } from "./telegram.api";
import { TelegramMiniAppAuth, MiniAppSession } from "./telegram-miniapp-auth";
import { TelegramMiniAppGuard, MINIAPP_SESSION_KEY } from "./telegram-miniapp.guard";

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
      communityGateEnabled: Boolean(this.config.communityId),
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
    return {
      telegramId: session.telegramId,
      username: session.telegramUsername,
      linkedAccount: user,
      communityMember: member,
      canUpload: Boolean(user) && member,
      communityUrl: this.config.communityUrl,
      botUsername: this.config.botUsername,
    };
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
    @Body() body: { courseCode?: string; materialType?: string; academicSession?: string; rightsDeclared?: string },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const session = req[MINIAPP_SESSION_KEY]!;
    const user = await this.prisma.user.findFirst({
      where: { telegramId: session.telegramId },
      select: { id: true, institutionId: true },
    });
    if (!user) {
      throw new ForbiddenException("Link your Matriq account first — send /link to the bot.");
    }
    const member = await this.gateCheck(session.telegramId);
    if (!member) {
      throw new ForbiddenException("Join the Matriq Telegram community first.");
    }
    if (!file) {
      throw new BadRequestException("A file is required.");
    }
    if (body.rightsDeclared !== "true") {
      throw new BadRequestException("You must confirm you have the right to share this material.");
    }
    try {
      const submission = await this.audit.submit({
        studentId: user.id,
        fileName: file.originalname,
        buffer: file.buffer,
        courseCode: body.courseCode ?? "",
        materialType: body.materialType ?? "",
        level: null,
        academicSession: body.academicSession ?? null,
        rightsDeclared: true,
        institutionId: user.institutionId,
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

  /** My submissions, for the Mini App status view. */
  @Get("miniapp/submissions")
  @UseGuards(TelegramMiniAppGuard)
  async miniAppSubmissions(@Req() req: MiniAppRequest) {
    const session = req[MINIAPP_SESSION_KEY]!;
    const user = await this.prisma.user.findFirst({ where: { telegramId: session.telegramId }, select: { id: true } });
    if (!user) return { submissions: [] };
    const rows = await this.prisma.resourceSubmission.findMany({
      where: { studentId: user.id },
      orderBy: { submittedAt: "desc" },
      take: 20,
      select: {
        id: true, fileName: true, courseCode: true, materialType: true,
        auditStatus: true, aiRecommendation: true, aiConfidence: true,
        humanDecision: true, rewardStatus: true, libraryStatus: true,
        submittedAt: true, failureReason: true,
      },
    });
    return { submissions: rows };
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
