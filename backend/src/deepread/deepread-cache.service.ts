import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

/**
 * Deep Read result cache — keyed by the SHA-256 of the original page upload.
 *
 * A cached page NEVER re-bills the vision API: retries, crash-recovery
 * re-runs and re-uploads of the same photo all hit this cache. Entries are
 * JSON records of {text, tier, confidence, truncated}.
 *
 * Backend: Redis when REDIS_URL is set (survives restarts, shared across
 * replicas), otherwise an in-process LRU-ish map (single-instance deploys).
 * Every Redis call is wrapped — a down Redis degrades to the memory cache,
 * never breaks a job.
 */

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const MEMORY_MAX_ENTRIES = 2000;

export interface CachedOcr {
  text: string;
  tier: "deep_read" | "rescue";
  confidence: number | null;
  truncated: boolean;
}

@Injectable()
export class DeepReadCacheService {
  private readonly logger = new Logger(DeepReadCacheService.name);
  private readonly redis?: Redis;
  private readonly memory = new Map<string, { value: CachedOcr; at: number }>();

  constructor(configService: ConfigService) {
    const redisUrl = configService.get<string>("REDIS_URL")?.trim();
    if (redisUrl) {
      try {
        this.redis = new Redis(redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          connectTimeout: 3000,
        });
        this.redis.on("error", () => {
          /* degrade to memory — logged once by connection state */
        });
        void this.redis.connect().catch(() => {
          this.logger.warn("Deep Read cache: Redis unavailable, using memory cache");
        });
      } catch {
        this.logger.warn("Deep Read cache: Redis init failed, using memory cache");
      }
    }
  }

  private keyOf(contentHash: string): string {
    return `matriq:deepread:ocr:${contentHash}`;
  }

  async get(contentHash: string): Promise<CachedOcr | null> {
    const key = this.keyOf(contentHash);
    if (this.redis) {
      try {
        const raw = await this.redis.get(key);
        if (raw) {
          this.touchMemory(contentHash, JSON.parse(raw) as CachedOcr);
          return (JSON.parse(raw) as CachedOcr) ?? null;
        }
      } catch {
        /* fall through to memory */
      }
    }
    const hit = this.memory.get(contentHash);
    if (!hit) return null;
    // Memory entries honour the same TTL.
    if (Date.now() - hit.at > CACHE_TTL_SECONDS * 1000) {
      this.memory.delete(contentHash);
      return null;
    }
    return hit.value;
  }

  async set(contentHash: string, value: CachedOcr): Promise<void> {
    this.touchMemory(contentHash, value);
    if (this.redis) {
      try {
        await this.redis.set(
          this.keyOf(contentHash),
          JSON.stringify(value),
          "EX",
          CACHE_TTL_SECONDS,
        );
      } catch {
        /* memory copy already saved the result */
      }
    }
  }

  private touchMemory(contentHash: string, value: CachedOcr) {
    if (this.memory.size >= MEMORY_MAX_ENTRIES) {
      // Evict the oldest entry (Map preserves insertion order).
      const oldest = this.memory.keys().next().value;
      if (oldest) this.memory.delete(oldest);
    }
    this.memory.set(contentHash, { value, at: Date.now() });
  }
}
