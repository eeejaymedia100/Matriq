import { createHmac } from "crypto";
import { TelegramMiniAppAuth } from "./telegram-miniapp-auth";

/**
 * Mini App initData validation — the security-critical HMAC check.
 * Test vectors are generated with the same algorithm Telegram documents;
 * the validator must accept genuine payloads and reject every tampering
 * vector (bad hash, wrong token, replay, missing user).
 */

const BOT_TOKEN = "123456:TEST-TOKEN";
const USER = { id: 987654, first_name: "Ada", username: "ada_lovelace" };

function makeConfig(token: string) {
  return { botToken: token } as never;
}

/** Build a signed initData payload exactly as Telegram would. */
function signInitData(params: Record<string, string>, token: string, withHash = true): string {
  const pairs = Object.entries(params).map(([k, v]) => `${k}=${v}`);
  const dataCheckString = pairs.sort().join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  const all = withHash ? { ...params, hash } : params;
  return new URLSearchParams(all).toString();
}

function freshInitData(token: string, authDate = Math.floor(Date.now() / 1000)): string {
  return signInitData(
    {
      user: JSON.stringify(USER),
      auth_date: String(authDate),
      query_id: "AAHtest123",
    },
    token,
  );
}

describe("TelegramMiniAppAuth", () => {
  const auth = new TelegramMiniAppAuth(makeConfig(BOT_TOKEN));

  it("accepts a genuine initData payload", () => {
    const session = auth.validateInitData(freshInitData(BOT_TOKEN));
    expect(session).not.toBeNull();
    expect(session!.telegramId).toBe("987654");
    expect(session!.telegramUsername).toBe("ada_lovelace");
    expect(session!.scope).toBe("telegram_miniapp");
  });

  it("rejects a payload signed with a different bot token", () => {
    const session = auth.validateInitData(freshInitData("999999:OTHER-TOKEN"));
    expect(session).toBeNull();
  });

  it("rejects a tampered payload (user id swapped after signing)", () => {
    const tampered = freshInitData(BOT_TOKEN).replace("987654", "111222");
    const session = auth.validateInitData(tampered);
    expect(session).toBeNull();
  });

  it("rejects a payload with the hash stripped", () => {
    const unsigned = signInitData(
      { user: JSON.stringify(USER), auth_date: String(Math.floor(Date.now() / 1000)) },
      BOT_TOKEN,
      false,
    );
    expect(auth.validateInitData(unsigned)).toBeNull();
  });

  it("rejects stale initData (older than 24h)", () => {
    const stale = freshInitData(BOT_TOKEN, Math.floor(Date.now() / 1000) - 86401);
    expect(auth.validateInitData(stale)).toBeNull();
  });

  it("rejects a payload without a user", () => {
    const noUser = signInitData(
      { auth_date: String(Math.floor(Date.now() / 1000)) },
      BOT_TOKEN,
    );
    expect(auth.validateInitData(noUser)).toBeNull();
  });

  it("returns null when the bot token is not configured", () => {
    const unconfigured = new TelegramMiniAppAuth(makeConfig(""));
    expect(unconfigured.validateInitData(freshInitData(BOT_TOKEN))).toBeNull();
  });
});
