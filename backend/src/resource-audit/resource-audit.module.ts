import { Module, Provider } from "@nestjs/common";
import { ResourceAuditController } from "./resource-audit.controller";
import { ResourceAuditService } from "./resource-audit.service";
import { ResourceAuditStorage } from "./resource-audit.storage";
import { RuleBasedScorer } from "./resource-audit.scorer";
import { AUDIT_SCORER } from "./resource-audit.scorer";
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
    { provide: AUDIT_SCORER, useClass: RuleBasedScorer } as Provider,
  ],
  exports: [ResourceAuditService],
})
export class ResourceAuditModule {}
