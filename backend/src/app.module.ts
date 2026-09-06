import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { ResilientThrottlerStorage } from "./throttler/throttler-storage";
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
import { FocusModule } from "./focus/focus.module";
import { LibraryModule } from "./library/library.module";
import { EntitlementModule } from "./entitlement/entitlement.module";
import { VerificationModule } from "./verification/verification.module";
import { FeesModule } from "./fees/fees.module";
import { VaultModule } from "./vault/vault.module";
import { ResourceAuditModule } from "./resource-audit/resource-audit.module";
import { ToolsModule } from "./tools/tools.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { BannersModule } from "./banners/banners.module";
import { AchievementsModule } from "./achievements/achievements.module";
import { DeepReadModule } from "./deepread/deepread.module";
import { WaitlistModule } from "./waitlist/waitlist.module";
import { InstitutionsModule } from "./institutions/institutions.module";
import { TimetableModule } from "./timetable/timetable.module";
import { ActivityModule } from "./activity/activity.module";
import { HealthModule } from "./health/health.module";
import { EmailModule } from "./email/email.module";
import { TelegramModule } from "./telegram/telegram.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === "test" ? ".env.test" : ".env",
    }),
    // Redis-backed rate limiting (shared across cluster workers) with an
    // automatic in-memory fallback so throttling never takes the API down
    // with a Redis outage. See src/throttler/throttler-storage.ts.
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60000,
          limit: 60,
        },
      ],
      storage: new ResilientThrottlerStorage(),
    }),
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
    EntitlementModule,
    FocusModule,
    LibraryModule,
    VerificationModule,
    FeesModule,
    VaultModule,
    ResourceAuditModule,
    ToolsModule,
    NotificationsModule,
    BannersModule,
    AchievementsModule,
    ActivityModule,
    DeepReadModule,
    WaitlistModule,
    InstitutionsModule,
    TimetableModule,
    HealthModule,
    EmailModule,
    TelegramModule,
  ],
})
export class AppModule {}
