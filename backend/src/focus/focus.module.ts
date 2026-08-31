import { Module } from "@nestjs/common";
import { FocusService } from "./focus.service";
import { FocusController } from "./focus.controller";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [FocusController],
  providers: [FocusService],
  exports: [FocusService],
})
export class FocusModule {}