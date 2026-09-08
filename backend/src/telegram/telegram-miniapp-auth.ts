import { createHmac, timingSafeEqual } from "crypto";
import { Injectable, Logger } from "@nestjs/common";
import { TelegramConfig } from "./telegram.config";
import { TgUser } from "./telegram.api";

/**
 * Mini App authentication — validates Telegram's `initData` payload.
 *
 * Telegram signs initData with HMAC-SHA256:
 *   secret_key  = HMAC_SHA256(key="WebAppData", message=bot_token)
 *   hash        = HMAC_SHA256(key=secret_key,    message=data_check_string)
 *   data_check_string = newline-joined "key=value" pairs (hash excluded),
 *   sorted by key.
 *
 * Telegram's documentation and client implementations have shipped variants
 * of this scheme: whether values are signed decoded or still URL-encoded,
 * and whether the newer `signature` field participates in the check string.
 * A payload is genuine if its hash verifies under ANY documented variant —
 * every variant is a full HMAC under the bot token, so acceptance is never
 * weakened. The matched variant is logged; a total failure logs enough to
 * diagnose the next mismatch offline.
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
  private readonly logger = new Logger(TelegramMiniAppAuth.name);

  constructor(private readonly config: TelegramConfig) {}

  validateInitData(initData: string): MiniAppSession | null {
    // Every rejection logs its reason — webview-only auth failures are
    // otherwise undiagnosable from the server side.
    const fail = (reason: string): null => {
      this.logger.warn(`initData rejected: ${reason}`);
      return null;
    };

    const botToken = this.config.botToken;
    if (!botToken || !initData) return fail("missing bot token or initData");

    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return fail("hash field missing");

    // 1. Verify the HMAC against every documented signing variant.
    //    Raw pairs preserve the exact encoding the client signed; decoded
    //    pairs are the canonical documented form. `signature` is excluded
    //    or included per variant (newer clients sign it too).
    const rawPairs = initData.split("&").filter(Boolean);
    const decodedPairs: string[] = [];
    params.forEach((value, key) => decodedPairs.push(`${key}=${value}`));

    const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
    const given = Buffer.from(hash, "hex");

    const checkStringVariants: Array<{ name: string; pairs: string[] }> = [];
    for (const [form, pairs] of [
      ["decoded", decodedPairs],
      ["raw", rawPairs],
    ] as const) {
      for (const excludeSig of [true, false]) {
        checkStringVariants.push({
          name: `${form}${excludeSig ? "-nosig" : "-withsig"}`,
          pairs: pairs.filter(
            (p) =>
              !p.startsWith("hash=") &&
              (excludeSig || !p.startsWith("signature=")),
          ),
        });
      }
    }

    let matchedVariant: string | null = null;
    for (const variant of checkStringVariants) {
      const dataCheckString = variant.pairs.sort().join("\n");
      const expected = createHmac("sha256", secretKey)
        .update(dataCheckString)
        .digest();
      if (
        given.length === expected.length &&
        timingSafeEqual(given, expected)
      ) {
        matchedVariant = variant.name;
        break;
      }
    }
    if (!matchedVariant) {
      return fail(
        `hash mismatch under all variants (botTokenId=${botToken.split(":")[0]}, keys=${decodedPairs.length}, len=${initData.length}, head=${initData.slice(0, 80)})`,
      );
    }
    this.logger.log(`initData verified via variant ${matchedVariant}`);

    // 3. Freshness check — reject replayed initData.
    const authDate = Number(params.get("auth_date"));
    const age = Math.floor(Date.now() / 1000) - authDate;
    if (!Number.isFinite(authDate) || age > AUTH_TTL_SECONDS) {
      return fail(`stale or invalid auth_date (age=${age}s)`);
    }

    let user: TgUser | null = null;
    try {
      user = JSON.parse(params.get("user") ?? "null") as TgUser | null;
    } catch {
      return fail("user field unparsable");
    }
    if (!user?.id) return fail("user id missing");

    return {
      telegramId: String(user.id),
      telegramUsername: user.username ?? null,
      scope: "telegram_miniapp",
    };
  }
}
