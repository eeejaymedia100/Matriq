import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { PrismaService } from "../prisma/prisma.service";
import {
  ResourceAuditService,
  SubmissionValidationError,
} from "../resource-audit/resource-audit.service";
import { TelegramCampaignService } from "./telegram-campaign.service";
import { TelegramApi, TgMessage, TgUpdate, TgUser } from "./telegram.api";
import { TelegramConfig } from "./telegram.config";
import { TelegramGate } from "./telegram-gate";

/**
 * The Matriq Resource Hunt bot.
 *
 * Campaign participants are Telegram users — NOT Matriq accounts. There is
 * no account linking, no email, no OTP anywhere in this flow:
 *
 *   /start       → welcome → join-community button (first time)
 *   "Verify"     → bot checks real membership via getChatMember (admin perms)
 *   University   → button selection (core schools + "Other…")
 *   /upload      → button-driven wizard:
 *                  document/file → course code (text) → type (buttons) →
 *                  level (buttons) → session (buttons/skip) → description
 *                  (text) → rights (buttons) → submit
 *   /status      → simple "Under review" style states (no AI internals)
 *   /leaderboard → campaign rankings (points + approved counts)
 *
 * Every choice with a fixed answer set is a Telegram button, so arbitrary
 * text can never corrupt the flow. Text input is only requested for things
 * that are genuinely personal to the resource (course code, description).
 */
