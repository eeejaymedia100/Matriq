import { Module } from "@nestjs/common";
import { AiService } from "./ai.service";
import { AiController } from "./ai.controller";
import { AiQuotaService } from "./ai-quota.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [AiController],
  providers: [AiService, AiQuotaService],
  exports: [AiService],
})
export class AiModule {}
