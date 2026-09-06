import { createHmac, timingSafeEqual } from "crypto";
import { Injectable } from "@nestjs/common";
import { TelegramConfig } from "./telegram.config";
import { TgUser } from "./telegram.api";

/**
 * Mini App authentication — validates Telegram's `initData` payload.
 *
 * Telegram signs initData with HMAC-SHA256:
 *   secret_key  = HMAC_SHA256(key="WebAppData", message=bot_token)
 *   hash        = HMAC_SHA256(key=secret_key,    message=data_check_string)
 *   data_check_string = newline-joined "key=value" pairs (hash and signature
 *   excluded), sorted by key. (Mini App initData uses plain pairs — the
 *   backslash-escaping rule applies only to the third-party Login Widget.)
 *
 * A valid initData only proves "this request came from Telegram as this
 * Telegram user". It does NOT identify a Matriq account, so the Mini App
 * session is scoped: `{ telegramId, scope: "telegram_miniapp" }`. The Matriq
 * account link (if any) is resolved server-side by telegramId.
 */
export interface MiniAppSession {
  telegramId: string;
  telegramUsername: string | null;
  scope: "telegram_miniapp";
}

const AUTH_TTL_SECONDS = 86400; // initData is valid for 24h per Telegram docs.

@Injectable()
export class TelegramMiniAppAuth {
  constructor(private readonly config: TelegramConfig) {}

  validateInitData(initData: string): MiniAppSession | null {
    const botToken = this.config.botToken;
    if (!botToken || !initData) return null;

    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;

    // 1. Build data_check_string: every pair except hash/signature, sorted.
    const pairs: string[] = [];
    params.forEach((value, key) => {
      if (key === "hash" || key === "signature") return;
      pairs.push(`${key}=${value}`);
    });
    pairs.sort();
    const dataCheckString = pairs.join("\n");

    // 2. Derive the key from the bot token, then verify the HMAC.
    const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
    const expected = createHmac("sha256", secretKey).update(dataCheckString).digest();

    const given = Buffer.from(hash, "hex");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return null;
    }

    // 3. Freshness check — reject replayed initData.
    const authDate = Number(params.get("auth_date"));
    if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > AUTH_TTL_SECONDS) {
      return null;
    }

    let user: TgUser | null = null;
    try {
      user = JSON.parse(params.get("user") ?? "null") as TgUser | null;
    } catch {
      return null;
    }
    if (!user?.id) return null;

    return {
      telegramId: String(user.id),
      telegramUsername: user.username ?? null,
      scope: "telegram_miniapp",
    };
  }
}
