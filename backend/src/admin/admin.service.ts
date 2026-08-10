import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * List all associations (including suspended).
   */
  async listAssociations(cursor?: string, take = 20) {
    const [associations, total] = await Promise.all([
      this.prisma.association.findMany({
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { memberships: true, fees: true } },
          executives: {
            include: { user: { select: { fullName: true, email: true } } },
          },
        },
      }),
      this.prisma.association.count(),
    ]);

    const hasMore = associations.length > take;
    const items = hasMore ? associations.slice(0, take) : associations;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return {
      associations: items.map((a) => ({
        id: a.id,
        name: a.name,
        shortCode: a.shortCode,
        faculty: a.faculty,
        status: a.status,
        memberCount: a._count.memberships,
        feeCount: a._count.fees,
        executives: a.executives.map((e) => ({
          id: e.id,
          role: e.role,
          name: e.user?.fullName || null,
          email: e.user?.email || null,
        })),
        createdAt: a.createdAt,
      })),
      pagination: { cursor: nextCursor, hasMore, total },
    };
  }

  /**
   * Create a new association.
   */
  async createAssociation(dto: {
    name: string;
    shortCode: string;
    faculty: string;
    whatsappNumber?: string;
  }) {
    const association = await this.prisma.association.create({
      data: {
        name: dto.name,
        shortCode: dto.shortCode.toUpperCase(),
        faculty: dto.faculty,
        whatsappNumber: dto.whatsappNumber || "",
      },
    });

    this.logger.log(`Admin created association: ${association.name}`);

    return {
      id: association.id,
      name: association.name,
      shortCode: association.shortCode,
      faculty: association.faculty,
      status: association.status,
    };
  }

  /**
   * Suspend or reactivate an association.
   */
  async updateAssociationStatus(id: string, status: "active" | "suspended") {
    const association = await this.prisma.association.findUnique({
      where: { id },
    });
    if (!association) throw new NotFoundException("Association not found");

    const updated = await this.prisma.association.update({
      where: { id },
      data: { status },
    });

    this.logger.log(
      `Admin changed association ${association.name} status to ${status}`,
    );

    return {
      id: updated.id,
      name: updated.name,
      previousStatus: association.status,
      newStatus: updated.status,
    };
  }

  /**
   * Cross-association analytics overview.
   */
  async getAnalytics() {
    const [
      totalUsers,
      totalAssociations,
      totalPayments,
      successfulPayments,
      totalCollected,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.association.count(),
      this.prisma.payment.count(),
      this.prisma.payment.count({ where: { status: "successful" } }),
      this.prisma.payment.aggregate({
        where: { status: "successful" },
        _sum: { amountKobo: true },
      }),
    ]);

    const byAssociation = await this.prisma.payment.groupBy({
      by: ["feeId"],
      where: { status: "successful" },
      _sum: { amountKobo: true },
    });

    const fees = await this.prisma.fee.findMany({
      where: { id: { in: byAssociation.map((b) => b.feeId) } },
      include: { association: { select: { id: true, name: true } } },
    });
    const feeMap = new Map(fees.map((f) => [f.id, f]));

    const associationRevenue: Record<
      string,
      { name: string; totalKobo: number }
    > = {};
    for (const b of byAssociation) {
      const fee = feeMap.get(b.feeId);
      if (!fee) continue;
      const key = fee.association.id;
      if (!associationRevenue[key]) {
        associationRevenue[key] = {
          name: fee.association.name,
          totalKobo: 0,
        };
      }
      associationRevenue[key].totalKobo += b._sum.amountKobo || 0;
    }

    return {
      totalUsers,
      totalAssociations,
      totalPayments,
      successfulPayments,
      totalCollectedKobo: totalCollected._sum.amountKobo || 0,
      associationRevenue: Object.entries(associationRevenue).map(
        ([id, val]) => ({
          associationId: id,
          name: val.name,
          totalKobo: val.totalKobo,
        }),
      ),
    };
  }
}
