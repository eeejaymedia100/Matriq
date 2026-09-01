import { Module } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { InAppNotificationsService } from "./in-app.service";
import { FcmService } from "./fcm.service";
import { NotificationsController } from "./notifications.controller";

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, InAppNotificationsService, FcmService],
  exports: [NotificationsService, InAppNotificationsService],
})
export class NotificationsModule {}
