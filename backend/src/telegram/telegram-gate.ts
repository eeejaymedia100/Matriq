import { Injectable, Logger } from "@nestjs/common";
import Redis from "ioredis";
import { ConfigService } from "@nestjs/config";
import { TelegramApi, TgChatMember } from "./telegram.api";
import { TelegramConfig } from "./telegram.config";

/**
 * Community gate — users must be members of the Matriq Telegram community
 * before the bot accepts uploads. Membership lookups are cached in Redis
 * (positive 10 min, negative 60 s) because getChatMember is rate-limited and
 * the same user gets checked on every upload attempt.
 */
@Injectable()
export class TelegramGate {
  private readonly logger = new Logger(TelegramGate.name);
  private readonly redis?: Redis;

  private static readonly CACHE_OK_TTL_SEC = 600;
  private static readonly CACHE_MISS_TTL_SEC = 60;

  constructor(
    private readonly config: TelegramConfig,
    private readonly api: TelegramApi,
    configService: ConfigService,
  ) {
    const redisUrl = configService.get<string>("REDIS_URL");
    if (redisUrl && redisUrl.length > 0) {
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 2,
        lazyConnect: false,
      });
      this.redis.on("error", (err) =>
        this.logger.warn(`gate redis error (degrading to uncached): ${err.message}`),
      );
    }
  }

  private cacheKey(telegramId: number): string {
    return `tg:member:${this.config.communityId}:${telegramId}`;
  }

  private isMember(status: TgChatMember["status"]): boolean {
    return status === "creator" || status === "administrator" || status === "member";
  }

  /**
   * Returns true when the user may upload. When the community id is not
   * configured the gate is open (development posture) — production sets
   * TELEGRAM_COMMUNITY_ID.
   */
  async canUpload(telegramId: number): Promise<boolean> {
    const communityId = this.config.communityId;
    if (!communityId) return true;

    if (this.redis && this.redis.status === "ready") {
      try {
        const cached = await this.redis.get(this.cacheKey(telegramId));
        if (cached === "1") return true;
        if (cached === "0") return false;
      } catch {
        // Cache miss on error — fall through to the live check.
      }
    }

    const member = await this.api.getChatMember(communityId, telegramId);
    const allowed = member !== null && this.isMember(member.status);

    if (this.redis && this.redis.status === "ready") {
      const ttl = allowed
        ? TelegramGate.CACHE_OK_TTL_SEC
        : TelegramGate.CACHE_MISS_TTL_SEC;
      try {
        await this.redis.set(this.cacheKey(telegramId), allowed ? "1" : "0", "EX", ttl);
      } catch {
        // Non-fatal.
      }
    }
    return allowed;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit().catch(() => undefined);
    }
  }
}
