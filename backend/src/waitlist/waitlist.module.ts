import { Module } from "@nestjs/common";
import { WaitlistService } from "./waitlist.service";
import { WaitlistController } from "./waitlist.controller";
import { EmailModule } from "../email/email.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AdminGuard } from "../admin/admin.guard";

@Module({
  imports: [EmailModule, NotificationsModule],
  controllers: [WaitlistController],
  providers: [WaitlistService, AdminGuard],
  exports: [WaitlistService],
})
export class WaitlistModule {}
