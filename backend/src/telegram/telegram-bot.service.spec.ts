import { TelegramBotService } from "./telegram-bot.service";
import { TelegramConfig } from "./telegram.config";
import { TelegramApi } from "./telegram.api";
import { TelegramGate } from "./telegram-gate";
import { TelegramCampaignService } from "./telegram-campaign.service";
import {
  ResourceAuditService,
  SubmissionValidationError,
} from "../resource-audit/resource-audit.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Resource Hunt bot — behaviour tests for the campaign flow: community
 * verification gate, button-driven submission wizard, participant-safe
 * status, leaderboard, and admin review callbacks. Collaborators mocked;
 * ioredis is an in-memory fake so conversation state behaves as against
 * real Redis.
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

const USER_A = { id: 111, first_name: "Ada", username: "ada" };
const ADMIN = { id: 6911908487, first_name: "Admin" };

function makeBot(overrides: Record<string, unknown> = {}) {
  const config = {
    botToken: "test-token",
    isConfigured: true,
    communityId: "-1001234567890",
    communityUrl: "https://t.me/matriq_community",
    adminIds: ["6911908487"],
    webhookUrl: "",
    webhookSecret: "whsec",
    miniAppUrl: "https://matriq.com.ng/telegram-miniapp/",
    botUsername: "pdftocashBot",
    isTelegramAdmin: (id: string) => id === "6911908487",
    ...overrides,
  } as unknown as TelegramConfig;

  const prisma = {
    user: { findFirst: jest.fn(), findUnique: jest.fn() },
    resourceSubmission: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    telegramParticipant: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.id === "p-1"
          ? { id: "p-1", telegramId: "111", verifiedAt: new Date(), university: "University of Benin", points: 4, approvedCount: 4 }
          : null,
      ),
    },
  };

  const campaign = {
    ensureParticipant: jest.fn(async ({ id }: { id: number }) => ({
      id: "p-1", telegramId: String(id), verifiedAt: null, university: null, points: 0, approvedCount: 0,
    })),
    getParticipant: jest.fn(async (telegramId: string) =>
      telegramId === "111"
        ? { id: "p-1", telegramId, verifiedAt: new Date(), university: "University of Benin", points: 4, approvedCount: 4 }
        : null,
    ),
    markVerified: jest.fn().mockResolvedValue(undefined),
    setUniversity: jest.fn().mockResolvedValue(undefined),
    awardForSubmission: jest.fn(),
    leaderboard: jest.fn().mockResolvedValue([
      { rank: 1, name: "Ada", username: "ada", points: 4, approvedCount: 4 },
      { rank: 2, name: "Femi", username: null, points: 2, approvedCount: 2 },
    ]),
  };

  const audit = {
    submit: jest.fn().mockResolvedValue({ id: "sub-1", auditStatus: "received" }),
    decide: jest.fn().mockResolvedValue({}),
  };
  const gate = { canUpload: jest.fn().mockResolvedValue(true) };
  const api = {
    getMe: jest.fn().mockResolvedValue({ id: 1, username: "pdftocashBot" }),
    sendMessage: jest.fn().mockResolvedValue({}),
    answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
    getUpdates: jest.fn().mockResolvedValue([]),
    setWebhook: jest.fn().mockResolvedValue(true),
    deleteWebhook: jest.fn().mockResolvedValue(true),
    safe: jest.fn().mockResolvedValue({}),
    downloadFileById: jest.fn().mockResolvedValue(Buffer.from("file-bytes")),
  };

  const bot = new TelegramBotService(
    config,
    prisma as unknown as PrismaService,
    campaign as unknown as TelegramCampaignService,
    audit as unknown as ResourceAuditService,
    gate as unknown as TelegramGate,
    api as unknown as TelegramApi,
    { pdfPreviewPages: jest.fn().mockResolvedValue([]) } as never,
    { get: jest.fn().mockReturnValue("redis://fake") } as never,
  );
  return { bot, config, prisma, campaign, audit, gate, api };
}

