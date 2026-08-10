import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { AdminController } from "./admin.controller";
import { AdminAuthService } from "./admin-auth.service";
import { AdminService } from "./admin.service";
import { AdminGuard } from "./admin.guard";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
        signOptions: { expiresIn: "15m" },
      }),
      inject: [ConfigService],
    }),
    AuditModule,
  ],
  controllers: [AdminController],
  providers: [AdminAuthService, AdminService, AdminGuard],
  exports: [AdminAuthService, AdminService, AdminGuard],
})
export class AdminModule {}
