import { Global, Module } from "@nestjs/common";
import { EntitlementService } from "./entitlement.service";

/**
 * Global module so any cost-incurring / premium endpoint can inject
 * EntitlementService without re-importing (single source of truth for access).
 */
@Global()
@Module({
  providers: [EntitlementService],
  exports: [EntitlementService],
})
export class EntitlementModule {}