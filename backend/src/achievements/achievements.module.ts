import { Module } from "@nestjs/common";
import { AchievementsService } from "./achievements.service";
import { AchievementsController } from "./achievements.controller";
import { AuthModule } from "../auth/auth.module";
import { ActivityModule } from "../activity/activity.module";

@Module({
  // ActivityModule: the journal is the source of truth for streak/activity
  // signals (AchievementsService injects ActivityService).
  imports: [AuthModule, ActivityModule],
  controllers: [AchievementsController],
  providers: [AchievementsService],
  exports: [AchievementsService],
})
export class AchievementsModule {}