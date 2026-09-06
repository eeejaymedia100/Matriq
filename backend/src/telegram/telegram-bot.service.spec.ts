import { TelegramBotService } from "./telegram-bot.service";
import { TelegramConfig } from "./telegram.config";
import { TelegramApi } from "./telegram.api";
import { TelegramGate } from "./telegram-gate";
import { ResourceAuditService, SubmissionValidationError } from "../resource-audit/resource-audit.service";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Telegram bot service — behaviour tests for the gated upload flow,
 * account linking, and admin review callbacks.
 *
 * Collaborators are mocked; ioredis is replaced with an in-memory fake so
 * conversation state behaves as it does against real Redis.
 */

jest.mock("ioredis", () => {
  return {
    __esModule: true,
    default: class FakeRedis {
      public store = new Map<string, string>();
      public status = "ready";
      async get(k: string) { return this.store.get(k) ?? null; }
      async set(k: string, v: string, ...rest: string[]) {
        if (rest[0] === "EX" && rest[1] === "0") this.store.delete(k);
        this.store.set(k, v);
        return "OK";
      }
      async del(...ks: string[]) { let n = 0; for (const k of ks) { n += this.store.delete(k) ? 1 : 0; } return n; }
      async incr(k: string) { const v = Number(this.store.get(k) ?? 0) + 1; this.store.set(k, String(v)); return v; }
      async expire() { return 1; }
      async setnx() { return this.store.has("__leader") ? 0 : (this.store.set("__leader", "1"), 1); }
      async quit() { return undefined; }
      on() { return this; }
    },
  };
});

jest.mock("../email/email.service", () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ success: true, messageId: "m1" }),
  })),
}));

jest.mock("../resource-audit/resource-audit.service", () => ({
  ResourceAuditService: jest.fn().mockImplementation(() => ({})),
  SubmissionValidationError: class extends Error {
    constructor(public reason: string) { super(reason); }
    getResponse() { return { reason: this.reason }; }
  },
}));

const USER_A = { id: 111, first_name: "Ada" };
const USER_B = { id: 222, first_name: "Femi" };

