import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { FcmService } from "./fcm.service";

export interface PushParams {
  topic: string;
  title: string;
  message: string;
  tags?: string[];
  priority?: number; // ntfy priority 1 (min) .. 5 (max); default 3
  clickUrl?: string;
}

/**
 * Push notifications. Two delivery channels, one intent:
 *
 *  1. REAL device push via FCM (NotificationsService now routes to the
 *     student's registered devices — the app requests permission at launch,
 *     registers its token, and notifications appear above every screen and
 *     even when the app is closed). This is the primary channel when FCM is
 *     configured.
 *  2. Self-hosted ntfy topic push (https://ntfy.sh) as a legacy/fallback
 *     channel — the existing association/user topics stay, so nothing that
 *     was subscribed through the ntfy app breaks, and ops alerts
 *     (securityAlert) keep using ntfy exclusively.
 *
 * Both channels are env-gated and every failure is logged and swallowed — a
 * notification problem must never break the business operation that
 * triggered it.
 *
 * Topic naming conventions (stable, derivable from ids only):
 *   matriq-assoc-<associationId>  — association-wide (announcements, payments)
 *   matriq-user-<userId>          — personal (verification outcomes)
 *   matriq-alerts                 — security/ops alerts (admin logins, etc.)
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly enabled: boolean;
  private readonly ntfyUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly fcm: FcmService,
  ) {
    this.enabled = this.configService.get<string>("NTFY_ENABLED") === "true";
    this.ntfyUrl = (
      this.configService.get<string>("NTFY_URL") ?? "http://ntfy:80"
    ).replace(/\/+$/, "");
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  // ── Device registration (from the app) ───────────────────────

  /** Validate + normalise a client-supplied platform string. */
  private static normalizePlatform(platform?: string): string {
    const p = (platform ?? "android").trim().toLowerCase();
    return p === "web" ? "web" : "android";
  }

  /**
   * Register (or re-register) a device token for a user. Idempotent upsert by
   * token — if the same device logs into a different account, the row simply
   * moves. Returns the stored token so the app can confirm.
   */
  async registerDevice(
    userId: string,
    token: string,
    platform?: string,
  ): Promise<{ token: string; registered: boolean }> {
    if (typeof token !== "string" || token.trim().length < 10 || token.trim().length > 512) {
      return { token, registered: false };
    }
    try {
      await this.prisma.pushDevice.upsert({
        where: { token: token.trim() },
        create: {
          userId,
          token: token.trim(),
          platform: NotificationsService.normalizePlatform(platform),
        },
        update: { userId, lastSeenAt: new Date() },
      });
      return { token: token.trim(), registered: true };
    } catch (err) {
      this.logger.warn(
        `Failed to register push device: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { token: token.trim(), registered: false };
    }
  }

  /** Remove a device token (logout / token no longer wanted). */
  async unregisterDevice(userId: string, token?: string): Promise<{ removed: boolean }> {
    if (!token || typeof token !== "string") return { removed: false };
    try {
      await this.prisma.pushDevice.deleteMany({
        where: { token, userId }, // only the owner's own token
      });
      return { removed: true };
    } catch {
      return { removed: false };
    }
  }

  // ── Delivery ─────────────────────────────────────────────────

  /** Send a push to a single user's devices (FCM) with ntfy fallback. */
  notifyUser(
    userId: string,
    title: string,
    message: string,
    opts: { tags?: string[]; priority?: number; clickUrl?: string; data?: Record<string, string> } = {},
  ): Promise<boolean> {
    return this.pushToDevices(
      [{ userId }],
      { title, message, tags: opts.tags, priority: opts.priority, clickUrl: opts.clickUrl, data: opts.data },
      { topic: `matriq-user-${userId}`, title, message, tags: opts.tags, priority: opts.priority, clickUrl: opts.clickUrl },
    );
  }

  /** Send a push to every live member's devices (FCM) with ntfy fallback. */
  notifyAssociation(
    associationId: string,
    title: string,
    message: string,
    opts: { tags?: string[]; priority?: number; clickUrl?: string; data?: Record<string, string> } = {},
  ): Promise<boolean> {
    return this.pushToDevices(
      [{ associationId }],
      { title, message, tags: opts.tags, priority: opts.priority, clickUrl: opts.clickUrl, data: opts.data },
      { topic: `matriq-assoc-${associationId}`, title, message, tags: opts.tags, priority: opts.priority, clickUrl: opts.clickUrl },
    );
  }

  /** Security/ops alerting channel (admin failed logins, suspicious events). */
  securityAlert(
    title: string,
    message: string,
    opts: { tags?: string[]; priority?: number } = {},
  ): Promise<boolean> {
    return this.push({
      topic: "matriq-alerts",
      title,
      message,
      tags: opts.tags ?? ["warning"],
      priority: opts.priority ?? 4,
    });
  }

  /**
   * Route a push to the devices of a set of users (or all live members of an
   * association). FCM first when enabled; falls back to the legacy ntfy topic
   * push (no devices / FCM off / FCM failure). Dead tokens are pruned so we
   * never keep paying for uninstalled devices.
   */
  private async pushToDevices(
    targets: Array<{ userId?: string; associationId?: string }>,
    fcm: {
      title: string;
      message: string;
      tags?: string[];
      priority?: number;
      clickUrl?: string;
      data?: Record<string, string>;
    },
    ntfyFallback: PushParams,
  ): Promise<boolean> {
    let devices: Array<{ id: string; token: string }> = [];
    if (this.fcm.isEnabled) {
      try {
        if (targets.length === 1 && targets[0].userId) {
          devices = await this.prisma.pushDevice.findMany({
            where: { userId: targets[0].userId },
            select: { id: true, token: true },
          });
        } else {
          const memberIds = (
            await this.prisma.membership.findMany({
              where: {
                associationId: targets[0]?.associationId ?? undefined,
                status: "live",
              },
              select: { userId: true },
            })
          ).map((m) => m.userId);
          if (memberIds.length > 0) {
            devices = await this.prisma.pushDevice.findMany({
              where: { userId: { in: memberIds } },
              select: { id: true, token: true },
            });
          }
        }
      } catch (err) {
        this.logger.warn(
          `Push device lookup failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (devices.length > 0) {
        let delivered = 0;
        const dead: string[] = [];
        // Bounded concurrency — many members × many devices must not fan out
        // into hundreds of parallel HTTP calls.
        const CONCURRENCY = 8;
        let index = 0;
        const workers = Array.from({ length: CONCURRENCY }, async () => {
          while (index < devices.length) {
            const device = devices[index++];
            const result = await this.fcm.send(device.token, {
              title: fcm.title,
              body: fcm.message,
              data: fcm.data,
            });
            if (result === "sent") delivered++;
            else if (result === "invalid") dead.push(device.id);
          }
        });
        await Promise.all(workers);

        if (dead.length > 0) {
          try {
            await this.prisma.pushDevice.deleteMany({ where: { id: { in: dead } } });
            this.logger.log(`Pruned ${dead.length} dead push device token(s)`);
          } catch {
            // Non-fatal — pruning is best-effort.
          }
        }
        if (delivered > 0) return true;
        this.logger.warn(
          `FCM delivery failed for ${devices.length} device(s) — falling back to ntfy`,
        );
      }
    }
    // Legacy/fallback: the ntfy topic push.
    return this.push(ntfyFallback);
  }

  /**
   * Raw push to an arbitrary ntfy topic. Never throws.
   * @returns true if the push was delivered.
   */
  async push(params: PushParams): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const headers: Record<string, string> = {
          "Content-Type": "text/plain",
          Title: NotificationsService.toHeaderValue(params.title, 200),
          Priority: String(params.priority ?? 3),
        };
        const tags = params.tags ?? [];
        if (tags.length > 0) {
          headers.Tags = tags
            .map((t) => NotificationsService.toHeaderValue(t, 50))
            .join(",");
        }
        if (params.clickUrl) {
          headers.Click = NotificationsService.toHeaderValue(
            params.clickUrl,
            500,
          );
        }

        const res = await fetch(`${this.ntfyUrl}/${params.topic}`, {
          method: "POST",
          headers,
          body: params.message.slice(0, 4000),
          signal: controller.signal,
        });

        if (!res.ok) {
          this.logger.warn(
            `ntfy push to ${params.topic} failed: HTTP ${res.status}`,
          );
          return false;
        }
        this.logger.log(`ntfy push sent to ${params.topic}: ${params.title}`);
        return true;
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      this.logger.warn(
        `ntfy push error: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  /**
   * ntfy headers flow through fetch()'s ByteString conversion, which rejects
   * any character above U+00FF (e.g. emoji in a title). Strip non-Latin-1
   * characters so a decorative emoji can never break a notification.
   */
  private static toHeaderValue(value: string, maxLen: number): string {
    return value.replace(/[^\x00-\xff]/g, "").slice(0, maxLen);
  }
}
