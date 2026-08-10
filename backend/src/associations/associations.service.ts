import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AssociationsService {
  private readonly logger = new Logger(AssociationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Paginated list of active associations.
   */
  async list(cursor?: string, take = 20) {
    const where = { status: "active" as const };

    const [associations, total] = await Promise.all([
      this.prisma.association.findMany({
        where,
        take: take + 1, // fetch one extra to detect next page
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { name: "asc" },
        include: {
          _count: { select: { memberships: true } },
        },
      }),
      this.prisma.association.count({ where }),
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
        createdAt: a.createdAt,
      })),
      pagination: { cursor: nextCursor, hasMore, total },
    };
  }

  /**
   * Single association detail.
   */
  async getById(id: string) {
    const association = await this.prisma.association.findUnique({
      where: { id },
      include: {
        _count: { select: { memberships: true, fees: true } },
      },
    });

    if (!association) {
      throw new NotFoundException("Association not found");
    }

    return {
      id: association.id,
      name: association.name,
      shortCode: association.shortCode,
      faculty: association.faculty,
      whatsappNumber: association.whatsappNumber,
      status: association.status,
      memberCount: association._count.memberships,
      feeCount: association._count.fees,
      createdAt: association.createdAt,
    };
  }

  /**
   * List fees for an association. Requires membership.
   */
  async getFees(associationId: string) {
    // Verify association exists
    const association = await this.prisma.association.findUnique({
      where: { id: associationId },
    });
    if (!association) {
      throw new NotFoundException("Association not found");
    }

    const fees = await this.prisma.fee.findMany({
      where: { associationId },
      orderBy: { dueDate: "desc" },
    });

    return {
      association: { id: association.id, name: association.name },
      fees: fees.map((f) => ({
        id: f.id,
        name: f.name,
        amountKobo: f.amountKobo,
        currency: f.currency,
        dueDate: f.dueDate,
        session: f.session,
      })),
      total: fees.length,
    };
  }
}
