import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Telegram interface — configuration.
 *
 * Everything comes from environment variables (see backend/.env.example).
 * The bot is fully disabled unless TELEGRAM_BOT_TOKEN is set, so the rest
 * of Matriq keeps working on machines where Telegram is not configured.
 */
@Injectable()
export class TelegramConfig {
  constructor(private readonly configService: ConfigService) {}

  get botToken(): string {
    return this.configService.get<string>("TELEGRAM_BOT_TOKEN") ?? "";
  }

  get botUsername(): string {
    return this.configService.get<string>("TELEGRAM_BOT_USERNAME") ?? "MatriqBot";
  }

  /** Channel/group id users must join before uploading. Empty = gate off. */
  get communityId(): string {
    return this.configService.get<string>("TELEGRAM_COMMUNITY_ID") ?? "";
  }

  get communityUrl(): string {
    return this.configService.get<string>("TELEGRAM_COMMUNITY_URL") ?? "https://t.me/matriq_community";
  }

  /** Telegram numeric ids allowed to review submissions from chat. */
  get adminIds(): string[] {
    return (this.configService.get<string>("TELEGRAM_ADMIN_IDS") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  get webhookSecret(): string {
    return this.configService.get<string>("TELEGRAM_WEBHOOK_SECRET") ?? "";
  }

  get webhookUrl(): string {
    return this.webhookUrlOverride ?? this.configService.get<string>("TELEGRAM_WEBHOOK_URL") ?? "";
  }

  private webhookUrlOverride: string | null = null;

  /** Admin API can set the webhook URL at runtime without a redeploy. */
  overrideWebhookUrl(url: string): void {
    this.webhookUrlOverride = url;
  }

  get miniAppOrigins(): string[] {
    return (this.configService.get<string>("TELEGRAM_MINIAPP_ORIGINS") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  get miniAppUrl(): string {
    return this.miniAppOrigins[0] ?? "https://matriq.com.ng/telegram-miniapp/";
  }

  get isConfigured(): boolean {
    return this.botToken.length > 0;
  }

  isTelegramAdmin(telegramId: string): boolean {
    return this.adminIds.includes(telegramId);
  }
}
