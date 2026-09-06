import { Module, Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ResourceAuditController } from "./resource-audit.controller";
import { ResourceAuditService } from "./resource-audit.service";
import { ResourceAuditStorage } from "./resource-audit.storage";
import { RuleBasedScorer } from "./resource-audit.scorer";
import { AUDIT_SCORER } from "./resource-audit.scorer";
import { AUDITOR_PORT, DeepSeekAuditor, RuleBasedAuditor } from "./resource-audit.ai-auditor";
import { ResourceRewardService } from "./resource-audit.rewards";
import { StorageModule } from "../storage/storage.module";
import { ToolsModule } from "../tools/tools.module";

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
    { provide: AUDIT_SCORER, useClass: RuleBasedScorer } as Provider,
    {
      // AI auditor (Part 3): DeepSeek when DEEPSEEK_API_KEY is set, the
      // deterministic rule auditor otherwise. Replaceable via AUDITOR_PORT.
      provide: AUDITOR_PORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        DeepSeekAuditor.fromEnv((key) => config.get<string>(key)) ?? new RuleBasedAuditor(),
    } as Provider,
  ],
  exports: [ResourceAuditService],
})
export class ResourceAuditModule {}