function makeBot(overrides: Partial<Record<string, unknown>> = {}) {
  const config = {
    botToken: "test-token",
    isConfigured: true,
    communityId: "-1001234567890",
    communityUrl: "https://t.me/matriq_community",
    adminIds: ["6911908487"],
    webhookUrl: "",
    webhookSecret: "whsec",
    miniAppUrl: "https://matriq.com.ng/telegram-miniapp/",
    botUsername: "MatriqBot",
    isTelegramAdmin: (id: string) => id === "6911908487",
    ...overrides,
  } as unknown as TelegramConfig;

  const prisma = {
    user: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    resourceSubmission: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const audit = { submit: jest.fn().mockResolvedValue({ id: "sub-1", auditStatus: "received" }), decide: jest.fn().mockResolvedValue({}) };
  const gate = { canUpload: jest.fn().mockResolvedValue(true) };
  const api = {
    getMe: jest.fn().mockResolvedValue({ id: 1, username: "MatriqBot" }),
    sendMessage: jest.fn().mockResolvedValue({}),
    answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
    getUpdates: jest.fn().mockResolvedValue([]),
    setWebhook: jest.fn().mockResolvedValue(true),
    deleteWebhook: jest.fn().mockResolvedValue(true),
    safe: jest.fn().mockResolvedValue({}),
    downloadFileById: jest.fn().mockResolvedValue(Buffer.from("file-bytes")),
    downloadFile: jest.fn().mockResolvedValue(Buffer.from("file-bytes")),
    getFileId: jest.fn().mockResolvedValue({ file_path: "docs/x" }),
  };

  const bot = new TelegramBotService(
    config,
    prisma as unknown as PrismaService,
    new (EmailService as jest.Mock)(),
    audit as unknown as ResourceAuditService,
    gate as unknown as TelegramGate,
    api as unknown as TelegramApi,
    { get: jest.fn().mockReturnValue("redis://fake") } as never,
  );
  return { bot, config, prisma, audit, gate, api };
}

describe("TelegramBotService", () => {
  it("rejects uploads from users who are not community members", async () => {
    const { bot, gate, api } = makeBot({ communityId: "-1001" } as never);
    gate.canUpload.mockResolvedValue(false);
    (bot as unknown as { prisma: { user: { findFirst: jest.Mock } } }).prisma.user.findFirst
      .mockResolvedValueOnce({ id: "u1", email: "a@x.com" });

    await (bot as unknown as { beginUpload: (t: number, c: number) => Promise<void> }).beginUpload(111, 111);

    expect(api.sendMessage).toHaveBeenCalledWith(
      111,
      expect.stringContaining("join the Matriq community"),
      expect.objectContaining({ inline_keyboard: expect.any(Array) }),
    );
  });

  it("sends the file prompt when a linked, joined member starts an upload", async () => {
    const { bot, api } = makeBot();
    (bot as unknown as { prisma: { user: { findFirst: jest.Mock } } }).prisma.user.findFirst
      .mockResolvedValue({ id: "u1", email: "a@x.com" });

    await (bot as unknown as { beginUpload: (t: number, c: number) => Promise<void> }).beginUpload(111, 111);

    expect(api.sendMessage).toHaveBeenCalledWith(111, expect.stringContaining("Send the file now"));
  });

  it("walks the full upload conversation and submits with source=telegram", async () => {
    const { bot, audit, api } = makeBot();
    const b = bot as unknown as {
      handleDocument: (m: never) => Promise<void>;
      continueConversation: (t: number, c: number, text: string, conv: Record<string, unknown>) => Promise<void>;
      setConversation: (t: number, s: Record<string, unknown>) => Promise<void>;
      getConversation: (t: number) => Promise<Record<string, unknown> | null>;
      redis: { store: Map<string, string> } | undefined;
    };
    (bot as unknown as { prisma: { user: { findFirst: jest.Mock } } }).prisma.user.findFirst
      .mockResolvedValue({ id: "u1", email: "a@x.com" });

    await b.setConversation(111, { flow: "upload", step: "file", userId: "u1" });
    await b.handleDocument({
      message_id: 1, date: 0, from: USER_A,
      chat: { id: 111, type: "private" },
      document: { file_id: "F1", file_name: "CHM101_2023.pdf", file_size: 1000 },
    } as never);

    let conv = (await b.getConversation(111))!;
    expect(conv.step).toBe("course");
    await b.continueConversation(111, 111, "CHM 101", conv);
    conv = (await b.getConversation(111))!;
    expect(conv.courseCode).toBe("CHM 101");
    await b.continueConversation(111, 111, "1", conv);
    conv = (await b.getConversation(111))!;
    expect(conv.materialType).toBe("past_question");
    await b.continueConversation(111, 111, "2023/2024", conv);
    conv = (await b.getConversation(111))!;
    expect(conv.step).toBe("rights");
    await b.continueConversation(111, 111, "yes", conv);

    expect(audit.submit).toHaveBeenCalledTimes(1);
    expect(audit.submit).toHaveBeenCalledWith(expect.objectContaining({ source: "telegram", courseCode: "CHM 101", studentId: "u1" }));
    expect(api.sendMessage).toHaveBeenCalledWith(111, expect.stringContaining("Submitted."));
  });

  void USER_B;
});

describe("TelegramBotService — admin review", () => {
  // Callback data carries the real submission UUID — hex + dashes only.
  const SUB_ID = "1b4e28ba-2fa1-11d2-883f-0016d3cca427";

  it("approves a submission from an admin callback and records reviewer as telegram:<id>", async () => {
    const { bot, audit } = makeBot();
    const b = bot as unknown as { onCallback: (id: string, from: number, data: string) => Promise<void> };

    await b.onCallback("cb1", 6911908487, `ra:approve:${SUB_ID}`);

    expect(audit.decide).toHaveBeenCalledWith(SUB_ID, "telegram:6911908487", "approved");
  });

  it("refuses review actions from non-admins", async () => {
    const { bot, audit, api } = makeBot();
    const b = bot as unknown as { onCallback: (id: string, from: number, data: string) => Promise<void> };

    await b.onCallback("cb2", 999, `ra:approve:${SUB_ID}`);

    expect(audit.decide).not.toHaveBeenCalled();
    expect(api.answerCallbackQuery).toHaveBeenCalledWith("cb2", "Not allowed.");
  });
});
