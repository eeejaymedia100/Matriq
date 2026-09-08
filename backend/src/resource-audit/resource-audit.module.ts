import { Module, Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ResourceAuditController } from "./resource-audit.controller";
import { ResourceAuditService } from "./resource-audit.service";
import { ResourceAuditStorage } from "./resource-audit.storage";
import { RuleBasedScorer } from "./resource-audit.scorer";
import { AUDIT_SCORER } from "./resource-audit.scorer";
import { AUDITOR_PORT, FallbackAuditor, RuleBasedAuditor } from "./resource-audit.ai-auditor";
import { ResourceRewardService } from "./resource-audit.rewards";
import { StorageModule } from "../storage/storage.module";
import { ToolsModule } from "../tools/tools.module";
import { TelegramCampaignService } from "../telegram/telegram-campaign.service";
import { TELEGRAM_CAMPAIGN_PORT } from "./resource-audit.service";

/**
 * Resource Audit Engine — Part 1: submission + audit foundation.
 *
 * Self-contained and channel-agnostic: Telegram, the app, the website and
 * admin tools all call the same service methods. Imports only existing
 * infrastructure (PrismaModule is global; StorageModule for object storage;
 * ToolsModule for the shared OCR engine) — nothing existing was replaced.
 */
@Module({
  imports: [StorageModule, ToolsModule],
  controllers: [ResourceAuditController],
  providers: [
    ResourceAuditService,
    ResourceAuditStorage,
    ResourceRewardService,
    TelegramCampaignService,
    { provide: TELEGRAM_CAMPAIGN_PORT, useClass: TelegramCampaignService } as Provider,
    { provide: AUDIT_SCORER, useClass: RuleBasedScorer } as Provider,
    {
      // AI auditor (Part 3): Ollama first (self-hosted, free), escalating
      // to the OpenAI-compatible cloud router (xKiro / DeepSeek) when the
      // local model fails or times out, then the deterministic rule
      // auditor last. Replaceable via AUDITOR_PORT.
      provide: AUDITOR_PORT,
      inject: [ConfigService],
      // Priority: the self-hosted Ollama model first (free, on-server, real
      // AI), then the DeepSeek cloud escalation when keyed, then rules.
      // Timeout is env-tunable: long documents need more than the default
      // 3 minutes on a small local model (RESOURCE_AUDIT_AI_TIMEOUT_MS).
      useFactory: (config: ConfigService) =>
        FallbackAuditor.fromEnv(
          (key) => config.get<string>(key),
          config.get<string>("RESOURCE_AUDIT_AI_TIMEOUT_MS")
            ? Number(config.get<string>("RESOURCE_AUDIT_AI_TIMEOUT_MS"))
            : undefined,
        ) ?? new RuleBasedAuditor(),
    } as Provider,
  ],
  exports: [ResourceAuditService],
})
export class ResourceAuditModule {}
