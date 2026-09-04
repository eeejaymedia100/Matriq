import { Module } from "@nestjs/common";
import { AiService } from "./ai.service";
import { AiController } from "./ai.controller";
import { AiQuotaService } from "./ai-quota.service";
import { AiAgentService } from "./ai-agent.service";
import { AgentToolsService } from "./ai-agent-tools.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [AiController],
  providers: [AiService, AiQuotaService, AiAgentService, AgentToolsService],
  exports: [AiService, AiAgentService],
})
export class AiModule {}
