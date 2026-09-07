import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { loadCampaign } from "../resource-audit/resource-audit.rewards";

/**
 * Resource Hunt campaign state for Telegram participants.
 *
 * Participants are Telegram users, not Matriq accounts. All mutations are
 * idempotent: a submission can only ever earn points once, and the
 * participant's leaderboard totals are updated transactionally with the
 * ledger row.
 */
@Injectable()
export class TelegramCampaignService {
  private readonly logger = new Logger(TelegramCampaignService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Find-or-create the participant row for a Telegram user. */
  async ensureParticipant(tg: {
    id: number | string;
    username?: string | null;
    first_name?: string | null;
  }): Promise<{
    id: string;
    verifiedAt: Date | null;
    university: string | null;
    faculty: string | null;
    department: string | null;
    points: number;
    approvedCount: number;
  }> {
    const telegramId = String(tg.id);
    return this.prisma.telegramParticipant.upsert({
      where: { telegramId },
      create: {
        telegramId,
        username: tg.username ?? null,
        firstName: tg.first_name ?? null,
      },
      update: {
        // Keep the profile fresh on every interaction.
        username: tg.username ?? undefined,
        firstName: tg.first_name ?? undefined,
      },
      select: {
        id: true,
        verifiedAt: true,
        university: true,
        faculty: true,
        department: true,
        points: true,
        approvedCount: true,
      },
    });
  }

  async getParticipant(telegramId: string) {
    return this.prisma.telegramParticipant.findUnique({ where: { telegramId } });
  }

  /** Persist university on the participant (from the button selection). */
  async setUniversity(telegramId: string, university: string): Promise<void> {
    await this.prisma.telegramParticipant.update({
      where: { telegramId },
      data: { university: university.slice(0, 120) },
    });
  }

  /** Mark membership verified (bot confirmed via getChatMember). */
  async markVerified(telegramId: string): Promise<void> {
    await this.prisma.telegramParticipant.updateMany({
      where: { telegramId, verifiedAt: null },
      data: { verifiedAt: new Date() },
    });
  }

  /**
   * Award points for an approved submission — exactly once. The unique
   * submissionId on the ledger row is the concurrency guard: two racing
   * approvals resolve to one contribution, and only the create path
   * bumps the participant totals.
   */
  async awardForSubmission(submission: {
    id: string;
    participantId: string;
    courseCode: string;
    materialType: string;
  }): Promise<{ awarded: boolean; points: number; reason: string }> {
    const campaign = loadCampaign((key) => process.env[key]);
    if (!campaign.active) {
      return { awarded: false, points: 0, reason: "no active campaign" };
    }

    const existing = await this.prisma.resourceContribution.findUnique({
      where: { submissionId: submission.id },
      select: { points: true },
    });
    if (existing) {
      return { awarded: false, points: existing.points, reason: "already recorded" };
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const contribution = await tx.resourceContribution.create({
          data: {
            participantId: submission.participantId,
            submissionId: submission.id,
            campaignId: campaign.id,
            points: campaign.pointsPerApprovedResource,
            courseCode: submission.courseCode,
            materialType: submission.materialType,
            reason: "approved via human review",
          },
          select: { points: true },
        });
        const participant = await tx.telegramParticipant.update({
          where: { id: submission.participantId },
          data: {
            points: { increment: contribution.points },
            approvedCount: { increment: 1 },
          },
          select: { points: true, approvedCount: true },
        });
        return { contribution, participant };
      });
      this.logger.log(
        JSON.stringify({
          stage: "campaign",
          submissionId: submission.id,
          participantId: submission.participantId,
          msg: "points awarded",
          points: created.contribution.points,
          totals: created.participant,
        }),
      );
      return { awarded: true, points: created.contribution.points, reason: "approved" };
    } catch (err) {
      // P2002 on submissionId = a concurrent award won the race; that is
      // success from the idempotency standpoint.
      if (String(err).includes("P2002")) {
        return { awarded: false, points: campaign.pointsPerApprovedResource, reason: "already recorded (race)" };
      }
      throw err;
    }
  }

  /** Public leaderboard: participant rankings by approved points. */
  async leaderboard(limit = 10): Promise<
    Array<{ rank: number; telegramId: string; name: string; username: string | null; points: number; approvedCount: number }>
  > {
    const rows = await this.prisma.telegramParticipant.findMany({
      where: { approvedCount: { gt: 0 } },
      orderBy: [{ points: "desc" }, { approvedCount: "desc" }, { updatedAt: "asc" }],
      take: Math.min(limit, 50),
      select: { telegramId: true, firstName: true, username: true, points: true, approvedCount: true },
    });
    return rows.map((r, i) => ({
      rank: i + 1,
      telegramId: r.telegramId,
      name: r.firstName ?? r.username ?? "Participant",
      username: r.username,
      points: r.points,
      approvedCount: r.approvedCount,
    }));
  }
}
