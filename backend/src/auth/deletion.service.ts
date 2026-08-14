import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

/**
 * Account deletion — spec §10. The ONLY account-removal action (no separate
 * "disable" feature):
 *
 * - On request: the account is scheduled for hard deletion 6 months out.
 *   Sessions are revoked immediately, and the student is told in plain
 *   language that signing back in any time before the date cancels the
 *   deletion and restores the account exactly as it was.
 * - Any login (or token refresh) before the date clears the schedule
 *   (wired in AuthService.login / AuthService.refresh).
 * - A background sweep hard-deletes accounts whose schedule has passed.
 *   Financial records (payments/receipts) are kept for reconciliation but
 *   anonymised by dropping the link to the deleted student.
 */
@Injectable()
export class DeletionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeletionService.name);

  /** Spec §10: 6 months from the request. */
  private static readonly GRACE_MS = 6 * 30 * 24 * 60 * 60 * 1000;
  private static readonly SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6h

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(
      () => void this.sweep(),
      DeletionService.SWEEP_INTERVAL_MS,
    );
    this.timer.unref?.();
    this.logger.log(
      `Deletion sweep scheduled every ${DeletionService.SWEEP_INTERVAL_MS / 3_600_000}h`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Schedule the account for hard deletion 6 months out + revoke sessions. */
  async request(userId: string, ipAddress: string) {
    const scheduledFor = new Date(Date.now() + DeletionService.GRACE_MS);

    await this.prisma.user.update({
      where: { id: userId },
      data: { deletionScheduledAt: scheduledFor },
    });

    // Revoke every session so the account is quietly inactive during the
    // window (this is also why a separate "disable" feature isn't needed).
    const families = await this.prisma.refreshTokenFamily.findMany({
      where: { userId },
      select: { id: true },
    });
    const familyIds = families.map((f) => f.id);
    if (familyIds.length > 0) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: { in: familyIds }, used: false },
        data: { used: true },
      });
    }

    await this.auditService.log({
      actorType: "student",
      actorId: userId,
      action: "user.deletion_scheduled",
      targetType: "user",
      targetId: userId,
      ipAddress,
      metadata: { scheduledFor: scheduledFor.toISOString() },
    });

    this.logger.log(
      `Deletion scheduled for user ${userId} at ${scheduledFor.toISOString()}`,
    );

    return {
      scheduledFor,
      cancelsOnLogin: true,
      message:
        "Your account is scheduled for deletion in 6 months. Sign in any time before then to cancel it and keep your account exactly as it is.",
    };
  }

  /** Explicitly cancel a pending deletion (also implicit on login). */
  async cancel(userId: string, ipAddress: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { deletionScheduledAt: true },
    });
    if (!user?.deletionScheduledAt) {
      return {
        message: "No deletion is scheduled for this account.",
        cancelled: false,
      };
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { deletionScheduledAt: null },
    });

    await this.auditService.log({
      actorType: "student",
      actorId: userId,
      action: "user.deletion_cancelled",
      targetType: "user",
      targetId: userId,
      ipAddress,
      metadata: { wasScheduledFor: user.deletionScheduledAt.toISOString() },
    });

    this.logger.log(`Deletion cancelled for user ${userId}`);
    return {
      message:
        "Deletion cancelled — your account is fully restored, exactly as it was.",
      cancelled: true,
    };
  }

  /** Implicit cancel on login/refresh (no audit noise). */
  async cancelByLogin(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { deletionScheduledAt: null },
    });
  }

  /**
   * Hard-delete every account whose 6-month window has passed. Runs on a
   * timer; failures are logged per user and never abort the sweep.
   */
  async sweep(): Promise<{ deleted: number; failed: number }> {
    const due = await this.prisma.user.findMany({
      where: { deletionScheduledAt: { lte: new Date() } },
      select: { id: true, email: true },
      take: 50,
    });

    let deleted = 0;
    let failed = 0;
    for (const user of due) {
      try {
        await this.hardDelete(user.id);
        deleted += 1;
        this.logger.log(`Hard-deleted account ${user.id} (${user.email})`);
      } catch (err) {
        failed += 1;
        this.logger.error(
          `Hard-delete failed for ${user.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (due.length > 0) {
      this.logger.log(`Deletion sweep: ${deleted} deleted, ${failed} failed`);
    }
    return { deleted, failed };
  }

  /** Remove the user row and every personal-data dependency. */
  private async hardDelete(userId: string): Promise<void> {
    const placeholder = await this.deletedUserPlaceholder();
    await this.prisma.$transaction(async (tx) => {
      await tx.legalAcceptance.deleteMany({ where: { userId } });
      await tx.refreshTokenFamily.deleteMany({ where: { userId } });
      await tx.aiQueryLog.deleteMany({ where: { userId } });
      await tx.verificationRequest.deleteMany({ where: { userId } });
      await tx.membership.deleteMany({ where: { userId } });
      await tx.announcementRead.deleteMany({ where: { userId } });
      await tx.eventRsvp.deleteMany({ where: { userId } });
      await tx.eventAttendance.deleteMany({ where: { userId } });
      await tx.referral.deleteMany({
        where: { OR: [{ referrerId: userId }, { referredUserId: userId }] },
      });
      // Financial records stay for reconciliation but are anonymised
      // (payments.userId is nullable; receipts keep referencing the payment).
      await tx.payment.updateMany({
        where: { userId },
        data: { userId: null },
      });
      // The shared AI corpus keeps the document, just detached.
      await tx.aiDocument.updateMany({
        where: { submittedByUserId: userId },
        data: { submittedByUserId: null },
      });
      // Vault items belong to the community (public) or the student (private);
      // private ones go with them, public ones are re-pointed at the
      // placeholder so the shared corpus survives the deletion (spec §7).
      await tx.vaultItem.deleteMany({
        where: { userId, visibility: "private" },
      });
      await tx.vaultItem.updateMany({
        where: { userId, visibility: "public" },
        data: { userId: placeholder.id },
      });
      await tx.associationExecutive.updateMany({
        where: { userId },
        data: { userId: null },
      });
      await tx.user.delete({ where: { id: userId } });
    });
  }

  /**
   * Public Vault items can't be orphaned to a deleted user id (FK), so they
   * are re-pointed at a synthetic "deleted contributor" placeholder account
   * created once. This keeps the shared corpus intact (spec §7) while the
   * contributor's identity is gone.
   */
  private deletedUserPlaceholderPromise: Promise<{ id: string }> | null = null;
  private deletedUserPlaceholder(): Promise<{ id: string }> {
    if (!this.deletedUserPlaceholderPromise) {
      this.deletedUserPlaceholderPromise = this.prisma.user.upsert({
        where: { email: "deleted@matriq.local" },
        create: {
          email: "deleted@matriq.local",
          fullName: "Deleted student",
          registrationType: "staylite",
          faculty: "—",
          department: "—",
          level: "—",
          passwordHash: null,
        },
        select: { id: true },
        update: {},
      });
    }
    return this.deletedUserPlaceholderPromise;
  }
}
