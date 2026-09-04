import { Injectable, ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { EntitlementService } from "../entitlement/entitlement.service";

/**
 * Quickie free-tier limits — server-enforced daily question cap.
 *
 * Product rule: Quickie answers are free within a generous daily budget;
 * the cap exists to bound cloud-AI cost, not to nag students. Cache hits
 * NEVER count (they cost the platform nothing), premium (Magic Plus) users
 * are unlimited, and offline (on-device) answering is client-side and can't
 * be capped — which is by design: it costs nothing and drives adoption.
 *
 * Accounting basis: ai_query_logs rows where cached = false (one row per
 * real generation; the streaming path logs on completion). The counter
 * resets at midnight UTC like every other daily quota in the platform.
 */
@Injectable()
export class AiQuotaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly entitlements: EntitlementService,
  ) {}

  private get freeDaily(): number {
    const raw = Number(this.config.get<string>("QUICKIE_FREE_DAILY"));
    return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 20;
  }

  async status(userId: string): Promise<{
    isPremium: boolean;
    limit: number | null;
    usedToday: number;
    remainingToday: number | null;
  }> {
    const ent = await this.entitlements.status(userId);
    if (ent.isPremium) {
      return { isPremium: true, limit: null, usedToday: 0, remainingToday: null };
    }
    const used = await this.usedToday(userId);
    return {
      isPremium: false,
      limit: this.freeDaily,
      usedToday: used,
      remainingToday: Math.max(0, this.freeDaily - used),
    };
  }

  /**
   * Authorize a real (non-cached) generation. Throws 403 with code
   * QUICKIE_LIMIT when a free user is out of today's budget.
   */
  async authorize(userId: string): Promise<void> {
    const ent = await this.entitlements.status(userId);
    if (ent.isPremium) return;
    const used = await this.usedToday(userId);
    if (used >= this.freeDaily) {
      throw new ForbiddenException({
        code: "QUICKIE_LIMIT",
        message: `You've used all ${this.freeDaily} free questions for today. Offline questions on your phone are always unlimited — and Magic Plus removes the daily cap.`,
        retryable: false,
      });
    }
  }

  private async usedToday(userId: string): Promise<number> {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    return this.prisma.aiQueryLog.count({
      where: { userId, cached: false, createdAt: { gte: start } },
    });
  }
}
