import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createSign, createPrivateKey } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * Real device push via Firebase Cloud Messaging (HTTP v1 API), fully
 * self-hosted — the backend talks straight to Google, no third-party push
 * router in the middle.
 *
 * Env-gated like every other provider in this codebase: unless
 * FCM_ENABLED=true AND a service account is configured, everything no-ops and
 * the existing ntfy path stays the only push channel. Nothing here ever
 * throws to the caller — a push failure must never break the business
 * operation that triggered it.
 *
 * Config (all server-side secrets, never shipped to the app):
 *   FCM_ENABLED=true
 *   FCM_PROJECT_ID=<firebase project id>            (optional: falls back to
 *                                                     the service account's
 *                                                     project_id)
 *   FCM_SERVICE_ACCOUNT_B64=<base64 of the Firebase
 *       "service account key" JSON>                 (or FCM_SERVICE_ACCOUNT
 *                                                     as a path inside the
 *                                                     container)
 *
 * The access token is minted locally (RS256-signed JWT from the service
 * account private key, exchanged at Google's OAuth endpoint) and cached for
 * its lifetime — no per-message OAuth round-trip.
 */
@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);
  private readonly enabled: boolean;
  private readonly projectId: string | null;
  private readonly serviceAccount: ServiceAccount | null;
  private readonly oauthUrl: string;
  private accessTokenCache: { token: string; expiresAt: number } | null = null;

  constructor(private readonly configService: ConfigService) {
    this.enabled = this.configService.get<string>("FCM_ENABLED") === "true";
    this.serviceAccount = this.loadServiceAccount();
    this.projectId =
      this.configService.get<string>("FCM_PROJECT_ID")?.trim() ||
      this.serviceAccount?.project_id ||
      null;
    this.oauthUrl =
      this.serviceAccount?.token_uri ||
      "https://oauth2.googleapis.com/token";

    if (this.enabled && (!this.serviceAccount || !this.projectId)) {
      this.logger.warn(
        "FCM_ENABLED=true but service account / project id is missing — push will fall back to ntfy",
      );
      this.enabled = false;
    }
    if (this.enabled) {
      this.logger.log(`FCM push enabled (project ${this.projectId})`);
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Firebase "service account key" JSON (the file the Firebase console lets
   *  you download under Project settings → Service accounts). */
  private loadServiceAccount(): ServiceAccount | null {
    const b64 = this.configService.get<string>("FCM_SERVICE_ACCOUNT_B64");
    const path = this.configService.get<string>("FCM_SERVICE_ACCOUNT");
    let raw: string | null = null;
    if (b64) {
      try {
        raw = Buffer.from(b64, "base64").toString("utf8");
      } catch {
        this.logger.warn("FCM_SERVICE_ACCOUNT_B64 is not valid base64");
      }
    } else if (path) {
      try {
        raw = readFileSync(path, "utf8");
      } catch {
        this.logger.warn(`FCM_SERVICE_ACCOUNT file not readable: ${path}`);
      }
    }
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as ServiceAccount;
      if (!parsed.client_email || !parsed.private_key) return null;
      return parsed;
    } catch {
      this.logger.warn("FCM service account JSON could not be parsed");
      return null;
    }
  }

  /**
   * A short-lived Google OAuth2 access token for the firebase.messaging
   * scope, minted from the service account. Cached until near expiry.
   */
  private async getAccessToken(): Promise<string | null> {
    const account = this.serviceAccount;
    if (!account?.client_email || !account.private_key) return null;
    const now = Date.now();
    if (this.accessTokenCache && this.accessTokenCache.expiresAt - now > 60_000) {
      return this.accessTokenCache.token;
    }

    try {
      const iat = Math.floor(now / 1000);
      const header = { alg: "RS256", typ: "JWT" };
      const claims = {
        iss: account.client_email,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: this.oauthUrl,
        iat,
        exp: iat + 3600,
      };
      const b64 = (o: object) =>
        Buffer.from(JSON.stringify(o)).toString("base64url");
      const signingInput = `${b64(header)}.${b64(claims)}`;
      const signature = createSign("RSA-SHA256")
        .update(signingInput)
        .sign(createPrivateKey(account.private_key), "base64url");
      const jwt = `${signingInput}.${signature}`;

      const res = await fetch(this.oauthUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: jwt,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        this.logger.warn(
          `FCM OAuth token exchange failed: HTTP ${res.status}`,
        );
        return null;
      }
      const data = (await res.json()) as {
        access_token?: string;
        expires_in?: number;
      };
      if (!data.access_token) return null;
      this.accessTokenCache = {
        token: data.access_token,
        expiresAt: now + (data.expires_in ?? 3600) * 1000,
      };
      return data.access_token;
    } catch (err) {
      this.logger.warn(
        `FCM OAuth token exchange error: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /**
   * Send one push to one device token.
   * @returns "sent" | "invalid" (token unregistered → caller should prune it)
   *          | "error" (transient — retry later). Never throws.
   */
  async send(token: string, payload: FcmPayload): Promise<FcmSendResult> {
    if (!this.enabled || !this.projectId) return "error";
    const accessToken = await this.getAccessToken();
    if (!accessToken) return "error";

    try {
      const message = {
        message: {
          token,
          notification: { title: payload.title, body: payload.body },
          ...(payload.data && Object.keys(payload.data).length > 0
            ? { data: payload.data }
            : {}),
          android: {
            priority: "high",
            ttl: "86400s",
            notification: {
              // The channel + icon must exist in the app (see the mobile
              // expo-notifications config plugin). Tap opens the default
              // launcher activity — the deep link rides in `data`.
              channel_id: payload.channelId ?? "matriq",
              icon: payload.icon ?? "notification_icon",
              color: payload.color ?? "#7B4BC4",
            },
          },
        },
      };

      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/messages:send`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(message),
          signal: AbortSignal.timeout(8000),
        },
      );

      if (res.ok) return "sent";

      const body = (await res.json().catch(() => null)) as {
        error?: { details?: Array<{ errorCode?: string; status?: string }> };
      } | null;
      const errorCode =
        body?.error?.details?.[0]?.errorCode ??
        body?.error?.details?.[0]?.status ??
        "";
      // UNREGISTERED / INVALID_ARGUMENT (bad token) — the device is gone;
      // the caller prunes the row so we stop paying for dead tokens.
      if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/i.test(errorCode)) {
        return "invalid";
      }
      this.logger.warn(
        `FCM send failed: HTTP ${res.status} ${errorCode}`,
      );
      return "error";
    } catch (err) {
      this.logger.warn(
        `FCM send error: ${err instanceof Error ? err.message : String(err)}`,
      );
      return "error";
    }
  }
}

interface ServiceAccount {
  client_email?: string;
  private_key?: string;
  project_id?: string;
  token_uri?: string;
}

export interface FcmPayload {
  title: string;
  body: string;
  /** Small key/value payload the app reads when the notification is tapped. */
  data?: Record<string, string>;
  /** Android drawable resource name for the small icon. */
  icon?: string;
  /** Android notification accent color (icon tint), #RRGGBB. */
  color?: string;
  /** Android notification channel id (must exist in the app). */
  channelId?: string;
}

export type FcmSendResult = "sent" | "invalid" | "error";
