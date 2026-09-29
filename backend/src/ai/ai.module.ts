import { Module } from "@nestjs/common";
import { AiService } from "./ai.service";
import { AiController } from "./ai.controller";
import { AiQuotaService } from "./ai-quota.service";
import { AiAgentService } from "./ai-agent.service";
import { AgentToolsService } from "./ai-agent-tools.service";
import { AiImagesService } from "./ai-images.service";
import { ImageSearchService } from "./image-search.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [AiController],
  providers: [
    AiService,
    AiQuotaService,
    AiAgentService,
    AgentToolsService,
    AiImagesService,
    ImageSearchService,
  ],
  exports: [AiService, AiAgentService],
})
export class AiModule {}
