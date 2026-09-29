/**
 * Standalone /scan test runner for the Matriq Telegram bot.
 *
 * Boots the REAL TelegramBotService with the REAL TelegramApi, REAL
 * ToolsService (Tesseract + Gemini-rescue OCR) and the REAL keyboard
 * auto-correction pass — only the campaign/audit/Prisma collaborators are
 * stubbed, and /scan never touches them. Long-polling + an in-memory
 * conversation store stand in for Redis (not installed here); PrismaClient
 * is never constructed, so no Postgres is needed.
 *
 * Usage:  node scripts/run-telegram-scan-bot.js   (from backend/)
 * Stop:   Ctrl+C  (pure polling — no webhook is ever registered)
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });

const { TelegramBotService } = require("../dist/telegram/telegram-bot.service.js");
const { TelegramApi } = require("../dist/telegram/telegram.api.js");
const { ToolsService } = require("../dist/tools/tools.service.js");

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN missing — cannot start.");
  process.exit(1);
}

// ── Config: real token + admin ids, polling only ────────────────────
const config = {
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  botUsername: process.env.TELEGRAM_BOT_USERNAME ?? "MatriqBot",
  communityId: process.env.TELEGRAM_COMMUNITY_ID ?? "",
  communityUrl: process.env.TELEGRAM_COMMUNITY_URL ?? "https://t.me/matriq_community",
  adminIds: (process.env.TELEGRAM_ADMIN_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  webhookUrl: "",
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? "",
  miniAppOrigins: [],
  miniAppUrl: "https://matriq.com.ng/telegram-miniapp/",
  isConfigured: true,
  isTelegramAdmin: (id) => config.adminIds.includes(String(id)),
};

// ── In-memory Redis stand-in (conversation state only) ──────────────
const memStore = new Map();
const fakeRedis = {
  status: "ready",
  async get(k) { return memStore.get(k) ?? null; },
  async set(k, v) { memStore.set(k, v); return "OK"; },
  async del(...ks) { let n = 0; for (const k of ks) n += memStore.delete(k) ? 1 : 0; return n; },
  async incr(k) { const v = Number(memStore.get(k) ?? 0) + 1; memStore.set(k, String(v)); return v; },
  async expire() { return 1; },
  async quit() { return undefined; },
  on() { return this; },
};

// ── Stubs for collaborators /scan never touches ─────────────────────
const noop = () => {};
const prismaStub = {};
const campaignStub = {
  ensureParticipant: async () => null,
  getParticipant: async () => null,
  markVerified: noop,
  setUniversity: noop,
  leaderboard: async () => [],
};
const auditStub = { submit: noop, decide: noop };
const gateStub = { canUpload: async () => false };

async function main() {
  const api = new TelegramApi(config.botToken, (m) => console.warn(`[tg] ${m}`));
  const tools = new ToolsService(); // real OCR: sharp → tesseract.js → Gemini rescue
  const bot = new TelegramBotService(
    config,
    prismaStub,
    campaignStub,
    auditStub,
    gateStub,
    api,
    tools,
    { get: () => undefined }, // no REDIS_URL → inject the in-memory store below
  );
  bot.redis = fakeRedis; // conversation state (sticky scan mode, original-text button)

  const me = await api.getMe();
  console.log(`[scan-runner] online as @${me.username} — real OCR engine + keyboard corrector, long-polling.`);
  console.log("[scan-runner] Open the bot in Telegram and send /scan, then a photo with /scan as the caption.");

  let offset = 0;
  for (;;) {
    try {
      const updates = await api.getUpdates(offset, 25);
      for (const u of updates) {
        offset = u.update_id + 1;
        await bot.handleUpdate(u).catch((e) =>
          console.error("[scan-runner] update failed:", e && e.message),
        );
      }
    } catch (e) {
      console.error("[scan-runner] poll error (retrying in 3s):", e && e.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

main().catch((e) => {
  console.error("[scan-runner] fatal:", e);
  process.exit(1);
});
