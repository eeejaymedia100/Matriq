import { Module } from "@nestjs/common";
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

@Module({
  imports: [
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
