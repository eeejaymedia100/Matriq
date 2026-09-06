/**
 * Resource Audit Engine — Part 5: rewards, campaigns, anti-abuse.
 *
 * Library approval and reward eligibility are DIFFERENT decisions. An
 * approved document may enter the library and still be reward-ineligible
 * (duplication abuse, junk quality, outside an active campaign).
 *
 * Anti-abuse invariants enforced here:
 *  - only approved submissions can create contributions (submissionId is
 *    UNIQUE on the ledger — a duplicate row is impossible)
 *  - the anti-abuse score caps/zeroes points; red-risk submissions never
 *    qualify
 *  - one reward per (student, campaign, tier) — enforced by a DB unique
 *    index; double claims are a no-op, never a second payout
 *  - payouts are manual in V1 (airtime / bank transfer), recorded as
 *    state transitions with an admin identity + reference
 */

import { Injectable, Logger, ConflictException, NotFoundException, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { ResourceRewardState } from "../generated/prisma/client";

// ── Campaign configuration ───────────────────────────────────────────

export interface RewardTier {
  id: string;
  label: string;
  requiredPoints: number;
  kind: "airtime" | "cash" | "recognition";
  /** Value is display-only in V1 — payouts are manual. */
  valueDescription: string;
}

export interface CampaignConfig {
  id: string;
  name: string;
  active: boolean;
  pointsPerApprovedResource: number;
  /** Abuse-risk ceiling: submissions scoring >= this never earn points. */
  abuseRiskCutoff: number;
  tiers: RewardTier[];
}

const DEFAULT_TIERS: RewardTier[] = [
  { id: "bronze", label: "5 approved resources", requiredPoints: 5, kind: "airtime", valueDescription: "airtime top-up" },
  { id: "silver", label: "10 approved resources", requiredPoints: 10, kind: "airtime", valueDescription: "larger airtime top-up" },
  { id: "gold", label: "20 approved resources", requiredPoints: 20, kind: "cash", valueDescription: "cash prize" },
];

export const DEFAULT_CAMPAIGN: CampaignConfig = {
  id: "v1-launch",
  name: "Matriq V1 Launch",
  active: true,
  pointsPerApprovedResource: 1,
  abuseRiskCutoff: 40,
  tiers: DEFAULT_TIERS,
};

export function loadCampaign(get: (key: string) => string | undefined): CampaignConfig {
  const campaign = { ...DEFAULT_CAMPAIGN };
  const raw = get("RESOURCE_AUDIT_CAMPAIGN_CONFIG");
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<CampaignConfig>;
      Object.assign(campaign, parsed, {
        // tiers must always be present and well-formed
        tiers: Array.isArray(parsed.tiers) && parsed.tiers.length > 0 ? parsed.tiers : DEFAULT_TIERS,
      });
    } catch {
      // fall back to defaults on malformed config — never crash the engine
    }
  }
  return campaign;
}

// ── Qualification ────────────────────────────────────────────────────

export interface QualificationResult {
  qualified: boolean;
  points: number;
  reason: string;
  abuseScore: number;
}

