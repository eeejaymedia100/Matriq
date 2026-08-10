import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class MembershipsService {
  private readonly logger = new Logger(MembershipsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Join an association. Creates a pending membership.
   * Idempotent: if the user already has a membership (live or pending), return it.
   */
  async join(userId: string, associationId: string) {
    // Verify association exists and is active
    const association = await this.prisma.association.findUnique({
      where: { id: associationId },
    });
    if (!association || association.status !== "active") {
      throw new NotFoundException("Association not found");
    }

    // Check for existing membership
    const existing = await this.prisma.membership.findUnique({
      where: {
        userId_associationId: { userId, associationId },
      },
    });

    if (existing) {
      return {
        message: "Already a member",
        membership: {
          id: existing.id,
          status: existing.status,
          joinedAt: existing.joinedAt,
        },
        association: {
          id: association.id,
          name: association.name,
          shortCode: association.shortCode,
        },
      };
    }

    const membership = await this.prisma.membership.create({
      data: {
        userId,
        associationId,
        status: "pending",
      },
    });

    this.logger.log(
      `User ${userId} joined association ${associationId} (membership ${membership.id})`,
    );

    return {
      message: "Successfully joined",
      membership: {
        id: membership.id,
        status: membership.status,
        joinedAt: membership.joinedAt,
      },
      association: {
        id: association.id,
        name: association.name,
        shortCode: association.shortCode,
      },
    };
  }

  /**
   * Leave an association. Soft-deletes the membership.
   * Idempotent: if no membership exists, still return success.
   */
  async leave(userId: string, associationId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_associationId: { userId, associationId },
      },
    });

    if (!membership) {
      return { message: "Not a member" };
    }

    await this.prisma.membership.delete({
      where: { id: membership.id },
    });

    this.logger.log(`User ${userId} left association ${associationId}`);

    return { message: "Successfully left" };
  }

  /**
   * List all memberships for the current user.
   */
  async listByUser(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: {
        association: {
          select: {
            id: true,
            name: true,
            shortCode: true,
            faculty: true,
            status: true,
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    });

    return {
      memberships: memberships.map((m) => ({
        id: m.id,
        status: m.status,
        joinedAt: m.joinedAt,
        association: m.association,
      })),
      total: memberships.length,
    };
  }
}
