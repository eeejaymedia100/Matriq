/** End-to-end /scan flow check: real bot service + real OCR + real corrector. Telegram sends are logged, not sent. */
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });
const sharp = require("sharp");
const { TelegramBotService } = require("../dist/telegram/telegram-bot.service.js");
const { ToolsService } = require("../dist/tools/tools.service.js");

const WORDS = [["The", 40], ["quantm", 200], ["thoery", 420], ["of", 640], ["moton", 790], ["expains", 1030], ["nergy.", 1270]];
const svg =
  '<svg width="1500" height="260" xmlns="http://www.w3.org/2000/svg">' +
  '<rect width="100%" height="100%" fill="white"/>' +
  WORDS.map(([w, x]) => '<text x="' + x + '" y="140" font-family="DejaVu Sans" font-size="52" fill="black">' + w + "</text>").join("") +
  "</svg>";

const mem = new Map();
const fakeRedis = {
  async get(k) { return mem.get(k) ?? null; },
  async set(k, v) { mem.set(k, v); return "OK"; },
  async del(...ks) { let n = 0; for (const k of ks) n += mem.delete(k) ? 1 : 0; return n; },
  async incr(k) { const v = Number(mem.get(k) ?? 0) + 1; mem.set(k, String(v)); return v; },
  async expire() { return 1; },
  on() { return this; },
};

(async () => {
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const sent = [];
  const api = {
    downloadFileById: async (id) => (id === "photo-1" ? png : null),
    sendMessage: async (chatId, text, markup) => {
      sent.push(text);
      console.log("\n-> sendMessage(" + chatId + "):\n" + text);
      if (markup) console.log("[buttons] " + JSON.stringify(markup));
      return {};
    },
    answerCallbackQuery: async () => {},
  };
  const bot = new TelegramBotService(
    { isConfigured: true, isTelegramAdmin: () => false },
    {},
    { getParticipant: async () => null },
    {},
    { canUpload: async () => false },
    api,
    new ToolsService(),
    { get: () => undefined },
  );
  bot.redis = fakeRedis;

  const msg = (id, caption) => ({
    update_id: id,
    message: {
      message_id: id,
      from: { id: 42, first_name: "Tester" },
      chat: { id: 42, type: "private" },
      date: Math.floor(Date.now() / 1000),
      photo: [{ file_id: "photo-1", width: 1500, height: 260 }],
      ...(caption ? { caption } : {}),
    },
  });

  console.log("=== 1. photo with /scan caption ===");
  await bot.handleUpdate(msg(1, "/scan"));

  console.log("\n=== 2. plain photo (sticky scan mode) ===");
  await bot.handleUpdate(msg(2));

  console.log("\n=== 3. scan:original callback ===");
  await bot.onCallback("cb", { id: 42 }, "scan:original");

  const all = sent.join("\n");
  const ok = all.includes("Scan read.") && all.includes("Original OCR text") && /quantum|motion/.test(all);
  console.log("\n" + (ok ? "PASS - full /scan flow works end-to-end" : "CHECK - inspect output above"));
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