@Injectable()
export class ResourceRewardService {
  private readonly logger = new Logger(ResourceRewardService.name);
  private readonly campaign: CampaignConfig;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.campaign = loadCampaign((key) => configService?.get<string>(key));
  }

  getConfig(): CampaignConfig {
    return this.campaign;
  }

  /**
   * Create the contribution for an approved submission — or record why it
   * didn't qualify. Idempotent: the unique submission_id makes a duplicate
   * ledger row impossible; re-runs resolve to the existing row.
   */
  async qualify(submission: {
    id: string;
    studentId: string;
    courseCode: string;
    materialType: string;
    aiAuditReport: unknown;
    duplicateOfId: string | null;
  }): Promise<QualificationResult> {
    const campaign = this.campaign;

    // 1. Campaign activity.
    if (!campaign.active) {
      return this.recordOutcome(submission, { qualified: false, points: 0, reason: "no active campaign", abuseScore: 0 });
    }
    // 2. Exact duplicates never earn.
    if (submission.duplicateOfId) {
      return this.recordOutcome(submission, {
        qualified: false,
        points: 0,
        reason: `duplicate of ${submission.duplicateOfId}`,
        abuseScore: 100,
      });
    }

    // 3. Abuse score from the AI audit report (risk scores 0-100).
    const report = (submission.aiAuditReport ?? {}) as {
      scores?: { duplicateProbability?: number; suspiciousContentRisk?: number; rewardAbuseRisk?: number };
    };
    const s = report.scores ?? {};
    const abuseScore = Math.max(
      typeof s.duplicateProbability === "number" ? s.duplicateProbability : 0,
      typeof s.suspiciousContentRisk === "number" ? s.suspiciousContentRisk : 0,
      typeof s.rewardAbuseRisk === "number" ? s.rewardAbuseRisk : 0,
    );
    if (abuseScore >= campaign.abuseRiskCutoff) {
      return this.recordOutcome(submission, {
        qualified: false,
        points: 0,
        reason: `abuse score ${abuseScore} >= cutoff ${campaign.abuseRiskCutoff}`,
        abuseScore,
      });
    }

    // 4. Qualify — upsert-safe by unique submission_id.
    const existing = await this.prisma.resourceContribution.findUnique({
      where: { submissionId: submission.id },
    });
    if (existing) {
      return { qualified: existing.points > 0, points: existing.points, reason: existing.reason ?? "", abuseScore };
    }
    await this.prisma.resourceContribution.create({
      data: {
        studentId: submission.studentId,
        submissionId: submission.id,
        campaignId: campaign.id,
        points: campaign.pointsPerApprovedResource,
        courseCode: submission.courseCode,
        materialType: submission.materialType,
        reason: `approved; abuse score ${abuseScore}`,
      },
    });
    return { qualified: true, points: campaign.pointsPerApprovedResource, reason: "approved", abuseScore };
  }

  /**
   * Disqualification outcomes are recorded by the CALLER on the submission
   * row (rewardStatus=ineligible + rewardReason) — never as a zero-point
   * ledger row, which would pollute the leaderboard and violate the FK.
   */
  private async recordOutcome(
    _submission: { id: string },
    result: QualificationResult,
  ): Promise<QualificationResult> {
    return result;
  }

  // ── Tier evaluation ─────────────────────────────────────────────────

  /** Total qualified points for a student in the campaign. */
  async pointsFor(studentId: string): Promise<number> {
    const agg = await this.prisma.resourceContribution.aggregate({
      where: { studentId, campaignId: this.campaign.id, points: { gt: 0 } },
      _sum: { points: true },
    });
    return agg._sum.points ?? 0;
  }

  /**
   * Evaluate tiers after a new contribution. Creates reward rows (pending)
   * for every newly-reached tier. The unique (student, campaign, tier)
   * index makes double-claiming impossible.
   */
  async evaluateTiers(studentId: string): Promise<Array<{ tierId: string; label: string; created: boolean }>> {
    const points = await this.pointsFor(studentId);
    const created: Array<{ tierId: string; label: string; created: boolean }> = [];
    for (const tier of this.campaign.tiers) {
      if (points < tier.requiredPoints) continue;
      const existing = await this.prisma.resourceReward.findUnique({
        where: { studentId_campaignId_tierId: { studentId, campaignId: this.campaign.id, tierId: tier.id } },
      });
      if (existing) {
        created.push({ tierId: tier.id, label: tier.label, created: false });
        continue;
      }
      // Anchor the reward to the student's most recent qualifying contribution.
      const anchor = await this.prisma.resourceContribution.findFirst({
        where: { studentId, campaignId: this.campaign.id, points: { gt: 0 } },
        orderBy: { createdAt: "desc" },
      });
      if (!anchor) continue;
      await this.prisma.resourceReward
        .create({
          data: {
            studentId,
            contributionId: anchor.id,
            campaignId: this.campaign.id,
            tierId: tier.id,
            state: ResourceRewardState.eligible,
            pointsAtEarn: points,
          },
        })
        .catch(() => undefined); // lost a race — the other row stands
      created.push({ tierId: tier.id, label: tier.label, created: true });
    }
    return created;
  }

  // ── Admin reward management ─────────────────────────────────────────

  async listRewards(state?: ResourceRewardState) {
    return this.prisma.resourceReward.findMany({
      where: state ? { state } : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { student: { select: { id: true, fullName: true, email: true } } },
    });
  }

  /** Record a manual payout (airtime or bank transfer) in V1. */
  async markPaid(
    rewardId: string,
    adminId: string,
    payoutMethod: "airtime" | "bank_transfer",
    payoutRef: string,
  ) {
    const reward = await this.prisma.resourceReward.findUnique({ where: { id: rewardId } });
    if (!reward) throw new NotFoundException("Reward not found.");
    if (reward.state === ResourceRewardState.paid) {
      throw new ConflictException("Reward already paid.");
    }
    if (!payoutRef.trim()) throw new BadRequestException("A payout reference is required.");
    return this.prisma.resourceReward.update({
      where: { id: rewardId },
      data: {
        state: ResourceRewardState.paid,
        payoutMethod,
        payoutRef: payoutRef.trim(),
        paidAt: new Date(),
        paidByAdmin: adminId,
      },
    });
  }

  async dispute(rewardId: string, adminId: string, note: string) {
    const reward = await this.prisma.resourceReward.findUnique({ where: { id: rewardId } });
    if (!reward) throw new NotFoundException("Reward not found.");
    return this.prisma.resourceReward.update({
      where: { id: rewardId },
      data: { state: ResourceRewardState.disputed, note: `${note.slice(0, 300)} — by ${adminId}` },
    });
  }

  /** Leaderboard: qualified points, never raw upload counts. */
  async leaderboard(limit = 20) {
    const rows = await this.prisma.resourceContribution.groupBy({
      by: ["studentId"],
      where: { campaignId: this.campaign.id, points: { gt: 0 } },
      _sum: { points: true },
      orderBy: { _sum: { points: "desc" } },
      take: limit,
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.studentId) } },
      select: { id: true, fullName: true },
    });
    const nameById = new Map(users.map((u) => [u.id, u.fullName]));
    return rows.map((r, i) => ({
      rank: i + 1,
      studentId: r.studentId,
      name: nameById.get(r.studentId) ?? "Student",
      points: r._sum.points ?? 0,
    }));
  }
}
