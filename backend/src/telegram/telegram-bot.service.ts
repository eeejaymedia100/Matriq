import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
import {
  ResourceAuditService,
  SubmissionValidationError,
} from "../resource-audit/resource-audit.service";
import { TelegramApi, TgMessage, TgUpdate, TgUser } from "./telegram.api";
import { TelegramConfig } from "./telegram.config";
import { TelegramGate } from "./telegram-gate";
/**
 * The Matriq Telegram bot.
 *
 * Flows:
 *   /start            → welcome + Open Mini App button
 *   /link             → email → 6-digit code → account link (uploads require it)
 *   /upload           → membership gate → conversation: file → course → type →
 *                       session → rights → ResourceAuditService.submit
 *   /status [code]    → list my submissions / show one in detail
 *   /community        → join link
 *   Admin callbacks   → approve / reject / needs-info on pending submissions
 *
 * Conversation state lives in Redis (TTL 15 min) so any cluster worker can
 * continue any user's conversation. All Telegram-facing text is plain HTML.
 */
@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private readonly redis?: Redis;
  private polling = false;
  private pollOffset = 0;
  private pollTimer: NodeJS.Timeout | null = null;
  private disposed = false;

  private static readonly CONV_TTL_SEC = 900;
  private static readonly LINK_TTL_SEC = 900;
  private static readonly UPLOAD_RATE_KEY = (tg: number) => `tg:uploads:${tg}`;
  private static readonly UPLOAD_RATE_MAX = 5;
  private static readonly UPLOAD_RATE_WINDOW_SEC = 3600;

  constructor(
    private readonly config: TelegramConfig,
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly audit: ResourceAuditService,
    private readonly gate: TelegramGate,
    private readonly api: TelegramApi,
    configService: ConfigService,
  ) {
    const redisUrl = configService.get<string>("REDIS_URL");
    if (redisUrl && redisUrl.length > 0) {
      this.redis = new Redis(redisUrl, { maxRetriesPerRequest: 2, lazyConnect: false });
      this.redis.on("error", (err) => this.logger.warn(`bot redis error: ${err.message}`));
    }
  }

  async onModuleInit(): Promise<void> {
    if (!this.config.isConfigured) {
      this.logger.log("TELEGRAM_BOT_TOKEN not set — Telegram interface disabled.");
      return;
    }
    try {
      const me = await this.api.getMe();
      this.logger.log(`Telegram bot online as @${me.username}`);
    } catch (err) {
      this.logger.error(`Telegram bot failed to start: ${String(err)}`);
      return;
    }
    if (this.config.webhookUrl) {
      const result = await this.setWebhook();
      this.logger.log(`webhook setup: ${result.message}`);
    } else {
      // Development fallback: long-polling under a Redis leader lock so only
      // one cluster worker polls. Production sets TELEGRAM_WEBHOOK_URL.
      this.startPollingIfLeader();
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.disposed = true;
    this.stopPolling();
    if (this.redis) await this.redis.quit().catch(() => undefined);
  }

  // ── Webhook entrypoint (called by the controller) ────────────────

  async handleWebhookUpdate(update: TgUpdate): Promise<void> {
    // Process asynchronously — Telegram wants a fast 200 to stop retrying.
    await this.handleUpdate(update);
  }

  // ── Webhook management (admin API) ─────────────────────────────────

  async setWebhook(): Promise<{ ok: boolean; message: string }> {
    if (!this.api || !this.config.webhookUrl || !this.config.webhookSecret) {
      return { ok: false, message: "webhook URL/secret not configured" };
    }
    const url = `${this.config.webhookUrl.replace(/\/$/, "")}/v1/telegram/webhook/${this.config.webhookSecret}`;
    try {
      await this.api.setWebhook(url, this.config.webhookSecret);
      this.stopPolling();
      return { ok: true, message: `webhook set to ${url}` };
    } catch (err) {
      return { ok: false, message: String(err) };
    }
  }

  async deleteWebhook(): Promise<{ ok: boolean; message: string }> {
    if (!this.api) return { ok: false, message: "bot not configured" };
    try {
      await this.api.deleteWebhook();
      return { ok: true, message: "webhook removed" };
    } catch (err) {
      return { ok: false, message: String(err) };
    }
  }

  async getWebhookInfo(): Promise<Record<string, unknown>> {
    if (!this.api) return { configured: false };
    const info = await this.api.safe<Record<string, unknown>>("getWebhookInfo", {});
    return info ?? { configured: this.config.isConfigured };
  }

  /** Membership check exposed for the Mini App controller. */
  canUploadCheck(telegramId: number): Promise<boolean> {
    return this.gate.canUpload(telegramId);
  }

  // ── Polling fallback (single worker via Redis lock) ──────────────

  private startPollingIfLeader(): void {
    if (!this.redis) {
      this.startPolling();
      return;
    }
    const key = "tg:poll-leader";
    const token = `${process.pid}-${Date.now()}`;
    const redis = this.redis;
    const acquire = async (): Promise<void> => {
      try {
        const got = await redis.set(key, token, "EX", 30, "NX");
        if (got === "OK") {
          this.startPolling();
          return;
        }
        if (!this.disposed) this.pollTimer = setTimeout(acquire, 15_000);
      } catch {
        if (!this.disposed) this.pollTimer = setTimeout(acquire, 15_000);
      }
    };
    void acquire();
  }

  private startPolling(): void {
    if (this.polling) return;
    this.polling = true;
    this.logger.log("Telegram long-polling active (single leader worker).");
    void this.pollLoop();
  }

  private stopPolling(): void {
    this.polling = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async pollLoop(): Promise<void> {
    while (this.polling && !this.disposed && this.api) {
      try {
        const updates = await this.api.getUpdates(this.pollOffset, 25);
        for (const update of updates) {
          this.pollOffset = update.update_id + 1;
          await this.handleUpdate(update).catch((err) =>
            this.logger.error(`update handling failed: ${String(err)}`),
          );
        }
      } catch {
        if (this.polling && !this.disposed) {
          await new Promise((r) => setTimeout(r, 3_000));
        }
      }
    }
  }

  // ── Update router ────────────────────────────────────────────────

  private async handleUpdate(update: TgUpdate): Promise<void> {
    if (!this.config.isConfigured) return;

    if (update.callback_query) {
      await this.onCallback(update.callback_query.id, update.callback_query.from.id, update.callback_query.data ?? "");
      return;
    }
    const message = update.message ?? update.edited_message;
    if (!message?.from || message.from.is_bot) return;
    const chatId = message.chat.id;
    const telegramId = message.from.id;
    const text = (message.text ?? "").trim();

    // Photos/documents always belong to the upload conversation.
    if (message.document) {
      await this.handleDocument(message);
      return;
    }
    if (message.photo && message.photo.length > 0) {
      await this.handlePhoto(message);
      return;
    }

    // Conversation continuation takes precedence over non-command text.
    const conv = await this.getConversation(telegramId);
    if (conv && !text.startsWith("/")) {
      await this.continueConversation(telegramId, chatId, text, conv);
      return;
    }

    if (text.startsWith("/start")) {
      await this.onStart(chatId, message.from);
    } else if (text.startsWith("/link")) {
      await this.beginLink(telegramId, chatId);
    } else if (text.startsWith("/upload")) {
      await this.beginUpload(telegramId, chatId);
    } else if (text.startsWith("/status")) {
      await this.onStatus(telegramId, chatId, text.replace("/status", "").trim());
    } else if (text.startsWith("/community")) {
      await this.api.sendMessage(chatId, `The Matriq community lives here: ${this.config.communityUrl}`);
    } else if (text.startsWith("/cancel")) {
      await this.clearConversation(telegramId);
      await this.api.sendMessage(chatId, "Cancelled. Nothing was saved.");
    } else if (text.startsWith("/help") || text === "") {
      await this.sendHelp(chatId);
    }
  }

  private async sendHelp(chatId: number): Promise<void> {
    await this.api!.sendMessage(
      chatId,
      [
        "<b>Matriq — commands</b>",
        "",
        "/upload — contribute a past question or note",
        "/status — your submissions and their audit state",
        "/link — connect your Matriq account",
        "/community — the Matriq Telegram community",
        "/cancel — leave the current flow",
        "",
        "Everything you submit goes through human review before it enters the library.",
      ].join("\n"),
    );
  }

  private async onStart(chatId: number, from: TgUser): Promise<void> {
    const linked = await this.prisma.user.findFirst({ where: { telegramId: String(from.id) } });
    const name = from.first_name ?? "there";
    const lines = [
      `Welcome, <b>${name}</b>.`,
      "",
      "Matriq is the archive your seniors built — past questions, notes and summaries, audited before they enter the library.",
      "",
      linked
        ? "Your Matriq account is linked. Upload with /upload and track with /status."
        : "To upload, first link your Matriq account with /link — it takes a minute.",
    ];
    await this.api!.sendMessage(chatId, lines.join("\n"), {
      inline_keyboard: [
        [{ text: "Open Matriq", web_app: { url: this.config.miniAppUrl } }],
        [
          { text: "Contribute a material", callback_data: "upload" },
          { text: "My submissions", callback_data: "status" },
        ],
      ],
    });
  }

  // ── Account linking ──────────────────────────────────────────────

  private async beginLink(telegramId: number, chatId: number): Promise<void> {
    const existing = await this.prisma.user.findFirst({ where: { telegramId: String(telegramId) } });
    if (existing) {
      await this.api!.sendMessage(chatId, `Already linked to <b>${existing.email}</b>. Upload away with /upload.`);
      return;
    }
    await this.setConversation(telegramId, { flow: "link" });
    await this.api!.sendMessage(
      chatId,
      "Enter the <b>email</b> you registered with on Matriq. I'll send a 6-digit code there to confirm it's you.",
    );
  }

  private async linkCollectEmail(telegramId: number, chatId: number, email: string): Promise<void> {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await this.api!.sendMessage(chatId, "That doesn't look like an email address. Try again, or /cancel.");
      return;
    }
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      await this.api!.sendMessage(chatId, "No Matriq account has that email yet. Register in the app first, then /link here.");
      return;
    }
    if (user.telegramId && user.telegramId !== String(telegramId)) {
      await this.api!.sendMessage(chatId, "That account is already linked to a different Telegram. Contact support if this is a mistake.");
      await this.clearConversation(telegramId);
      return;
    }
    if (!user.emailVerified) {
      await this.api!.sendMessage(chatId, "That email isn't verified on Matriq yet. Verify it in the app first, then come back.");
      return;
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    await this.redisSet(`tg:link:${telegramId}`, JSON.stringify({ userId: user.id, email, code }), TelegramBotService.LINK_TTL_SEC);
    await this.setConversation(telegramId, { flow: "link_code" });
    const result = await this.email.send({
      to: email,
      subject: "Your Matriq Telegram link code",
      html: `<p>Your code is <b>${code}</b>. It expires in 15 minutes.</p><p>If you didn't request this, ignore this email.</p>`,
      text: `Your Matriq Telegram link code is ${code}. It expires in 15 minutes.`,
    });
    if (!result.success) {
      await this.clearConversation(telegramId);
      await this.api!.sendMessage(chatId, "The email couldn't be sent right now. Try again in a moment.");
      return;
    }
    await this.api!.sendMessage(chatId, `Code sent to <b>${email}</b>. Type it here (6 digits).`);
  }

  private async linkCollectCode(telegramId: number, chatId: number, code: string): Promise<void> {
    const raw = await this.redisGet(`tg:link:${telegramId}`);
    if (!raw) {
      await this.clearConversation(telegramId);
      await this.api!.sendMessage(chatId, "That code window expired. Start again with /link.");
      return;
    }
    const state = JSON.parse(raw) as { userId: string; email: string; code: string };
    if (state.code !== code.trim()) {
      await this.api!.sendMessage(chatId, "Wrong code. Check the email and try again, or /cancel.");
      return;
    }
    // Claim the telegramId atomically; a lost race means another account took it.
    const claim = await this.prisma.user.updateMany({
      where: { id: state.userId, telegramId: null },
      data: { telegramId: String(telegramId), telegramLinkedAt: new Date() },
    });
    if (claim.count === 0) {
      const taken = await this.prisma.user.findFirst({ where: { telegramId: String(telegramId) } });
      await this.api!.sendMessage(
        chatId,
        taken ? `This Telegram is already linked to <b>${taken.email}</b>.` : "Couldn't complete the link. Try /link again.",
      );
      await this.clearConversation(telegramId);
      return;
    }
    await this.redisDel(`tg:link:${telegramId}`);
    await this.clearConversation(telegramId);
    await this.api!.sendMessage(chatId, `Linked to <b>${state.email}</b>. You can now /upload.`);
  }

  // ── Upload flow ──────────────────────────────────────────────────

  private async beginUpload(telegramId: number, chatId: number): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { telegramId: String(telegramId) } });
    if (!user) {
      await this.api!.sendMessage(chatId, "Uploads need a linked Matriq account. /link takes a minute — it confirms you're a real student.", {
        inline_keyboard: [[{ text: "Link my account", callback_data: "link" }]],
      });
      return;
    }
    const member = await this.gate.canUpload(telegramId);
    if (!member) {
      await this.api!.sendMessage(
        chatId,
        "One step first: <b>join the Matriq community</b>, then press the button below. The library is built by students who show up.",
        {
          inline_keyboard: [
            [{ text: "Join the community", url: this.config.communityUrl }],
            [{ text: "I've joined — check again", callback_data: "upload" }],
          ],
        },
      );
      return;
    }
    const overLimit = await this.uploadRateLimited(telegramId);
    if (overLimit) {
      await this.api!.sendMessage(chatId, "You've hit the hourly upload cap (5). The auditors need breathing room — try again later.");
      return;
    }
    await this.setConversation(telegramId, { flow: "upload", step: "file", userId: user.id });
    await this.api!.sendMessage(
      chatId,
      [
        "<b>Contribute a material</b>",
        "",
        "Send the file now — PDF, image (JPG/PNG), DOC or DOCX, up to 20 MB.",
        "Best results: a clean scan or export. Then I'll ask for course, type and session.",
        "",
        "/cancel to stop.",
      ].join("\n"),
    );
  }

  private async uploadRateLimited(telegramId: number): Promise<boolean> {
    if (!this.redis) return false;
    const key = TelegramBotService.UPLOAD_RATE_KEY(telegramId);
    try {
      const count = await this.redis.incr(key);
      if (count === 1) await this.redis.expire(key, TelegramBotService.UPLOAD_RATE_WINDOW_SEC);
      return count > TelegramBotService.UPLOAD_RATE_MAX;
    } catch {
      return false;
    }
  }

  // ── Documents & photos (upload conversation) ─────────────────────

  private async handleDocument(message: TgMessage): Promise<void> {
    if (!this.config.isConfigured) return;
    const telegramId = message.from!.id;
    const chatId = message.chat.id;
    const conv = await this.getConversation(telegramId);
    if (!conv || conv.flow !== "upload") {
      await this.api.sendMessage(chatId, "Send /upload first — I'll take the file from there.");
      return;
    }
    const doc = message.document!;
    if (doc.file_size && doc.file_size > 20 * 1024 * 1024) {
      await this.api.sendMessage(chatId, "That file is over Telegram's 20 MB limit for bots. Compress or split it, then resend.");
      return;
    }
    await this.setConversation(telegramId, {
      ...conv,
      step: "course",
      pendingFile: { fileId: doc.file_id, fileName: doc.file_name ?? "upload" },
    });
    await this.api.sendMessage(chatId, `Got <b>${doc.file_name ?? "your file"}</b>. What course is it for? e.g. <code>CHM 101</code>`);
  }

  private async handlePhoto(message: TgMessage): Promise<void> {
    if (!this.config.isConfigured) return;
    const telegramId = message.from!.id;
    const chatId = message.chat.id;
    const conv = await this.getConversation(telegramId);
    if (!conv || conv.flow !== "upload") {
      await this.api.sendMessage(chatId, "Send /upload first — I'll take the photo from there.");
      return;
    }
    const photos = message.photo ?? [];
    const best = photos.length > 0 ? photos[photos.length - 1] : null;
    if (!best || (best.file_size ?? 0) > 20 * 1024 * 1024) {
      await this.api.sendMessage(chatId, "That photo is too large. Send it as a file (attach → File) instead.");
      return;
    }
    await this.setConversation(telegramId, {
      ...conv,
      step: "course",
      pendingFile: { fileId: best.file_id, fileName: `scan-${Date.now()}.jpg` },
    });
    await this.api.sendMessage(chatId, "Got the scan. What course is it for? e.g. <code>CHM 101</code>");
  }

  // ── Conversations (Redis-backed state) ───────────────────────────

  private convKey(telegramId: number): string {
    return `tg:conv:${telegramId}`;
  }

  private async setConversation(telegramId: number, state: Record<string, unknown>): Promise<void> {
    await this.redisSet(this.convKey(telegramId), JSON.stringify(state), TelegramBotService.CONV_TTL_SEC);
  }

  private async getConversation(telegramId: number): Promise<Record<string, unknown> | null> {
    const raw = await this.redisGet(this.convKey(telegramId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private async clearConversation(telegramId: number): Promise<void> {
    await this.redisDel(this.convKey(telegramId));
  }

  private async continueConversation(telegramId: number, chatId: number, text: string, conv: Record<string, unknown>): Promise<void> {
    const flow = conv.flow as string;
    if (flow === "link") {
      await this.linkCollectEmail(telegramId, chatId, text.trim().toLowerCase());
      return;
    }
    if (flow === "link_code") {
      await this.linkCollectCode(telegramId, chatId, text);
      return;
    }
    if (flow === "upload") {
      await this.uploadCollectText(telegramId, chatId, text, conv);
      return;
    }
    if (flow === "admin_reason") {
      await this.adminReasonCollect(telegramId, text, conv);
      return;
    }
    await this.clearConversation(telegramId);
  }

  private async uploadCollectText(telegramId: number, chatId: number, text: string, conv: Record<string, unknown>): Promise<void> {
    const step = conv.step as string;
    if (step === "course") {
      await this.setConversation(telegramId, { ...conv, step: "type", courseCode: text.trim().toUpperCase() });
      await this.api!.sendMessage(
        chatId,
        "What is it? Send a number:\n1 — Past question\n2 — Lecture note\n3 — Handout\n4 — Slide deck\n5 — Textbook summary",
      );
      return;
    }
    if (step === "type") {
      const map = ["past_question", "lecture_note", "handout", "slide_deck", "textbook_summary"];
      const idx = Number(text.trim()) - 1;
      if (!Number.isInteger(idx) || idx < 0 || idx >= map.length) {
        await this.api!.sendMessage(chatId, "Send a number from 1 to 5.");
        return;
      }
      await this.setConversation(telegramId, { ...conv, step: "session", materialType: map[idx] });
      await this.api!.sendMessage(chatId, "Which academic session? e.g. <code>2024/2025</code> — or send <code>skip</code>.");
      return;
    }
    if (step === "session") {
      const session = /^skip$/i.test(text.trim()) ? null : text.trim();
      await this.setConversation(telegramId, { ...conv, step: "rights", academicSession: session });
      await this.api!.sendMessage(
        chatId,
        [
          "<b>Rights declaration</b>",
          "",
          "You confirm you have the right to share this material and that it may be published in the Matriq library with credit to contributors.",
          "",
          "Reply <b>yes</b> to submit for audit, or /cancel.",
        ].join("\n"),
      );
      return;
    }
    if (step === "rights") {
      if (!/^y(es)?$/i.test(text.trim())) {
        await this.clearConversation(telegramId);
        await this.api!.sendMessage(chatId, "Cancelled — nothing was submitted.");
        return;
      }
      const pending = conv.pendingFile as { fileId: string; fileName: string } | undefined;
      if (!pending) {
        await this.clearConversation(telegramId);
        await this.api!.sendMessage(chatId, "The file went missing from the conversation. /upload to start over.");
        return;
      }
      await this.finalizeSubmission(telegramId, chatId, conv, pending);
      return;
    }
    await this.clearConversation(telegramId);
  }

  private async finalizeSubmission(
    telegramId: number,
    chatId: number,
    conv: Record<string, unknown>,
    pending: { fileId: string; fileName: string },
  ): Promise<void> {
    if (!this.config.isConfigured) return;
    const userId = conv.userId as string;
    await this.api.sendMessage(chatId, "Submitting for audit…");
    const buffer = await this.api.downloadFileById(pending.fileId);
    if (!buffer) {
      await this.clearConversation(telegramId);
      await this.api.sendMessage(chatId, "I couldn't download the file from Telegram. /upload to try again.");
      return;
    }
    try {
      const submission = await this.audit.submit({
        studentId: userId,
        fileName: pending.fileName,
        buffer,
        courseCode: conv.courseCode as string,
        materialType: conv.materialType as string,
        level: null,
        academicSession: (conv.academicSession as string | null) ?? null,
        rightsDeclared: true,
        source: "telegram",
      });
      await this.clearConversation(telegramId);
      await this.api.sendMessage(
        chatId,
        [
          "<b>Submitted.</b>",
          "",
          `Reference: <code>${submission.id}</code>`,
          "Track anytime with /status — you'll see it move from validation through AI audit to human review.",
        ].join("\n"),
      );
      await this.notifyAdminsNewSubmission(submission.id, pending.fileName, conv.courseCode as string);
    } catch (err) {
      if (err instanceof SubmissionValidationError) {
        const reason = (err.getResponse() as { reason?: string } | undefined)?.reason;
        await this.api.sendMessage(chatId, `That submission can't be accepted: ${reason ?? "invalid details"}. /upload to try again.`);
      } else {
        this.logger.error(`telegram submit failed: ${String(err)}`);
        await this.api.sendMessage(chatId, "Something failed on our side. The submission was not saved — /upload to try again.");
      }
      await this.clearConversation(telegramId);
    }
  }

  // ── Status ───────────────────────────────────────────────────────

  private async onStatus(telegramId: number, chatId: number, ref: string): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { telegramId: String(telegramId) } });
    if (!user) {
      await this.api!.sendMessage(chatId, "You haven't linked your Matriq account yet — /link first.");
      return;
    }
    if (ref) {
      const one = await this.prisma.resourceSubmission.findFirst({
        where: { id: ref, studentId: user.id },
      });
      if (!one) {
        await this.api!.sendMessage(chatId, "No submission of yours has that reference.");
        return;
      }
      await this.api!.sendMessage(
        chatId,
        this.formatSubmission(one.id, one.fileName, one.courseCode, one.auditStatus, one.submittedAt, one.failureReason),
      );
      return;
    }
    const rows = await this.prisma.resourceSubmission.findMany({
      where: { studentId: user.id },
      orderBy: { submittedAt: "desc" },
      take: 10,
    });
    if (rows.length === 0) {
      await this.api!.sendMessage(chatId, "No submissions yet. /upload when you're ready — the library grows because students like you feed it.");
      return;
    }
    const lines = rows.map((r, i) => `${i + 1}. <code>${r.id.slice(0, 8)}</code> — ${r.fileName} — ${this.statusLabel(r.auditStatus)}`);
    await this.api!.sendMessage(chatId, ["<b>Your last 10 submissions</b>", "", ...lines, "", "Send /status <code>&lt;reference&gt;</code> for detail."].join("\n"));
  }

  private statusLabel(status: string): string {
    const labels: Record<string, string> = {
      received: "Received",
      validating: "Validating",
      duplicate_check: "Checking for duplicates",
      extracting: "Extracting text",
      ocr_processing: "Running OCR",
      auditing: "AI audit",
      pending_human_review: "Awaiting human review",
      approved: "Approved",
      rejected: "Rejected",
      needs_information: "Needs more info",
      reward_pending: "Reward pending",
      reward_eligible: "Reward eligible",
      reward_ineligible: "Reward ineligible",
      processing_library: "Publishing to library",
      published: "Live in the library",
      failed: "Failed",
    };
    return labels[status] ?? status;
  }

  private formatSubmission(id: string, fileName: string, courseCode: string, status: string, submittedAt: Date, failureReason: string | null): string {
    const lines = [
      `<b>${fileName}</b>`,
      `Course: ${courseCode}`,
      `Reference: <code>${id}</code>`,
      `Submitted: ${submittedAt.toISOString().slice(0, 16).replace("T", " ")} UTC`,
      `State: <b>${this.statusLabel(status)}</b>`,
    ];
    if (failureReason) lines.push(`Note: ${failureReason}`);
    return lines.join("\n");
  }

  // ── Admin review notifications + callbacks ───────────────────────

  private async notifyAdminsNewSubmission(submissionId: string, fileName: string, courseCode: string): Promise<void> {
    if (!this.config.isConfigured) return;
    for (const adminId of this.config.adminIds) {
      await this.api.sendMessage(
        Number(adminId),
        [
          "<b>New submission for review</b>",
          "",
          `File: ${fileName}`,
          `Course: ${courseCode}`,
          `Reference: <code>${submissionId}</code>`,
        ].join("\n"),
        {
          inline_keyboard: [
            [
              { text: "Approve", callback_data: `ra:approve:${submissionId}` },
              { text: "Reject", callback_data: `ra:reject:${submissionId}` },
            ],
            [{ text: "Needs info", callback_data: `ra:info:${submissionId}` }],
          ],
        },
      );
    }
  }

  private async onCallback(callbackId: string, fromId: number, data: string): Promise<void> {
    if (!this.config.isConfigured) return;
    if (data === "upload" || data === "status" || data === "link") {
      await this.api.answerCallbackQuery(callbackId);
      if (data === "upload") await this.beginUpload(fromId, fromId);
      if (data === "status") await this.onStatus(fromId, fromId, "");
      if (data === "link") await this.beginLink(fromId, fromId);
      return;
    }
    const reviewMatch = /^ra:(approve|reject|info):([0-9a-f-]+)$/i.exec(data);
    if (reviewMatch) {
      const [, action, submissionId] = reviewMatch;
      if (!this.config.isTelegramAdmin(String(fromId))) {
        await this.api.answerCallbackQuery(callbackId, "Not allowed.");
        return;
      }
      if (action === "approve") {
        try {
          await this.audit.decide(submissionId, `telegram:${fromId}`, "approved");
          await this.api.answerCallbackQuery(callbackId, "Approved.");
          await this.api.sendMessage(fromId, `Approved <code>${submissionId.slice(0, 8)}</code>. It flows to reward + library automatically.`);
        } catch (err) {
          await this.api.answerCallbackQuery(callbackId, "Failed — see chat.");
          await this.api.sendMessage(fromId, `Couldn't approve: ${String(err instanceof Error ? err.message : err)}`);
        }
        return;
      }
      // Reject / needs-info require a reason — collect it in conversation.
      await this.api.answerCallbackQuery(callbackId);
      await this.setConversation(fromId, { flow: "admin_reason", action, submissionId });
      await this.api.sendMessage(fromId, `Send the reason for <b>${action === "reject" ? "rejection" : "information needed"}</b> on <code>${submissionId.slice(0, 8)}</code>.`);
      return;
    }
    await this.api.answerCallbackQuery(callbackId);
  }

  private async adminReasonCollect(telegramId: number, text: string, conv: Record<string, unknown>): Promise<void> {
    if (!this.config.isConfigured) return;
    const action = conv.action as "reject" | "info";
    const submissionId = conv.submissionId as string;
    await this.clearConversation(telegramId);
    try {
      await this.audit.decide(
        submissionId,
        `telegram:${telegramId}`,
        action === "reject" ? "rejected" : "needs_information",
        text.trim(),
      );
      await this.api.sendMessage(telegramId, `Recorded: <b>${action === "reject" ? "rejected" : "needs info"}</b> on <code>${submissionId.slice(0, 8)}</code>.`);
    } catch (err) {
      await this.api.sendMessage(telegramId, `Couldn't record the decision: ${String(err instanceof Error ? err.message : err)}`);
    }
  }

  // ── Redis helpers (no-op without REDIS_URL) ──────────────────────

  private async redisSet(key: string, value: string, ttlSec: number): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(key, value, "EX", ttlSec);
    } catch {
      // Degrade silently — conversation reads then fail closed via null.
    }
  }

  private async redisGet(key: string): Promise<string | null> {
    if (!this.redis) return null;
    try {
      return await this.redis.get(key);
    } catch {
      return null;
    }
  }

  private async redisDel(key: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(key);
    } catch {
      // Non-fatal.
    }
  }
}
