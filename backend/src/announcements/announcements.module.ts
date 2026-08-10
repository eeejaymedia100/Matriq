import { Module } from "@nestjs/common";
import { AnnouncementsService } from "./announcements.service";
import { AnnouncementsController } from "./announcements.controller";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}
