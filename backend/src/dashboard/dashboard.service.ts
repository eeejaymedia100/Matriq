import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "../generated/prisma/client";

export interface DashboardStats {
  totalMembers: number;
  totalFees: number;
  totalCollectedKobo: number;
  paymentRate: number;
  topPayers: Array<{
    userId: string;
    name: string;
    totalPaidKobo: number;
    rank: number;
  }>;
  recentActivity: Array<{
    userId: string;
    name: string;
    feeName: string;
    amountKobo: number;
    status: string;
    paidAt: string | null;
  }>;
  transparency: unknown;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Executive dashboard: aggregate stats for an association.
   */
  async getStats(associationId: string): Promise<DashboardStats> {
    const association = await this.prisma.association.findUnique({
      where: { id: associationId },
    });
    if (!association) throw new NotFoundException("Association not found");

    const [
      totalMembers,
      fees,
      successfulPayments,
      recentPayments,
      topPayersRaw,
    ] = await Promise.all([
      this.prisma.membership.count({
        where: { associationId, status: "live" },
      }),
      this.prisma.fee.findMany({ where: { associationId } }),
      this.prisma.payment.findMany({
        where: {
          fee: { associationId },
          status: "successful",
        },
        include: { user: { select: { fullName: true } }, fee: true },
      }),
      this.prisma.payment.findMany({
        where: { fee: { associationId } },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { user: { select: { fullName: true } }, fee: true },
      }),
      this.prisma.payment.groupBy({
        by: ["userId"],
        where: {
          fee: { associationId },
          status: "successful",
        },
        _sum: { amountKobo: true },
        orderBy: { _sum: { amountKobo: "desc" } },
        take: 10,
      }),
    ]);

    const totalFeesAmount = fees.reduce((s, f) => s + f.amountKobo, 0);
    const totalCollected = successfulPayments.reduce(
      (s, p) => s + p.amountKobo,
      0,
    );
    const paymentRate =
      totalFeesAmount > 0
        ? Math.round((totalCollected / (totalFeesAmount * totalMembers)) * 100)
        : 0;

    const userIds = topPayersRaw.map((t) => t.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.fullName]));

    const topPayers = topPayersRaw.map((t, i) => ({
      userId: t.userId,
      name: userMap.get(t.userId) || "Unknown",
      totalPaidKobo: t._sum.amountKobo || 0,
      rank: i + 1,
    }));

    const recentActivity = recentPayments.map((p) => ({
      userId: p.userId,
      name: p.user.fullName,
      feeName: p.fee.name,
      amountKobo: p.amountKobo,
      status: p.status,
      paidAt: p.paidAt?.toISOString() || null,
    }));

    return {
      totalMembers,
      totalFees: fees.length,
      totalCollectedKobo: totalCollected,
      paymentRate,
      topPayers,
      recentActivity,
      transparency: association.transparency ?? null,
    };
  }

  /**
   * Recent payment feed for an association.
   */
  async getActivity(associationId: string, take = 20) {
    const association = await this.prisma.association.findUnique({
      where: { id: associationId },
    });
    if (!association) throw new NotFoundException("Association not found");

    const payments = await this.prisma.payment.findMany({
      where: { fee: { associationId } },
      orderBy: { createdAt: "desc" },
      take,
      include: {
        user: { select: { id: true, fullName: true } },
        fee: { select: { id: true, name: true, session: true } },
      },
    });

    return {
      associationId,
      activity: payments.map((p) => ({
        id: p.id,
        userId: p.userId,
        userName: p.user.fullName,
        feeName: p.fee.name,
        session: p.fee.session,
        amountKobo: p.amountKobo,
        status: p.status,
        method: p.method,
        paidAt: p.paidAt?.toISOString() || null,
        createdAt: p.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Executive verifies a receipt.
   * Ensures the receipt belongs to a payment for a fee in this association.
   */
  async verifyReceipt(
    associationId: string,
    receiptId: string,
    executiveId: string,
  ) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id: receiptId },
      include: {
        payment: {
          include: { fee: true },
        },
      },
    });
    if (!receipt) throw new NotFoundException("Receipt not found");

    // Association-scoping: ensure the receipt's payment belongs to this association
    if (receipt.payment.fee.associationId !== associationId) {
      throw new NotFoundException("Receipt not found");
    }

    if (receipt.verifiedByExecutiveId) {
      return { message: "Receipt already verified", receiptId };
    }

    await this.prisma.receipt.update({
      where: { id: receiptId },
      data: {
        verifiedByExecutiveId: executiveId,
        verifiedAt: new Date(),
      },
    });

    this.logger.log(
      `Receipt ${receiptId} verified by executive ${executiveId}`,
    );

    return {
      message: "Receipt verified successfully",
      receiptId,
      paymentId: receipt.paymentId,
      amountKobo: receipt.payment.amountKobo,
      feeName: receipt.payment.fee.name,
    };
  }

  /**
   * President-only: update the transparency breakdown for an association.
   * Persists to the `transparency` JSON column on the Association model.
   */
  async updateTransparency(
    associationId: string,
    breakdown: Record<string, number>,
  ) {
    const association = await this.prisma.association.findUnique({
      where: { id: associationId },
    });
    if (!association) throw new NotFoundException("Association not found");

    await this.prisma.association.update({
      where: { id: associationId },
      data: {
        transparency: breakdown as Prisma.InputJsonValue,
      },
    });

    this.logger.log(`Transparency updated for association ${associationId}`);

    return {
      message: "Transparency breakdown updated",
      associationId,
      breakdown,
    };
  }
}
