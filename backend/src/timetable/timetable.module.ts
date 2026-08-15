import { Module } from "@nestjs/common";
import { TimetableService } from "./timetable.service";
import { TimetableController } from "./timetable.controller";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [TimetableController],
  providers: [TimetableService],
  exports: [TimetableService],
})
export class TimetableModule {}
