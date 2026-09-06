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

  /** Delta State universities first — the campaign's home state. Buttons;
   *  free text via "Other…" for anything not listed. */
  private static readonly DELTA_UNIVERSITIES = [
    "Federal University of Petroleum Resources, Effurun",
    "Delta State University, Abraka",
    "Delta State University of Science and Technology, Ozoro",
    "Dennis Osadebay University, Asaba",
    "University of Delta, Agbor",
    "Nigerian Maritime University, Okerenkoko",
    "Novena University, Ogume",
    "Western Delta University, Oghara",
    "Edwin Clark University, Kiagbodo",
    "Admiralty University of Nigeria, Ibusa",
  ];

  /** The wider national list, one "More…" tap away. */
  private static readonly MORE_UNIVERSITIES = [
    "University of Benin",
    "University of Lagos",
    "University of Ibadan",
    "Ahmadu Bello University",
    "University of Ilorin",
    "Obafemi Awolowo University",
    "University of Nigeria, Nsukka",
    "Covenant University",
  ];

  /** Common faculties (buttons) — "Other…" for the rest. */
  private static readonly FACULTIES = [
    "Agriculture",
    "Arts",
    "Education",
    "Engineering",
    "Environmental Studies",
    "Law",
    "Management Sciences",
    "Medical Sciences",
    "Pharmacy",
    "Science",
    "Social Sciences",
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

  /** Common departments per faculty — the wizard's button options. Free
   *  text via "Other…" keeps this list from ever blocking anyone. */
  private static readonly DEPARTMENTS_BY_FACULTY: Record<string, string[]> = {
    Agriculture: [
      "Agricultural Economics",
      "Agricultural Extension",
      "Agronomy",
      "Animal Science",
      "Fisheries",
      "Forestry and Wildlife",
      "Soil Science",
    ],
    Arts: [
      "English and Literary Studies",
      "History",
      "Linguistics",
      "Philosophy",
      "Religious Studies",
      "Theatre Arts",
    ],
    Education: [
      "Arts Education",
      "Science Education",
      "Educational Foundations",
      "Guidance and Counselling",
      "Physical and Health Education",
      "Vocational Education",
    ],
    Engineering: [
      "Chemical Engineering",
      "Civil Engineering",
      "Electrical Engineering",
      "Mechanical Engineering",
      "Petroleum Engineering",
      "Computer Engineering",
    ],
    "Environmental Studies": [
      "Architecture",
      "Building",
      "Estate Management",
      "Quantity Surveying",
      "Urban and Regional Planning",
    ],
    Law: ["Law"],
    "Management Sciences": [
      "Accounting",
      "Banking and Finance",
      "Business Administration",
      "Marketing",
      "Public Administration",
    ],
    "Medical Sciences": [
      "Anatomy",
      "Medicine and Surgery",
      "Nursing Science",
      "Physiology",
      "Radiography",
    ],
    Pharmacy: ["Pharmacy"],
    Science: [
      "Biochemistry",
      "Biology",
      "Chemistry",
      "Computer Science",
      "Geology",
      "Mathematics",
      "Microbiology",
      "Physics",
      "Statistics",
    ],
    "Social Sciences": [
      "Economics",
      "Geography",
      "Mass Communication",
      "Political Science",
      "Psychology",
      "Sociology",
    ],
  };

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
    // And hand the reviewer the actual document + AI verdict when a
    // submission reaches human review — review the file, not a reference.
    this.audit.notifyReviewReady = async (payload) => {
      for (const adminId of this.config.adminIds) {
        const riskIcon = payload.riskLevel === "red" ? "🔴" : payload.riskLevel === "yellow" ? "🟡" : "🟢";
        const caption = [
          `<b>Resource Hunt — needs your review</b> ${riskIcon}`,
          "",
          `File: ${payload.fileName}`,
          `Course: ${payload.courseCode}`,
          payload.universityName ? `University: ${payload.universityName}` : null,
          `AI (${payload.aiRecommendation}, ${payload.aiConfidence ?? "?"}% confident):`,
          payload.aiSummary ?? "no summary",
          payload.duplicateOfId ? `⚠️ Possible duplicate of <code>${payload.duplicateOfId.slice(0, 8)}</code>` : null,
          `Ref: <code>${payload.submissionId}</code>`,
        ]
          .filter((l) => l !== null)
          .join("\n");
        const sent =
          payload.buffer.length > 0
            ? await this.api.sendDocument(
                Number(adminId),
                { filename: payload.fileName, buffer: payload.buffer, mimeType: payload.mimeType },
                caption,
                {
                  inline_keyboard: [
                    [
                      { text: "Approve", callback_data: `ra:approve:${payload.submissionId}` },
                      { text: "Reject", callback_data: `ra:reject:${payload.submissionId}` },
                    ],
                    [{ text: "Needs info", callback_data: `ra:info:${payload.submissionId}` }],
                  ],
                },
              )
            : null;
        // Document delivery failed (size/network) — fall back to the text
        // notification so the submission is still reviewable.
        if (!sent) {
          await this.api.sendMessage(Number(adminId), caption, {
            inline_keyboard: [
              [
                { text: "Approve", callback_data: `ra:approve:${payload.submissionId}` },
                { text: "Reject", callback_data: `ra:reject:${payload.submissionId}` },
              ],
            ],
          });
        }
      }
    };
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
      // Announce to the community — admins only, targets the community chat.
      else if (text.startsWith("/announce")) await this.onAnnounce(chatId, telegramId);
      // Review queue — admins only: pending submissions with get-document buttons.
      else if (text.startsWith("/review")) await this.onReview(chatId, telegramId);
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
        "/announce — post the leaderboard to the community (admins)",
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
    const rows = TelegramBotService.DELTA_UNIVERSITIES.map((u) => [
      { text: u, callback_data: `uni:${u}` },
    ]);
    rows.push([{ text: "More universities…", callback_data: "uni:__more__" }]);
    rows.push([{ text: "Other (type it)", callback_data: "uni:__other__" }]);
    return rows;
  }

  private moreUniversitiesKeyboard(): Array<Array<{ text: string; callback_data: string }>> {
    const rows = TelegramBotService.MORE_UNIVERSITIES.map((u) => [
      { text: u, callback_data: `uni:${u}` },
    ]);
    rows.push([{ text: "Other (type it)", callback_data: "uni:__other__" }]);
    return rows;
  }

  private departmentKeyboard(faculty: string): Array<Array<{ text: string; callback_data: string }>> {
    const options = TelegramBotService.DEPARTMENTS_BY_FACULTY[faculty] ?? [];
    const rows: Array<Array<{ text: string; callback_data: string }>> = [];
    for (let i = 0; i < options.length; i += 2) {
      rows.push(options.slice(i, i + 2).map((d) => ({ text: d, callback_data: `dept:${d}` })));
    }
    // Always offer free text — unknown faculty names and rare departments
    // must never dead-end the wizard (and empty keyboards are invalid).
    rows.push([{ text: "Other (type it)", callback_data: "dept:__other__" }]);
    return rows;
  }

  private facultyKeyboard(): Array<Array<{ text: string; callback_data: string }>> {
    const rows: Array<Array<{ text: string; callback_data: string }>> = [];
    for (let i = 0; i < TelegramBotService.FACULTIES.length; i += 2) {
      rows.push(
        TelegramBotService.FACULTIES.slice(i, i + 2).map((f) => ({
          text: f,
          callback_data: `faculty:${f}`,
        })),
      );
    }
    rows.push([{ text: "Other (type it)", callback_data: "faculty:__other__" }]);
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
      step: "faculty",
      pendingFile: { fileId: doc.file_id, fileName: doc.file_name ?? "upload" },
    });
    await this.api.sendMessage(
      chatId,
      `Got <b>${doc.file_name ?? "your file"}</b>. Which faculty is it from?`,
      { inline_keyboard: this.facultyKeyboard() },
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
      step: "faculty",
      pendingFile: { fileId: best.file_id, fileName: `scan-${Date.now()}.jpg` },
    });
    await this.api.sendMessage(chatId, "Got the scan. Which faculty is it from?", {
      inline_keyboard: this.facultyKeyboard(),
    });
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
    if (step === "faculty_text") {
      // Reached only through the faculty "Other…" button. Text IS the input
      // here — accept it and move on to department.
      const faculty = text.trim().slice(0, 120);
      if (faculty.length < 3) {
        await this.api!.sendMessage(chatId, "That's too short — type the faculty's full name, or /cancel.");
        return;
      }
      await this.setConversation(telegramId, { ...conv, faculty, step: "department" });
      await this.api!.sendMessage(chatId, "Department?", {
        inline_keyboard: this.departmentKeyboard(faculty),
      });
      return;
    }
    if (step === "department_text") {
      const department = text.trim().slice(0, 120);
      if (department.length < 3) {
        await this.api!.sendMessage(chatId, "That's too short — type the department's full name, or /cancel.");
        return;
      }
      await this.setConversation(telegramId, { ...conv, department, step: "course" });
      await this.api!.sendMessage(
        chatId,
        `Got it — <b>${conv.faculty as string}</b> / <b>${department}</b>.\n\nWhat course is the resource for? e.g. <code>CHM 101</code>`,
      );
      return;
    }
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

  /**
   * Post the leaderboard to the community itself. The numeric community id
   * must be configured; without it there is nowhere to post. Text is free
   * because this is an admin broadcast, not a participant flow — participants
   * never reach this command (it no-ops for them, silently).
   */
  private async onAnnounce(fromChatId: number, fromId: number): Promise<void> {
    if (!this.config.isTelegramAdmin(String(fromId))) return;
    const communityId = this.config.communityId;
    if (!communityId) {
      await this.api!.sendMessage(
        fromChatId,
        "No community is configured (TELEGRAM_COMMUNITY_ID). Wire the gate first — then /announce has somewhere to post.",
      );
      return;
    }
    const rows = await this.campaign.leaderboard(10);
    const header = "<b>Resource Hunt — Leaderboard</b>";
    if (rows.length === 0) {
      await this.api!.sendMessage(communityId, [
        header,
        "",
        "The hunt is on — the leaderboard is waiting for its first entry.",
        "Join, verify, then /upload a past question or note to claim the top spot.",
        `New here? Start at ${this.config.communityUrl}`,
      ].join("\n"));
    } else {
      const medals = ["🥇", "🥈", "🥉"];
      const lines = rows.map((r, i) => {
        const icon = medals[i] ?? `${r.rank}.`;
        const name = r.username ? `@${r.username}` : r.name;
        return `${icon} ${name} — <b>${r.points}</b> pts (${r.approvedCount} approved)`;
      });
      await this.api!.sendMessage(communityId, [
        header,
        "",
        ...lines,
        "",
        `Every approved resource earns points. /upload to climb.`,
      ].join("\n"));
    }
    await this.api!.sendMessage(fromChatId, "Posted to the community.");
  }

  /**
   * /review — the review pocket in chat. Lists pending submissions with
   * per-item "Get document" buttons; the document arrives with its Approve /
   * Reject / Needs info keyboard attached, so everything is reviewable
   * without leaving Telegram.
   */
  private async onReview(fromChatId: number, fromId: number): Promise<void> {
    if (!this.config.isTelegramAdmin(String(fromId))) return;
    const queue = await this.audit.adminReviewQueue({ take: 10 });
    if (queue.length === 0) {
      await this.api!.sendMessage(fromChatId, "Nothing waiting for review — the queue is clear.");
      return;
    }
    const lines: string[] = [`<b>${queue.length} submission${queue.length === 1 ? "" : "s"} waiting for review</b>`, ""];
    const buttons: Array<Array<{ text: string; callback_data: string }>> = [];
    for (const row of queue) {
      const risk = row.riskLevel === "red" ? "🔴" : row.riskLevel === "yellow" ? "🟡" : row.riskLevel === "green" ? "🟢" : "·";
      lines.push(`${risk} <b>${row.courseCode}</b> — ${row.fileName}\n   AI: ${row.aiRecommendation ?? "?"}${row.aiConfidence != null ? ` (${row.aiConfidence}%)` : ""}${row.universityName ? ` · ${row.universityName}` : ""}\n   <code>${row.id}</code>`);
      buttons.push([{ text: `📄 ${row.courseCode} — ${row.fileName.slice(0, 24)}`, callback_data: `rq:doc:${row.id}` }]);
    }
    await this.api!.sendMessage(fromChatId, lines.join("\n"), { inline_keyboard: buttons });
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
      if (value === "__more__") {
        await this.api.sendMessage(chatId, "Other universities:", {
          inline_keyboard: this.moreUniversitiesKeyboard(),
        });
        return;
      }
      await this.finishUniversity(telegramId, chatId, value);
      return;
    }
    // Faculty selection (wizard step)
    if (data.startsWith("faculty:")) {
      await this.api.answerCallbackQuery(callbackId);
      const conv = await this.getConversation(telegramId);
      if (!conv || conv.flow !== "upload" || conv.step !== "faculty") {
        await this.api.answerCallbackQuery(callbackId, "This flow expired — /upload to start again.");
        return;
      }
      const value = data.slice(8);
      if (value === "__other__") {
        await this.setConversation(telegramId, { ...conv, step: "faculty_text" });
        await this.api.sendMessage(chatId, "Type your faculty's name:");
        return;
      }
      await this.setConversation(telegramId, { ...conv, faculty: value, step: "department" });
      await this.api.sendMessage(chatId, "Department?", {
        inline_keyboard: this.departmentKeyboard(value),
      });
      return;
    }
    // Department selection (wizard step)
    if (data.startsWith("dept:")) {
      await this.api.answerCallbackQuery(callbackId);
      const conv = await this.getConversation(telegramId);
      if (!conv || conv.flow !== "upload" || conv.step !== "department") {
        await this.api.answerCallbackQuery(callbackId, "This flow expired — /upload to start again.");
        return;
      }
      const value = data.slice(5);
      if (value === "__other__") {
        await this.setConversation(telegramId, { ...conv, step: "department_text" });
        await this.api.sendMessage(chatId, "Type your department's name:");
        return;
      }
      await this.setConversation(telegramId, { ...conv, department: value, step: "course" });
      await this.api.sendMessage(
        chatId,
        `Got it — <b>${conv.faculty as string}</b> / <b>${value}</b>.\n\nWhat course is the resource for? e.g. <code>CHM 101</code>`,
      );
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
    // /review "get document" button — same early-dispatch treatment.
    const docMatch = /^rq:doc:([0-9a-f-]{36})$/i.exec(data);

    // Upload wizard button steps
    const conv = await this.getConversation(telegramId);
    if (!conv) {
      if (reviewMatch) {
        await this.handleAdminReview(callbackId, from, reviewMatch[1], reviewMatch[2]);
        return;
      }
      if (docMatch) {
        await this.sendReviewDocument(callbackId, from, docMatch[1]);
        return;
      }
      await this.api.answerCallbackQuery(callbackId, "This flow expired — /upload to start again.");
      return;
    }
    if (reviewMatch) {
      await this.handleAdminReview(callbackId, from, reviewMatch[1], reviewMatch[2]);
      return;
    }
    if (docMatch) {
      await this.sendReviewDocument(callbackId, from, docMatch[1]);
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
        step: "rights",
        academicSession: value === "__skip__" ? null : value,
      });
      await this.api.sendMessage(
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

  /**
   * /review button handler: fetch the preserved original from storage and
   * send it with the AI verdict + decision keyboard — the same message the
   * automatic review notification delivers, on demand.
   */
  private async sendReviewDocument(callbackId: string, from: TgUser, submissionId: string): Promise<void> {
    if (!this.config.isTelegramAdmin(String(from.id))) {
      await this.api.answerCallbackQuery(callbackId, "Not allowed.");
      return;
    }
    try {
      const row = await this.prisma.resourceSubmission.findUnique({ where: { id: submissionId } });
      if (!row) {
        await this.api.answerCallbackQuery(callbackId, "Submission not found.");
        return;
      }
      const { buffer } = await this.audit.adminFile(submissionId, `telegram:${from.id}`);
      const risk = row.riskLevel === "red" ? "🔴" : row.riskLevel === "yellow" ? "🟡" : row.riskLevel === "green" ? "🟢" : "·";
      const caption = [
        `<b>Resource Hunt — needs your review</b> ${risk}`,
        "",
        `File: ${row.fileName}`,
        `Course: ${row.courseCode}`,
        row.universityName ? `University: ${row.universityName}` : null,
        `AI (${row.aiRecommendation ?? "?"}, ${row.aiConfidence ?? "?"}% confident):`,
        row.aiSummary ?? "no summary",
        `Ref: <code>${row.id}</code>`,
      ]
        .filter((l) => l !== null)
        .join("\n");
      await this.api.sendDocument(
        Number(from.id),
        { filename: row.fileName, buffer, mimeType: row.fileType },
        caption,
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
      await this.api.answerCallbackQuery(callbackId);
    } catch (err) {
      await this.api.answerCallbackQuery(callbackId, "Couldn't fetch the file.");
      await this.api.sendMessage(Number(from.id), `Couldn't send that document: ${String(err instanceof Error ? err.message : err)}`);
    }
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
        faculty: (conv.faculty as string | null) ?? null,
        department: (conv.department as string | null) ?? null,
        universityName: participant.university,
        rightsDeclared: true,
        source: "telegram",
      });
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