/** Drive a private helper with typed access. */
function call<T>(obj: unknown, method: string): T {
  return (obj as Record<string, Record<string, (...a: never[]) => never>>)[method] as T;
}

describe("TelegramBotService — Resource Hunt flow", () => {
  it("offers join + verify to a first-time user (no account linking anywhere)", async () => {
    const { bot, api } = makeBot();
    await (bot as any).onStart(111, USER_A);
    expect(api.sendMessage).toHaveBeenCalledWith(
      111,
      expect.stringContaining("Resource Hunt"),
      expect.objectContaining({ inline_keyboard: expect.any(Array) }),
    );
    const keyboard = api.sendMessage.mock.calls[0][2].inline_keyboard as Array<Array<{ text: string; callback_data: string }>>;
    const flat = keyboard.flat().map((b) => b.callback_data);
    expect(flat).toContain("verify");
    expect(flat).not.toContain("link");
  });

  it("verifies membership via the gate and asks for the university with buttons", async () => {
    const { bot, gate, api, campaign } = makeBot();
    gate.canUpload.mockResolvedValue(true);

    await (bot as any).onVerify(111, 111);

    expect(gate.canUpload).toHaveBeenCalledWith(111);
    expect(campaign.markVerified).toHaveBeenCalledWith("111");
    const keyboard = api.sendMessage.mock.calls[0][2].inline_keyboard as Array<Array<{ text: string; callback_data: string }>>;
    const data = keyboard.flat().map((b) => b.callback_data);
    expect(data.some((d) => d.startsWith("uni:"))).toBe(true);
  });

  it("refuses verification when the user is not a community member", async () => {
    const { bot, gate, api, campaign } = makeBot();
    gate.canUpload.mockResolvedValue(false);

    await (bot as any).onVerify(111, 111);

    expect(campaign.markVerified).not.toHaveBeenCalled();
    expect(api.sendMessage).toHaveBeenCalledWith(111, expect.stringContaining("not showing as a member"), expect.anything());
  });

  it("walks the full button-driven wizard and submits with participantId", async () => {
    const { bot, audit, api } = makeBot();
    const b = bot as unknown as {
      handleDocument: (m: never) => Promise<void>;
      continueConversation: (t: number, c: number, text: string, conv: Record<string, unknown>) => Promise<void>;
      onCallback: (id: string, from: { id: number }, data: string) => Promise<void>;
      finalizeSubmission: (t: number, c: number, conv: Record<string, unknown>, p: { fileId: string; fileName: string }) => Promise<void>;
    };

    // 1. /upload for a verified participant
    await (bot as unknown as { beginUpload: (t: number, c: number) => Promise<void> }).beginUpload(111, 111);
    expect(api.sendMessage).toHaveBeenCalledWith(111, expect.stringContaining("Send the file now"));

    // 2. Document arrives
    const docMessage = {
      message_id: 1, from: USER_A, chat: { id: 111, type: "private" }, date: 0,
      document: { file_id: "f1", file_name: "chm101.pdf", file_size: 1024 },
    } as never;
    await b.handleDocument(docMessage);

    // 3. Faculty via button, department via button
    let conv = await (bot as unknown as { getConversation: (t: number) => Promise<Record<string, unknown>> }).getConversation(111);
    expect(conv.step).toBe("faculty");
    await b.onCallback("cbF", USER_A, "faculty:Science");

    conv = await (bot as unknown as { getConversation: (t: number) => Promise<Record<string, unknown>> }).getConversation(111);
    expect(conv.step).toBe("department");
    await b.onCallback("cbD", USER_A, "dept:Chemistry");

    // 4. Course code (free text)
    conv = await (bot as unknown as { getConversation: (t: number) => Promise<Record<string, unknown>> }).getConversation(111);
    expect(conv.step).toBe("course");
    await b.continueConversation(111, 111, "chm 101", conv);

    // 5. Type via button
    conv = await (bot as unknown as { getConversation: (t: number) => Promise<Record<string, unknown>> }).getConversation(111);
    expect(conv.step).toBe("type");
    await b.onCallback("cb1", USER_A, "type:past_question");

    // 6. Level via button
    conv = await (bot as unknown as { getConversation: (t: number) => Promise<Record<string, unknown>> }).getConversation(111);
    expect(conv.step).toBe("level");
    await b.onCallback("cb2", USER_A, "level:300");

    // 7. Session via button → rights directly (no description step)
    conv = await (bot as unknown as { getConversation: (t: number) => Promise<Record<string, unknown>> }).getConversation(111);
    expect(conv.step).toBe("session");
    await b.onCallback("cb3", USER_A, "session:2024/2025");

    // 8. Rights via button → submit
    conv = await (bot as unknown as { getConversation: (t: number) => Promise<Record<string, unknown>> }).getConversation(111);
    expect(conv.step).toBe("rights");
    await b.onCallback("cb4", USER_A, "rights:yes");

    expect(audit.submit).toHaveBeenCalledTimes(1);
    const submitArg = audit.submit.mock.calls[0][0] as Record<string, unknown>;
    expect(submitArg.participantId).toBe("p-1");
    expect(submitArg.studentId).toBeUndefined();
    expect(submitArg.courseCode).toBe("CHM 101");
    expect(submitArg.materialType).toBe("past_question");
    expect(submitArg.level).toBe("300");
    expect(submitArg.academicSession).toBe("2024/2025");
    expect(submitArg.faculty).toBe("Science");
    expect(submitArg.department).toBe("Chemistry");
    expect(submitArg.source).toBe("telegram");

    // Participant sees a simple status, no AI internals.
    const sent = api.sendMessage.mock.calls.map((c) => String(c[1])).join("\n");
    expect(sent).toContain("Under review");
    expect(sent).not.toContain("AI");
  });

  it("rejects free text at button-only steps instead of corrupting state", async () => {
    const { bot, api } = makeBot();
    const b = bot as unknown as {
      setConversation: (t: number, s: Record<string, unknown>) => Promise<void>;
      continueConversation: (t: number, c: number, text: string, conv: Record<string, unknown>) => Promise<void>;
      getConversation: (t: number) => Promise<Record<string, unknown>>;
    };
    await b.setConversation(111, { flow: "upload", step: "type" }); // button step
    await b.continueConversation(111, 111, "past question please", { flow: "upload", step: "type" });
    expect(api.sendMessage).toHaveBeenCalledWith(111, expect.stringContaining("use the buttons"));
  });

  it("shows participant-safe status with points and no internal states", async () => {
    const { bot, api } = makeBot();
    (bot as unknown as { prisma: { resourceSubmission: { findMany: jest.Mock } } }).prisma.resourceSubmission.findMany
      .mockResolvedValue([
        { id: "0f0e0d0c-0000-4000-8000-00000000000a", fileName: "chm101.pdf", courseCode: "CHM 101", auditStatus: "auditing", rewardStatus: "none", submittedAt: new Date() },
      ]);
    await (bot as unknown as { onStatus: (t: number, c: number) => Promise<void> }).onStatus(111, 111);
    const text = String(api.sendMessage.mock.calls[0][1]);
    expect(text).toContain("Points so far");
    expect(text).not.toMatch(/auditing|duplicate_check|extracting/);
  });

  it("renders the leaderboard with points and approved counts", async () => {
    const { bot, api, campaign } = makeBot();
    await (bot as unknown as { onLeaderboard: (c: number) => Promise<void> }).onLeaderboard(111);
    expect(campaign.leaderboard).toHaveBeenCalled();
    const text = String(api.sendMessage.mock.calls[0][1]);
    expect(text).toContain("Leaderboard");
    expect(text).toContain("4");
    expect(text).toContain("@ada");
  });

  it("blocks unverified participants from /upload", async () => {
    const { bot, api } = makeBot();
    (bot as unknown as { campaign: { getParticipant: jest.Mock } }).campaign.getParticipant.mockResolvedValue(
      { id: "p-1", telegramId: "111", verifiedAt: null, university: null, points: 0, approvedCount: 0 },
    );
    await (bot as unknown as { beginUpload: (t: number, c: number) => Promise<void> }).beginUpload(111, 111);
    expect(api.sendMessage).toHaveBeenCalledWith(111, expect.stringContaining("Join the community"), expect.anything());
  });
});