@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private readonly redis?: Redis;
  private polling = false;
  private pollOffset = 0;
  private pollTimer: NodeJS.Timeout | null = null;
  private disposed = false;

  private static readonly CONV_TTL_SEC = 1800;
  private static readonly UPLOAD_RATE_KEY = (tg: number) => `tg:uploads:${tg}`;
  private static readonly UPLOAD_RATE_MAX = 5;
  private static readonly UPLOAD_RATE_WINDOW_SEC = 3600;

  /** Common universities (buttons) — free text via "Other…" for the rest. */
  private static readonly UNIVERSITIES = [
    "University of Benin",
    "University of Lagos",
    "University of Ibadan",
    "Ahmadu Bello University",
    "University of Ilorin",
    "Obafemi Awolowo University",
    "University of Nigeria, Nsukka",
    "Covenant University",
  ];

  private static readonly MATERIAL_TYPES: Array<{ label: string; value: string }> = [
    { label: "Past question", value: "past_question" },
    { label: "Lecture note", value: "lecture_note" },
    { label: "Handout", value: "handout" },
    { label: "Slide deck", value: "slide_deck" },
    { label: "Textbook summary", value: "textbook_summary" },
  ];

  private static readonly LEVELS = ["100", "200", "300", "400", "500"];

  private static readonly SESSIONS = ["2023/2024", "2024/2025", "2025/2026"];

  constructor(
    private readonly config: TelegramConfig,
    private readonly prisma: PrismaService,
    private readonly campaign: TelegramCampaignService,
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
    // Let the audit engine message participants when their resource is
    // approved (runtime property — avoids a circular module dependency).
    this.audit.notifyParticipant = (participantId, courseCode, points) =>
      this.notifyParticipantApproval(participantId, courseCode, points);
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
      this.startPollingIfLeader();
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.disposed = true;
    this.stopPolling();
    if (this.redis) await this.redis.quit().catch(() => undefined);
  }

  // ── Webhook + management (controller surface) ────────────────────

  async handleWebhookUpdate(update: TgUpdate): Promise<void> {
    await this.handleUpdate(update);
  }

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

  // ── Polling fallback (single leader worker) ──────────────────────

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
      await this.onCallback(update.callback_query.id, update.callback_query.from, update.callback_query.data ?? "");
      return;
    }
    const message = update.message ?? update.edited_message;
    if (!message?.from || message.from.is_bot) return;
    const chatId = message.chat.id;
    const telegramId = message.from.id;
    const text = (message.text ?? "").trim();

    // Files/photos feed the upload conversation directly.
    if (message.document) {
      await this.handleDocument(message);
      return;
    }
    if (message.photo && message.photo.length > 0) {
      await this.handlePhoto(message);
      return;
    }

    if (text.startsWith("/")) {
      // Commands always win — they also escape any stuck wizard state.
      if (text.startsWith("/start")) await this.onStart(chatId, message.from);
      else if (text.startsWith("/upload")) await this.beginUpload(telegramId, chatId);
      else if (text.startsWith("/status")) await this.onStatus(telegramId, chatId);
      else if (text.startsWith("/leaderboard")) await this.onLeaderboard(chatId);
      else if (text.startsWith("/community")) await this.api.sendMessage(chatId, `The Matriq community lives here: ${this.config.communityUrl || "ask an admin for the invite link"}`);
      else if (text.startsWith("/cancel")) {
        await this.clearConversation(telegramId);
        await this.api.sendMessage(chatId, "Cancelled. Nothing was saved.");
      } else await this.sendHelp(chatId);
      return;
    }

    // Any other text continues the active conversation (only specific steps
    // accept free text; everything else uses buttons).
    const conv = await this.getConversation(telegramId);
    if (conv) {
      await this.continueConversation(telegramId, chatId, text, conv);
      return;
    }

    if (text === "") await this.sendHelp(chatId);
  }

  private async sendHelp(chatId: number): Promise<void> {
    await this.api!.sendMessage(
      chatId,
      [
        "<b>Matriq Resource Hunt</b>",
        "",
        "/upload — contribute a resource (+1 point when approved)",
        "/status — your submissions",
        "/leaderboard — campaign rankings",
        "/community — the Matriq Telegram community",
        "/cancel — leave the current flow",
        "",
        "Every resource is reviewed by a human before it earns points.",
      ].join("\n"),
    );
  }

  // ── Start + verification gate ────────────────────────────────────

  private async onStart(chatId: number, from: TgUser): Promise<void> {
    const participant = await this.campaign.ensureParticipant(from);
    await this.sendStateScreen(chatId, participant.verifiedAt != null);
  }

  /** Sends the screen that matches the participant's current state. */
  private async sendStateScreen(chatId: number, verified: boolean): Promise<void> {
    if (!verified) {
      await this.api!.sendMessage(
        chatId,
        [
          "<b>Welcome to the Matriq Resource Hunt.</b>",
          "",
          "The archive is built by students who show up. Join the community, then verify — verified members can submit resources and earn points.",
          "",
          "1. Join the community",
          "2. Come back and press <b>I've joined — Verify me</b>",
        ].join("\n"),
        {
          inline_keyboard: [
            [{ text: "Join the community", url: this.config.communityUrl || "https://t.me/" }],
            [{ text: "I've joined — Verify me", callback_data: "verify" }],
          ],
        },
      );
      return;
    }
    await this.api!.sendMessage(
      chatId,
      [
        "<b>You're verified.</b>",
        "",
        "Submit a resource with /upload — past questions, notes, handouts, slides or summaries. Approved resources earn points and climb the leaderboard.",
      ].join("\n"),
      {
        inline_keyboard: [
          [
            { text: "Upload a resource", callback_data: "upload" },
            { text: "Leaderboard", callback_data: "leaderboard" },
          ],
          [{ text: "My submissions", callback_data: "status" }],
        ],
      },
    );
  }

  private async onVerify(telegramId: number, chatId: number): Promise<void> {
    const member = await this.gate.canUpload(telegramId);
    if (!member) {
      await this.api!.sendMessage(
        chatId,
        [
          "You're not showing as a member yet.",
          "",
          "Join the community first, then press the button again. (If you just joined, give it a few seconds.)",
        ].join("\n"),
        {
          inline_keyboard: [
            [{ text: "Join the community", url: this.config.communityUrl || "https://t.me/" }],
            [{ text: "I've joined — Verify me", callback_data: "verify" }],
          ],
        },
      );
      return;
    }
    await this.campaign.markVerified(String(telegramId));
    await this.campaign.getParticipant(String(telegramId));
    // University selection — buttons first, "Other…" for free text.
    await this.setConversation(telegramId, { flow: "university" });
    await this.api!.sendMessage(
      chatId,
      "<b>Verified.</b> Last thing: which university are you from?",
      { inline_keyboard: this.universityKeyboard() },
    );
  }

  private universityKeyboard(): Array<Array<{ text: string; callback_data: string }>> {
    const rows = TelegramBotService.UNIVERSITIES.map((u) => [
      { text: u, callback_data: `uni:${u}` },
    ]);
    rows.push([{ text: "Other (type it)", callback_data: "uni:__other__" }]);
    return rows;
  }

  // ── Upload flow (button-driven wizard) ───────────────────────────

  private async beginUpload(telegramId: number, chatId: number): Promise<void> {
    const participant = await this.campaign.getParticipant(String(telegramId));
    if (!participant) {
      // Never saw /start — route through registration.
      await this.onStart(chatId, { id: telegramId });
      return;
    }
    if (!participant.verifiedAt) {
      // Not verified — route through the state screen instead of failing.
      await this.sendStateScreen(chatId, false);
      return;
    }
    const overLimit = await this.uploadRateLimited(telegramId);
    if (overLimit) {
      await this.api!.sendMessage(chatId, "You've hit the hourly upload cap (5). The auditors need breathing room — try again later.");
      return;
    }
    await this.setConversation(telegramId, { flow: "upload", step: "file" });
    await this.api!.sendMessage(
      chatId,
      [
        "<b>Contribute a resource</b>",
        "",
        "Send the file now — PDF, image (JPG/PNG), DOC or DOCX, up to 20 MB.",
        "Best results: a clean scan or export.",
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

  // ── Documents & photos ───────────────────────────────────────────

  private async handleDocument(message: TgMessage): Promise<void> {
    if (!this.config.isConfigured) return;
    const telegramId = message.from!.id;
    const chatId = message.chat.id;
    const conv = await this.getConversation(telegramId);
    if (!conv || conv.flow !== "upload" || conv.step !== "file") {
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
    await this.api.sendMessage(
      chatId,
      `Got <b>${doc.file_name ?? "your file"}</b>. What course is it for? e.g. <code>CHM 101</code>`,
    );
  }

  private async handlePhoto(message: TgMessage): Promise<void> {
    if (!this.config.isConfigured) return;
    const telegramId = message.from!.id;
    const chatId = message.chat.id;
    const conv = await this.getConversation(telegramId);
    if (!conv || conv.flow !== "upload" || conv.step !== "file") {
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

  // ── Conversation state (Redis) ───────────────────────────────────

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

  private async continueConversation(
    telegramId: number,
    chatId: number,
    text: string,
    conv: Record<string, unknown>,
  ): Promise<void> {
    const flow = conv.flow as string;

    if (flow === "university") {
      // Only reachable via the "Other…" button.
      const university = text.trim().slice(0, 120);
      await this.finishUniversity(telegramId, chatId, university);
      return;
    }

    if (flow === "admin_reason") {
      await this.adminReasonCollect(telegramId, text, conv);
      return;
    }
    if (flow !== "upload") {
      await this.clearConversation(telegramId);
      return;
    }

    const step = conv.step as string;
    if (step === "course") {
      // Course code: validated server-side too; keep the input lenient here.
      const course = text.trim().toUpperCase().slice(0, 20);
      if (course.length < 5) {
        await this.api!.sendMessage(chatId, "That doesn't look like a course code — e.g. <code>CHM 101</code>. Try again, or /cancel.");
        return;
      }
      await this.setConversation(telegramId, { ...conv, step: "type", courseCode: course });
      await this.api!.sendMessage(chatId, "What kind of resource is it?", {
        inline_keyboard: this.choiceKeyboard(
          TelegramBotService.MATERIAL_TYPES.map((t) => ({ label: t.label, data: `type:${t.value}` })),
          2,
        ),
      });
      return;
    }
    if (step === "description") {
      const description = text.trim().slice(0, 500);
      if (description.length < 10) {
        await this.api!.sendMessage(chatId, "Tell me a little more — at least a sentence about what the document contains and why it's useful. Or /cancel.");
        return;
      }
      await this.setConversation(telegramId, { ...conv, step: "rights", description });
      await this.api!.sendMessage(
        chatId,
        [
          "<b>Rights declaration</b>",
          "",
          "You confirm you have the right to share this material and that it may be published in the Matriq library with credit to contributors.",
        ].join("\n"),
        {
          inline_keyboard: [
            [
              { text: "I confirm — submit", callback_data: "rights:yes" },
              { text: "Cancel", callback_data: "rights:no" },
            ],
          ],
        },
      );
      return;
    }
    // Any unexpected text at a button-step: nudge back to buttons.
    await this.api!.sendMessage(chatId, "Please use the buttons above for this step, or /cancel.");
  }

  private async finishUniversity(telegramId: number, chatId: number, university: string): Promise<void> {
    await this.campaign.setUniversity(String(telegramId), university);
    await this.clearConversation(telegramId);
    await this.api!.sendMessage(
      chatId,
      [
        `<b>${university}</b> noted.`,
        "",
        "You're all set. Submit a resource with /upload — approved resources earn points and move you up the leaderboard.",
      ].join("\n"),
      {
        inline_keyboard: [
          [{ text: "Upload a resource", callback_data: "upload" }],
          [{ text: "Leaderboard", callback_data: "leaderboard" }],
        ],
      },
    );
  }

  // ── Status + leaderboard ─────────────────────────────────────────

  private async onStatus(telegramId: number, chatId: number): Promise<void> {
    const participant = await this.campaign.getParticipant(String(telegramId));
    if (!participant) {
      await this.api!.sendMessage(chatId, "Nothing yet — /upload to make your first contribution.");
      return;
    }
    const rows = await this.prisma.resourceSubmission.findMany({
      where: { participantId: participant.id },
      orderBy: { submittedAt: "desc" },
      take: 10,
      select: { id: true, fileName: true, courseCode: true, auditStatus: true, rewardStatus: true, submittedAt: true },
    });
    if (rows.length === 0) {
      await this.api!.sendMessage(chatId, "No submissions yet. /upload when you're ready — the library grows because students like you feed it.");
      return;
    }
    const lines = rows.map((r, i) => `${i + 1}. <code>${r.id.slice(0, 8)}</code> — ${r.courseCode} — ${this.statusLabel(r.auditStatus, r.rewardStatus)}`);
    await this.api!.sendMessage(
      chatId,
      [`<b>Your submissions</b>`, ``, ...lines, ``, `Points so far: <b>${participant.points}</b> · approved: ${participant.approvedCount}`].join("\n"),
    );
  }

  /** Participant-safe labels — internal pipeline/AI states stay hidden. */
  private statusLabel(auditStatus: string, rewardStatus: string): string {
    if (auditStatus === "published" || rewardStatus === "eligible") return "✅ Approved";
    if (auditStatus === "rejected") return "❌ Rejected";
    if (auditStatus === "needs_information") return "❓ More info needed";
    if (auditStatus === "failed") return "⚠️ Couldn't process — try again";
    return "⏳ Under review";
  }

  private async onLeaderboard(chatId: number): Promise<void> {
    const rows = await this.campaign.leaderboard(10);
    if (rows.length === 0) {
      await this.api!.sendMessage(chatId, "The leaderboard is waiting for its first entry. /upload to claim the top spot.");
      return;
    }
    const medals = ["🥇", "🥈", "🥉"];
    const lines = rows.map((r, i) => {
      const icon = medals[i] ?? `${r.rank}.`;
      const name = r.username ? `@${r.username}` : r.name;
      return `${icon} ${name} — <b>${r.points}</b> pts (${r.approvedCount} approved)`;
    });
    await this.api!.sendMessage(chatId, ["<b>Resource Hunt — Leaderboard</b>", "", ...lines].join("\n"));
  }

  // ── Callbacks ────────────────────────────────────────────────────

  private async onCallback(callbackId: string, from: TgUser, data: string): Promise<void> {
    if (!this.config.isConfigured) return;
    const telegramId = from.id;
    const chatId = telegramId;

    // Verification
    if (data === "verify") {
      await this.api.answerCallbackQuery(callbackId);
      await this.onVerify(telegramId, chatId);
      return;
    }
    // University selection
    if (data.startsWith("uni:")) {
      await this.api.answerCallbackQuery(callbackId);
      const value = data.slice(4);
      if (value === "__other__") {
        await this.setConversation(telegramId, { flow: "university" });
        await this.api.sendMessage(chatId, "Type your university's name:");
        return;
      }
      await this.finishUniversity(telegramId, chatId, value);
      return;
    }
    // Menu shortcuts
    if (data === "upload" || data === "status" || data === "leaderboard") {
      await this.api.answerCallbackQuery(callbackId);
      if (data === "upload") await this.beginUpload(telegramId, chatId);
      if (data === "status") await this.onStatus(telegramId, chatId);
      if (data === "leaderboard") await this.onLeaderboard(chatId);
      return;
    }
    // Admin review callbacks — checked before any conversation lookup so a
    // reviewer with an expired wizard state can still act on submissions.
    const reviewMatch = /^ra:(approve|reject|info):([0-9a-f-]{36})$/i.exec(data);

    // Upload wizard button steps
    const conv = await this.getConversation(telegramId);
    if (!conv) {
      if (reviewMatch) {
        await this.handleAdminReview(callbackId, from, reviewMatch[1], reviewMatch[2]);
        return;
      }
      await this.api.answerCallbackQuery(callbackId, "This flow expired — /upload to start again.");
      return;
    }
    if (reviewMatch) {
      await this.handleAdminReview(callbackId, from, reviewMatch[1], reviewMatch[2]);
      return;
    }
    const step = conv.step as string;

    if (data.startsWith("type:") && step === "type") {
      await this.api.answerCallbackQuery(callbackId);
      const value = data.slice(5);
      if (!TelegramBotService.MATERIAL_TYPES.some((t) => t.value === value)) {
        await this.api.answerCallbackQuery(callbackId, "Unknown option.");
        return;
      }
      await this.setConversation(telegramId, { ...conv, step: "level", materialType: value });
      await this.api.sendMessage(chatId, "What level is this resource for?", {
        inline_keyboard: this.choiceKeyboard(
          TelegramBotService.LEVELS.map((l) => ({ label: `${l} level`, data: `level:${l}` })),
          3,
        ),
      });
      return;
    }
    if (data.startsWith("level:") && step === "level") {
      await this.api.answerCallbackQuery(callbackId);
      const value = data.slice(6);
      await this.setConversation(telegramId, { ...conv, step: "session", level: value });
      await this.api.sendMessage(chatId, "Which academic session does the document belong to?", {
        inline_keyboard: this.choiceKeyboard(
          [...TelegramBotService.SESSIONS.map((s) => ({ label: s, data: `session:${s}` })), { label: "Skip", data: "session:__skip__" }],
          2,
        ),
      });
      return;
    }
    if (data.startsWith("session:") && step === "session") {
      await this.api.answerCallbackQuery(callbackId);
      const value = data.slice(8);
      await this.setConversation(telegramId, {
        ...conv,
        step: "description",
        academicSession: value === "__skip__" ? null : value,
      });
      await this.api.sendMessage(
        chatId,
        "Last question: <b>describe the document</b> — what does it contain, and why would another student find it useful? (1–3 sentences)",
      );
      return;
    }
    if (data.startsWith("rights:") && step === "rights") {
      await this.api.answerCallbackQuery(callbackId);
      if (data === "rights:no") {
        await this.clearConversation(telegramId);
        await this.api.sendMessage(chatId, "Cancelled — nothing was submitted.");
        return;
      }
      const pending = conv.pendingFile as { fileId: string; fileName: string } | undefined;
      if (!pending) {
        await this.clearConversation(telegramId);
        await this.api.sendMessage(chatId, "The file went missing from the conversation. /upload to start over.");
        return;
      }
      await this.finalizeSubmission(telegramId, chatId, conv, pending);
      return;
    }
    await this.api.answerCallbackQuery(callbackId);
  }

  /** Approve / reject / needs-info from an admin, with reason collection. */
  private async handleAdminReview(
    callbackId: string,
    from: TgUser,
    action: string,
    submissionId: string,
  ): Promise<void> {
    if (!this.config.isTelegramAdmin(String(from.id))) {
      await this.api.answerCallbackQuery(callbackId, "Not allowed.");
      return;
    }
    if (action === "approve") {
      try {
        await this.audit.decide(submissionId, `telegram:${from.id}`, "approved", undefined, "telegram");
        await this.api.answerCallbackQuery(callbackId, "Approved.");
        await this.api.sendMessage(from.id, `Approved <code>${submissionId.slice(0, 8)}</code>. Points awarded where applicable.`);
      } catch (err) {
        await this.api.answerCallbackQuery(callbackId, "Failed — see chat.");
        await this.api.sendMessage(from.id, `Couldn't approve: ${String(err instanceof Error ? err.message : err)}`);
      }
      return;
    }
    await this.api.answerCallbackQuery(callbackId);
    await this.setConversation(from.id, { flow: "admin_reason", action, submissionId });
    await this.api.sendMessage(from.id, `Send the reason for <b>${action === "reject" ? "rejection" : "information needed"}</b> on <code>${submissionId.slice(0, 8)}</code>.`);
  }

  private choiceKeyboard(
    options: Array<{ label: string; data: string }>,
    perRow: number,
  ): Array<Array<{ text: string; callback_data: string }>> {
    const rows: Array<Array<{ text: string; callback_data: string }>> = [];
    for (let i = 0; i < options.length; i += perRow) {
      rows.push(
        options.slice(i, i + perRow).map((o) => ({ text: o.label, callback_data: o.data })),
      );
    }
    return rows;
  }

  // ── Submission ───────────────────────────────────────────────────

  private async finalizeSubmission(
    telegramId: number,
    chatId: number,
    conv: Record<string, unknown>,
    pending: { fileId: string; fileName: string },
  ): Promise<void> {
    if (!this.config.isConfigured) return;
    const participant = await this.campaign.getParticipant(String(telegramId));
    if (!participant?.verifiedAt) {
      await this.clearConversation(telegramId);
      await this.api.sendMessage(chatId, "Your verification lapsed. Press /start to verify again.");
      return;
    }
    await this.api.sendMessage(chatId, "Submitting for review…");
    const buffer = await this.api.downloadFileById(pending.fileId);
    if (!buffer) {
      await this.clearConversation(telegramId);
      await this.api.sendMessage(chatId, "I couldn't download the file from Telegram. /upload to try again.");
      return;
    }
    try {
      const submission = await this.audit.submit({
        participantId: participant.id,
        fileName: pending.fileName,
        buffer,
        courseCode: conv.courseCode as string,
        materialType: conv.materialType as string,
        level: (conv.level as string | null) ?? null,
        academicSession: (conv.academicSession as string | null) ?? null,
        universityName: participant.university,
        rightsDeclared: true,
        source: "telegram",
      });
      // Description is campaign metadata, not an engine field — append to
      // the admin notification instead of forcing it into the schema.
      await this.clearConversation(telegramId);
      await this.api.sendMessage(
        chatId,
        [
          "<b>Submitted.</b>",
          "",
          `Reference: <code>${submission.id.slice(0, 8).toUpperCase()}</code>`,
          "State: ⏳ Under review",
          "",
          "You'll be able to check with /status. Approved resources earn +1 point.",
        ].join("\n"),
      );
      await this.notifyAdminsNewSubmission(
        submission.id,
        pending.fileName,
        conv.courseCode as string,
        participant.university,
        (conv.description as string) ?? "",
      );
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

  // ── Admin review notifications ───────────────────────────────────

  private async notifyAdminsNewSubmission(
    submissionId: string,
    fileName: string,
    courseCode: string,
    university: string | null,
    description: string,
  ): Promise<void> {
    if (!this.config.isConfigured) return;
    for (const adminId of this.config.adminIds) {
      await this.api.sendMessage(
        Number(adminId),
        [
          "<b>New Resource Hunt submission</b>",
          "",
          `File: ${fileName}`,
          `Course: ${courseCode}`,
          university ? `University: ${university}` : null,
          description ? `About: ${description}` : null,
          `Reference: <code>${submissionId}</code>`,
        ]
          .filter((l) => l !== null)
          .join("\n"),
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

  /** Approval notifications to participants (wired from the engine). */
  async notifyParticipantApproval(participantId: string, courseCode: string, points: number): Promise<void> {
    const participant = await this.prisma.telegramParticipant.findUnique({ where: { id: participantId } });
    if (!participant) return;
    await this.api.sendMessage(
      Number(participant.telegramId),
      [
        "<b>Resource approved.</b>",
        "",
        `${courseCode} entered the archive — <b>+${points} point${points === 1 ? "" : "s"}</b>.`,
        `Total: ${participant.points + points} pts · /leaderboard to see your rank.`,
      ].join("\n"),
    );
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
        "telegram",
      );
      await this.api.sendMessage(telegramId, `Recorded: <b>${action === "reject" ? "rejected" : "needs info"}</b> on <code>${submissionId.slice(0, 8)}</code>.`);
    } catch (err) {
      await this.api.sendMessage(telegramId, `Couldn't record the decision: ${String(err instanceof Error ? err.message : err)}`);
    }
  }

  // ── Redis helpers ────────────────────────────────────────────────

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
