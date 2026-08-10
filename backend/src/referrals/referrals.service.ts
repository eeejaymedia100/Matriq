import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record a referral invite. Returns a shareable referral code/link.
   */
  async createReferral(userId: string) {
    const referral = await this.prisma.referral.create({
      data: { referrerId: userId },
    });

    this.logger.log(`Referral created: ${referral.id} by user ${userId}`);

    return {
      id: referral.id,
      shareCode: referral.id.slice(0, 8), // short shareable code
      createdAt: referral.createdAt,
    };
  }

  /**
   * List referrals by the current user with counts.
   */
  async listByUser(userId: string) {
    const referrals = await this.prisma.referral.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: "desc" },
      include: {
        referredUser: {
          select: { id: true, fullName: true, createdAt: true },
        },
      },
      take: 100,
    });

    const total = await this.prisma.referral.count({
      where: { referrerId: userId },
    });
    const converted = await this.prisma.referral.count({
      where: { referrerId: userId, referredUserId: { not: null } },
    });

    // Ambassador status: 10+ successful referrals
    const isAmbassador = converted >= 10;

    return {
      referrals: referrals.map((r) => ({
        id: r.id,
        shareCode: r.id.slice(0, 8),
        converted: r.referredUserId !== null,
        referredUser: r.referredUser
          ? {
              id: r.referredUser.id,
              fullName: r.referredUser.fullName,
            }
          : null,
        createdAt: r.createdAt,
      })),
      stats: {
        total,
        converted,
        isAmbassador,
      },
    };
  }
}
