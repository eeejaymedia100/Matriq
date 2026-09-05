import { Module, forwardRef } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { MfaService } from "./mfa.service";
import { ExecutivesService } from "./executives.service";
import { DeletionService } from "./deletion.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { EmailModule } from "../email/email.module";
import { AuditModule } from "../audit/audit.module";
import { StorageModule } from "../storage/storage.module";
import { ActivityModule } from "../activity/activity.module";

@Module({
  imports: [
    // forwardRef: ActivityModule imports AuthModule (JWT guard on its
    // controller); AuthService needs ActivityService to journal
    // referral_verified at email-verification time.
    forwardRef(() => ActivityModule),
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("JWT_SECRET"),
        signOptions: { expiresIn: "15m" },
      }),
    }),
    EmailModule,
    AuditModule,
    StorageModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    MfaService,
    ExecutivesService,
    DeletionService,
    JwtStrategy,
  ],
  exports: [AuthService, MfaService, ExecutivesService, PassportModule],
})
export class AuthModule {}
