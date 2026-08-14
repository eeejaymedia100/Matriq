import { Module } from "@nestjs/common";
import { ToolsService } from "./tools.service";
import { ToolsController } from "./tools.controller";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [ToolsController],
  providers: [ToolsService],
  exports: [ToolsService],
})
export class ToolsModule {}
