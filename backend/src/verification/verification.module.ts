import { Module } from "@nestjs/common";
import { VerificationService } from "./verification.service";
import { VerificationController } from "./verification.controller";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { StorageModule } from "../storage/storage.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [AuthModule, AuditModule, StorageModule, NotificationsModule],
  controllers: [VerificationController],
  providers: [VerificationService],
  exports: [VerificationService],
})
export class VerificationModule {}