describe("TelegramBotService — admin review", () => {
  it("approves a submission from an admin callback with telegram reviewer source", async () => {
    const { bot, audit, api } = makeBot();
    await (bot as unknown as { onCallback: (id: string, from: { id: number }, data: string) => Promise<void> }).onCallback(
      "cb", ADMIN, "ra:approve:0f0e0d0c-0000-4000-8000-000000000001",
    );
    expect(audit.decide).toHaveBeenCalledWith(
      "0f0e0d0c-0000-4000-8000-000000000001",
      "telegram:6911908487",
      "approved",
      undefined,
      "telegram",
    );
    expect(api.answerCallbackQuery).toHaveBeenCalledWith("cb", "Approved.");
  });

  it("refuses review actions from non-admins", async () => {
    const { bot, audit, api } = makeBot();
    await (bot as unknown as { onCallback: (id: string, from: { id: number }, data: string) => Promise<void> }).onCallback(
      "cb", USER_A, "ra:approve:0f0e0d0c-0000-4000-8000-000000000001",
    );
    expect(audit.decide).not.toHaveBeenCalled();
    expect(api.answerCallbackQuery).toHaveBeenCalledWith("cb", "Not allowed.");
  });

  it("notifies the participant with points when the engine reports an approval", async () => {
    const { bot, api, prisma } = makeBot();
    await (bot as unknown as { notifyParticipantApproval: (p: string, c: string, pts: number) => Promise<void> })
      .notifyParticipantApproval("p-1", "CHM 101", 1);
    expect(api.sendMessage).toHaveBeenCalledWith(
      111,
      expect.stringContaining("+1 point"),
    );
  });
});

