import { Module } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { InAppNotificationsService } from "./in-app.service";
import { NotificationsController } from "./notifications.controller";

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, InAppNotificationsService],
  exports: [NotificationsService, InAppNotificationsService],
})
export class NotificationsModule {}
