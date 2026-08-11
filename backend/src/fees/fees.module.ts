import { Module } from "@nestjs/common";
import { FeesService } from "./fees.service";
import { FeesController } from "./fees.controller";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [AuthModule, AuditModule, NotificationsModule],
  controllers: [FeesController],
  providers: [FeesService],
  exports: [FeesService],
})
export class FeesModule {}