describe("TelegramBotService — community silence", () => {
  it("never replies to a member-join service message in the group", async () => {
    const { bot, api } = makeBot();
    // Telegram delivers a join as a message with new_chat_members and NO text.
    const joinUpdate = {
      update_id: 1,
      message: {
        message_id: 10,
        from: { id: 555, is_bot: false, first_name: "Newbie" },
        chat: { id: -1004392553526, type: "supergroup", title: "Matriq Waitlist" },
        date: Math.floor(Date.now() / 1000),
        new_chat_members: [{ id: 555, is_bot: false, first_name: "Newbie" }],
      },
    } as never;
    await (bot as unknown as { handleUpdate: (u: never) => Promise<void> }).handleUpdate(joinUpdate);
    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it("ignores ordinary chatter in the group (only commands get answers)", async () => {
    const { bot, api } = makeBot();
    const chatter = {
      update_id: 2,
      message: {
        message_id: 11,
        from: { id: 555, is_bot: false, first_name: "Newbie" },
        chat: { id: -1004392553526, type: "supergroup", title: "Matriq Waitlist" },
        date: Math.floor(Date.now() / 1000),
        text: "hello everyone",
      },
    } as never;
    await (bot as unknown as { handleUpdate: (u: never) => Promise<void> }).handleUpdate(chatter);
    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it("still answers commands typed in the group (e.g. /leaderboard)", async () => {
    const { bot, api, campaign } = makeBot();
    campaign.leaderboard.mockResolvedValue([]);
    const command = {
      update_id: 3,
      message: {
        message_id: 12,
        from: { id: 555, is_bot: false, first_name: "Newbie" },
        chat: { id: -1004392553526, type: "supergroup", title: "Matriq Waitlist" },
        date: Math.floor(Date.now() / 1000),
        text: "/leaderboard",
      },
    } as never;
    await (bot as unknown as { handleUpdate: (u: never) => Promise<void> }).handleUpdate(command);
    expect(api.sendMessage).toHaveBeenCalled();
  });
});
