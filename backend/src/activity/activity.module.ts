import { Module, forwardRef } from "@nestjs/common";
import { ActivityService } from "./activity.service";
import { ActivityController } from "./activity.controller";
import { AuthModule } from "../auth/auth.module";

@Module({
  // forwardRef: AuthModule imports this module too (AuthService journals
  // referral_verified on email verification), so the cycle is explicit.
  imports: [forwardRef(() => AuthModule)],
  controllers: [ActivityController],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}