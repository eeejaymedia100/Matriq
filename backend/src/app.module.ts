import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { AuditModule } from "./audit/audit.module";
import { LegalModule } from "./legal/legal.module";
import { AssociationsModule } from "./associations/associations.module";
import { MembershipsModule } from "./memberships/memberships.module";
import { AnnouncementsModule } from "./announcements/announcements.module";
import { EventsModule } from "./events/events.module";
import { ReferralsModule } from "./referrals/referrals.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { AdminModule } from "./admin/admin.module";
import { PaymentsModule } from "./payments/payments.module";
import { AiModule } from "./ai/ai.module";
import { VerificationModule } from "./verification/verification.module";
import { FeesModule } from "./fees/fees.module";
import { WaitlistModule } from "./waitlist/waitlist.module";
import { HealthModule } from "./health/health.module";
import { EmailModule } from "./email/email.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === "test" ? ".env.test" : ".env",
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 60,
      },
    ]),
    PrismaModule,
    AuthModule,
    AuditModule,
    LegalModule,
    AssociationsModule,
    MembershipsModule,
    AnnouncementsModule,
    EventsModule,
    ReferralsModule,
    DashboardModule,
    AdminModule,
    PaymentsModule,
    AiModule,
    VerificationModule,
    FeesModule,
    WaitlistModule,
    HealthModule,
    EmailModule,
  ],
})
export class AppModule {}
