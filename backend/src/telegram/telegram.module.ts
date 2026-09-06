import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TelegramBotService } from "./telegram-bot.service";
import { TelegramController } from "./telegram.controller";
import { TelegramConfig } from "./telegram.config";
import { TelegramApi } from "./telegram.api";
import { TelegramGate } from "./telegram-gate";
import { TelegramMiniAppAuth } from "./telegram-miniapp-auth";
import { TelegramMiniAppGuard } from "./telegram-miniapp.guard";
import { ResourceAuditModule } from "../resource-audit/resource-audit.module";

/**
 * The Telegram interface — chat bot + Mini App on top of the Resource Audit
 * Engine. Entirely optional: without TELEGRAM_BOT_TOKEN the module registers
 * but the bot never starts, and every endpoint that needs the bot fails
 * gracefully (public-info reports botConfigured: false).
 */
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("JWT_SECRET"),
        signOptions: { expiresIn: "12h" },
      }),
    }),
    ResourceAuditModule,
  ],
  controllers: [TelegramController],
  providers: [
    TelegramConfig,
    {
      provide: TelegramApi,
      inject: [TelegramConfig],
      useFactory: (config: TelegramConfig) =>
        new TelegramApi(config.botToken, (msg) => console.warn(`telegram: ${msg}`)),
    },
    TelegramGate,
    TelegramMiniAppAuth,
    TelegramMiniAppGuard,
    TelegramBotService,
  ],
  exports: [TelegramBotService],
})
export class TelegramModule {}
