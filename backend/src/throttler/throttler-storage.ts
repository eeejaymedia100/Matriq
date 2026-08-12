import { Logger } from "@nestjs/common";
import { ThrottlerStorage } from "@nestjs/throttler";
import { ThrottlerStorageRedisService } from "nestjs-throttler-storage-redis";
import Redis from "ioredis";

/**
 * The record shape `ThrottlerStorage.increment` must return. Not re-exported
 * from the @nestjs/throttler package index, so declared here (matches
 * throttler-storage-record.interface.d.ts).
 */
interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * In-memory fallback entry — mirrors the semantics of Nest's default
 * ThrottlerStorageService (per-key hit counters with expiry + block window).
 */
interface MemoryEntry {
  hits: Map<string, number>;
  expiresAt: number;
  blockedUntil: number;
}

/**
 * Resilient throttler storage.
 *
 * Uses Redis (shared across all cluster workers) when it is reachable, and
 * transparently falls back to a per-process in-memory implementation if Redis
 * is down or unconfigured — rate limiting must never take the API down with
 * it. In-memory fallback means limits are enforced per worker, which is still
 * correct, just slightly more permissive under clustering.
 */
export class ResilientThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger("ThrottlerStorage");
  private readonly redis?: ThrottlerStorageRedisService;
  private readonly memory = new Map<string, MemoryEntry>();
  private redisHealthy = false;
  /** Cooldown before retrying Redis after a failure, so a dead Redis isn't
   *  hit on every request (each attempt is a wasted round-trip + log line). */
  private redisRetryAfter = 0;
  private static readonly REDIS_RETRY_COOLDOWN_MS = 5_000;

  constructor() {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      try {
        const client = new Redis(redisUrl, {
          // Fail fast so a down Redis never hangs a throttled request.
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          // Keep reconnecting in the background so the storage recovers the
          // moment Redis is back, without a process restart.
          retryStrategy: (times) => Math.min(times * 500, 5_000),
        });
        client.on("error", () => {
          this.redisHealthy = false;
          this.redisRetryAfter =
            Date.now() + ResilientThrottlerStorage.REDIS_RETRY_COOLDOWN_MS;
        });
        client.on("ready", () => {
          if (!this.redisHealthy) {
            this.redisHealthy = true;
            this.logger.log("Redis throttler storage reconnected");
          }
        });
        this.redis = new ThrottlerStorageRedisService(client);
        this.logger.log("Throttler storage: Redis (shared across workers)");
      } catch (err) {
        this.logger.warn(
          `Failed to initialize Redis throttler storage: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else {
      this.logger.warn(
        "REDIS_URL not set — throttling is in-memory only (per-process limits)",
      );
    }
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    // Try Redis when healthy, or once the retry cooldown has elapsed (the
    // background retryStrategy may also flip redisHealthy via 'ready').
    if (
      this.redis &&
      (this.redisHealthy || Date.now() >= this.redisRetryAfter)
    ) {
      try {
        const result = await this.redis.increment(
          key,
          ttl,
          limit,
          blockDuration,
          throttlerName,
        );
        this.redisHealthy = true;
        return result;
      } catch (err) {
        this.redisHealthy = false;
        this.redisRetryAfter =
          Date.now() + ResilientThrottlerStorage.REDIS_RETRY_COOLDOWN_MS;
        this.logger.warn(
          `Redis throttler call failed — using in-memory fallback: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return this.incrementMemory(key, ttl, limit, blockDuration, throttlerName);
  }

  /** Bounded in-memory implementation of the same increment semantics. */
  private incrementMemory(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): ThrottlerStorageRecord {
    const now = Date.now();

    // Opportunistic sweep so the map can't grow unbounded in long-lived workers.
    if (this.memory.size > 10_000) {
      for (const [k, v] of this.memory) {
        if (v.expiresAt <= now && v.blockedUntil <= now) {
          this.memory.delete(k);
        }
      }
    }

    let entry = this.memory.get(key);
    if (!entry || entry.expiresAt <= now) {
      entry = { hits: new Map(), expiresAt: now + ttl, blockedUntil: 0 };
      this.memory.set(key, entry);
    }

    const hits = entry.hits.get(throttlerName) ?? 0;
    const timeToExpire = Math.max(1, Math.ceil((entry.expiresAt - now) / 1000));

    // A previous block has expired: give the key a fresh window instead of
    // re-blocking instantly (matches Nest's reset-on-block-expiry semantics).
    if (entry.blockedUntil > 0 && entry.blockedUntil <= now) {
      entry.hits.set(throttlerName, 0);
      entry.blockedUntil = 0;
    }

    if (entry.blockedUntil > now) {
      return {
        totalHits: hits,
        timeToExpire,
        isBlocked: true,
        timeToBlockExpire: Math.max(
          0,
          Math.ceil((entry.blockedUntil - now) / 1000),
        ),
      };
    }

    const newHits = hits + 1;
    entry.hits.set(throttlerName, newHits);

    if (newHits > limit) {
      entry.blockedUntil = now + blockDuration;
      return {
        totalHits: newHits,
        timeToExpire,
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockDuration / 1000),
      };
    }

    return {
      totalHits: newHits,
      timeToExpire,
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }
}
