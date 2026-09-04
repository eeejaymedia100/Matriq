import { Module } from "@nestjs/common";
import { BannersService } from "./banners.service";
import { BannersController } from "./banners.controller";
import { AuthModule } from "../auth/auth.module";
import { AdminGuard } from "../admin/admin.guard";

@Module({
  imports: [AuthModule],
  controllers: [BannersController],
  providers: [BannersService, AdminGuard],
  exports: [BannersService],
})
export class BannersModule {}