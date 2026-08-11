import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface PushParams {
  topic: string;
  title: string;
  message: string;
  tags?: string[];
  priority?: number; // ntfy priority 1 (min) .. 5 (max); default 3
  clickUrl?: string;
}

/**
 * Push notifications via a self-hosted ntfy server (https://ntfy.sh).
 *
 * Env-gated: everything no-ops unless NTFY_ENABLED=true, so an unconfigured
 * deployment is completely unaffected. All failures are logged and swallowed —
 * a notification problem must never break the business operation that
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

  constructor(private readonly configService: ConfigService) {
    this.enabled = this.configService.get<string>("NTFY_ENABLED") === "true";
    this.ntfyUrl = (
      this.configService.get<string>("NTFY_URL") ?? "http://ntfy:80"
    ).replace(/\/+$/, "");
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Send a push to an association-wide topic. */
  notifyAssociation(
    associationId: string,
    title: string,
    message: string,
    opts: { tags?: string[]; priority?: number; clickUrl?: string } = {},
  ): Promise<boolean> {
    return this.push({
      topic: `matriq-assoc-${associationId}`,
      title,
      message,
      ...opts,
    });
  }

  /** Send a push to a single user's personal topic. */
  notifyUser(
    userId: string,
    title: string,
    message: string,
    opts: { tags?: string[]; priority?: number; clickUrl?: string } = {},
  ): Promise<boolean> {
    return this.push({
      topic: `matriq-user-${userId}`,
      title,
      message,
      ...opts,
    });
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
   * Raw push to an arbitrary topic. Never throws.
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
          Title: params.title.slice(0, 200),
          Priority: String(params.priority ?? 3),
        };
        const tags = params.tags ?? [];
        if (tags.length > 0) headers.Tags = tags.join(",");
        if (params.clickUrl) headers.Click = params.clickUrl.slice(0, 500);

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
}
