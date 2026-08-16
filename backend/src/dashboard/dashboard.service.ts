import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "../generated/prisma/client";

export interface DashboardStats {
  totalMembers: number;
  /** Members with an approved verification request (distinct users). */
  confirmedMembers: number;
  totalFees: number;
  totalCollectedKobo: number;
  paymentRate: number;
  /** Payments still outstanding (pending or processing). */
  pendingPayments: number;
  successfulPayments: number;
  topPayers: Array<{
    // null after account hard-delete (payments are anonymised, spec §10)
    userId: string | null;
    name: string;
    totalPaidKobo: number;
    rank: number;
  }>;
  recentActivity: Array<{
    userId: string | null;
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
      confirmed,
      pendingCount,
      successfulCount,
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
      // Distinct members whose identity documents were approved.
      this.prisma.verificationRequest.groupBy({
        by: ["userId"],
        where: { associationId, status: "approved" },
      }),
      // Outstanding payments (pending or processing).
      this.prisma.payment.count({
        where: {
          fee: { associationId },
          status: { in: ["pending", "processing"] },
        },
      }),
      this.prisma.payment.count({
        where: { fee: { associationId }, status: "successful" },
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

    const userIds = topPayersRaw
      .map((t) => t.userId)
      .filter((id): id is string => id !== null);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.fullName]));

    const topPayers = topPayersRaw.map((t, i) => ({
      userId: t.userId,
      name: t.userId ? userMap.get(t.userId) || "Unknown" : "Deleted student",
      totalPaidKobo: t._sum.amountKobo || 0,
      rank: i + 1,
    }));

    const recentActivity = recentPayments.map((p) => ({
      userId: p.userId,
      name: p.user?.fullName ?? "Deleted student",
      feeName: p.fee.name,
      amountKobo: p.amountKobo,
      status: p.status,
      paidAt: p.paidAt?.toISOString() || null,
    }));

    return {
      totalMembers,
      confirmedMembers: confirmed.length,
      totalFees: fees.length,
      totalCollectedKobo: totalCollected,
      paymentRate,
      pendingPayments: pendingCount,
      successfulPayments: successfulCount,
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
        userName: p.user?.fullName ?? "Deleted student",
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
   * Member roster for an association (round-2 QA §2). Who's verified,
   * who's pending, who hasn't submitted — with basic search.
   */
  async members(associationId: string, q?: string) {
    const association = await this.prisma.association.findUnique({
      where: { id: associationId },
    });
    if (!association) throw new NotFoundException("Association not found");

    const [memberships, verifications] = await Promise.all([
      this.prisma.membership.findMany({
        where: { associationId },
        orderBy: { joinedAt: "desc" },
        take: 500,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              registrationType: true,
              matricNumber: true,
              jambNumber: true,
              department: true,
              level: true,
            },
          },
        },
      }),
      this.prisma.verificationRequest.findMany({
        where: { associationId },
        orderBy: { createdAt: "desc" },
        select: { userId: true, status: true, createdAt: true },
        take: 5000,
      }),
    ]);

    // Latest verification status per member.
    const latest = new Map<string, { status: string; at: Date }>();
    for (const v of verifications) {
      if (!latest.has(v.userId)) {
        latest.set(v.userId, { status: v.status, at: v.createdAt });
      }
    }

    const needle = q?.trim().toLowerCase();
    const members = memberships
      .filter((m) => {
        if (!needle) return true;
        const u = m.user;
        return (
          u.fullName.toLowerCase().includes(needle) ||
          u.email.toLowerCase().includes(needle) ||
          (u.matricNumber ?? "").toLowerCase().includes(needle) ||
          (u.jambNumber ?? "").toLowerCase().includes(needle)
        );
      })
      .map((m) => {
        const v = latest.get(m.userId);
        return {
          userId: m.userId,
          membershipStatus: m.status,
          joinedAt: m.joinedAt,
          verification: v?.status ?? null,
          verifiedAt: v && v.status === "approved" ? v.at : null,
          user: m.user,
        };
      });

    return { members, total: members.length };
  }

  /**
   * Per-fee payment roster (round-2 QA §2): who has paid, who hasn't —
   * the treasurer's "who's paid, who hasn't" view with CSV export support.
   */
  async feeRoster(associationId: string, feeId: string) {
    const fee = await this.prisma.fee.findUnique({ where: { id: feeId } });
    if (!fee || fee.associationId !== associationId) {
      throw new NotFoundException("Fee not found");
    }

    const [payments, memberships] = await Promise.all([
      this.prisma.payment.findMany({
        where: { feeId },
        orderBy: { createdAt: "desc" },
        take: 2000,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              matricNumber: true,
              level: true,
              department: true,
            },
          },
        },
      }),
      this.prisma.membership.findMany({
        where: { associationId, status: "live" },
        select: { userId: true },
      }),
    ]);

    const paidUserIds = new Set<string>();
    const paid = payments
      .filter((p) => {
        if (p.status !== "successful" || !p.userId) return false;
        paidUserIds.add(p.userId);
        return true;
      })
      .map((p) => ({
        paymentId: p.id,
        amountKobo: p.amountKobo,
        method: p.method,
        paidAt: p.paidAt,
        user: p.user,
      }));

    const unpaidIds = memberships
      .map((m) => m.userId)
      .filter((id) => !paidUserIds.has(id));
    const unpaidUsers = await this.prisma.user.findMany({
      where: { id: { in: unpaidIds } },
      select: {
        id: true,
        fullName: true,
        email: true,
        matricNumber: true,
        level: true,
        department: true,
      },
    });
    const unpaidByUser = new Map(unpaidUsers.map((u) => [u.id, u]));

    return {
      fee: {
        id: fee.id,
        name: fee.name,
        amountKobo: fee.amountKobo,
        dueDate: fee.dueDate,
        session: fee.session,
      },
      memberCount: memberships.length,
      paidCount: paidUserIds.size,
      unpaidCount: unpaidIds.length,
      paid,
      unpaid: unpaidIds
        .map((id) => unpaidByUser.get(id))
        .filter((u): u is NonNullable<typeof u> => Boolean(u)),
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
