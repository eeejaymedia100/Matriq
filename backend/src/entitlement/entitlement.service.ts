import {
  Injectable,
  Logger,
  ForbiddenException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Magic Plus entitlements — the AUTHORITY for premium access.
 *
 * The mobile app may *display* cached entitlement state, but it is never the
 * final word for paid cloud usage: every premium (cloud-AI, cost-incurring)
 * request is authorised here, server-side. A client-provided premium flag is
 * never trusted.
 *
 * Sources:
 *   - free_allowance — every new user gets a starter allowance of free cloud
 *     Focus Mode generations (FOCUS_FREE_ALLOWANCE, default 10). NOT premium.
 *   - subscription / pass / grant — a paying (or operator-granted) Magic Plus
 *     entitlement. Currently no payment provider is wired; the model is ready
 *     so future providers set `source` without touching callers.
 */

const PREMIUM_SOURCES = ["subscription", "pass", "grant"];

export interface EntitlementStatus {
  /** True when the user has a Magic Plus entitlement (status active). */
  entitled: boolean;
  isPremium: boolean;
  plan: string | null;
  source: string | null;
  /** Remaining free cloud generations. null when premium/unlimited. */
  freeRemaining: number | null;
  freeUsed: number;
  freeLimit: number;
  expiresAt: string | null;
}

@Injectable()
export class EntitlementService {
  private readonly logger = new Logger(EntitlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /** Default free cloud generation allowance for new users. */
  get defaultFreeAllowance(): number {
    const raw = Number(this.configService.get<string>("FOCUS_FREE_ALLOWANCE"));
    return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 10;
  }

  private isPremiumSource(source: string | null): boolean {
    return source !== null && PREMIUM_SOURCES.includes(source);
  }

  /** Ensure one entitlement row exists per user (created lazily). */
  private async ensureRow(userId: string) {
    const existing = await this.prisma.magicPlusEntitlement.findUnique({
      where: { userId },
    });
    if (existing) return existing;
    try {
      return await this.prisma.magicPlusEntitlement.create({
        data: {
          userId,
          source: "free_allowance",
          freeGenerationLimit: this.defaultFreeAllowance,
          freeGenerationsUsed: 0,
        },
      });
    } catch (err) {
      // Race (two parallel ensures) → re-read.
      return this.prisma.magicPlusEntitlement.findUniqueOrThrow({
        where: { userId },
      });
    }
  }

  /** Compute the user's entitlement status (for display + server checks). */
  async status(userId: string): Promise<EntitlementStatus> {
    const row = await this.ensureRow(userId);
    const active = row.status === "active";
    const premium = active && this.isPremiumSource(row.source);
    return {
      entitled: active,
      isPremium: premium,
      plan: row.plan,
      source: row.source,
      // When the entitlement is a paid/granted source there is no "free"
      // allowance left to report — the user is unlimited.
      freeRemaining: premium
        ? null
        : Math.max(0, row.freeGenerationLimit - row.freeGenerationsUsed),
      freeUsed: row.freeGenerationsUsed,
      freeLimit: row.freeGenerationLimit,
      expiresAt: row.expiresAt?.toISOString() ?? null,
    };
  }

  /**
   * Authorize a cloud Focus Mode generation. Returns the updated entitlement
   * status on success. Throws ForbiddenException (MAGIC_PLUS_REQUIRED) when a
   * non-premium user has exhausted their free allowance.
   */
  async authorizeGeneration(userId: string): Promise<EntitlementStatus> {
    const row = await this.ensureRow(userId);

    if (row.status !== "active") {
      throw new ForbiddenException({
        code: "MAGIC_PLUS_BLOCKED",
        message: "Your Magic Plus entitlement is not active right now.",
      });
    }

    if (this.isPremiumSource(row.source)) {
      // Paid/granted Magic Plus — unlimited by allowance.
      return this.status(userId);
    }

    if (row.freeGenerationsUsed < row.freeGenerationLimit) {
      const updated = await this.prisma.magicPlusEntitlement.update({
        where: { userId },
        data: { freeGenerationsUsed: { increment: 1 } },
      });
      void this.logger.log(
        `Focus Mode free generation ${updated.freeGenerationsUsed}/${updated.freeGenerationLimit} used by user ${userId}`,
      );
      return this.status(userId);
    }

    throw new ForbiddenException({
      code: "MAGIC_PLUS_REQUIRED",
      message:
        "You've used your free Focus Mode generations. Focus Mode is a Magic Plus feature — open Focus Mode in the app to see your options.",
      retryable: false,
    });
  }

  /**
   * Grant a real (paid-style) Magic Plus entitlement. Used by future payment
   * providers and operator admin actions. Idempotent for the same source.
   */
  async grant(
    userId: string,
    opts: {
      source: "subscription" | "pass" | "grant";
      plan?: string;
      expiresAt?: Date;
    },
  ): Promise<void> {
    await this.ensureRow(userId);
    await this.prisma.magicPlusEntitlement.upsert({
      where: { userId },
      create: {
        userId,
        plan: opts.plan ?? "magic_plus",
        source: opts.source,
        status: "active",
        expiresAt: opts.expiresAt,
        freeGenerationLimit: 0,
        freeGenerationsUsed: this.defaultFreeAllowance,
      },
      update: {
        plan: opts.plan ?? "magic_plus",
        source: opts.source,
        status: "active",
        expiresAt: opts.expiresAt,
      },
    });
    void this.logger.log(
      `Magic Plus ${opts.source} granted to user ${userId}`,
    );
  }

  /** Revoke an entitlement (refund / expiry sweep / abuse). */
  async revoke(userId: string): Promise<void> {
    await this.prisma.magicPlusEntitlement.update({
      where: { userId },
      data: { status: "cancelled", expiresAt: new Date() },
    });
    void this.logger.warn(`Magic Plus entitlement revoked for user ${userId}`);
  }
}