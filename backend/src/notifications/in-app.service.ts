import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export type NotificationType =
  | "verification"
  | "payment"
  | "dues"
  | "announcement"
  | "broadcast"
  | "vault"
  | "timetable"
  | "update"
  | "general";

export interface NotificationInput {
  title: string;
  body: string;
  type?: NotificationType;
  /** Deep link target within the app when the student taps the row. */
  link?: string;
}

/**
 * In-app notification feed (round-2 QA §5 + §9). The bell + feed inside the
 * app. Rows are created server-side alongside the business event that
 * triggered them; ntfy push (NotificationsService) is a separate, optional
 * delivery channel layered on top.
 *
 * All creators are fire-and-forget friendly: they never throw, so a
 * notification problem can never break the business operation that
 * triggered it.
 */
@Injectable()
export class InAppNotificationsService {
  private readonly logger = new Logger(InAppNotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Create a notification for one student. */
  async createForUser(
    userId: string,
    input: NotificationInput,
  ): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          userId,
          title: input.title.slice(0, 140),
          body: input.body.slice(0, 500),
          type: input.type ?? "general",
          link: input.link?.slice(0, 80) ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to create notification for ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Create the same notification for many students (batch insert). */
  async createForUsers(
    userIds: string[],
    input: NotificationInput,
  ): Promise<void> {
    const unique = [...new Set(userIds)].filter(Boolean);
    if (unique.length === 0) return;
    try {
      await this.prisma.notification.createMany({
        data: unique.map((userId) => ({
          userId,
          title: input.title.slice(0, 140),
          body: input.body.slice(0, 500),
          type: input.type ?? "general",
          link: input.link?.slice(0, 80) ?? null,
        })),
      });
    } catch (err) {
      this.logger.warn(
        `Failed to create ${unique.length} notifications: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Notify every live member of an association. */
  async createForAssociationMembers(
    associationId: string,
    input: NotificationInput,
  ): Promise<void> {
    try {
      const members = await this.prisma.membership.findMany({
        where: { associationId, status: "live" },
        select: { userId: true },
      });
      await this.createForUsers(
        members.map((m) => m.userId),
        input,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to notify association ${associationId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Platform-wide broadcast to every registered user. */
  async createForAllUsers(input: NotificationInput): Promise<void> {
    try {
      const users = await this.prisma.user.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });
      await this.createForUsers(
        users.map((u) => u.id),
        input,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to broadcast: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ── Student-facing reads ─────────────────────────────────────

  async listForUser(
    userId: string,
    cursor?: string,
    take = 30,
  ): Promise<{
    notifications: Array<{
      id: string;
      title: string;
      body: string;
      type: string;
      link: string | null;
      read: boolean;
      createdAt: Date;
    }>;
    pagination: { cursor: string | null; hasMore: boolean };
    unreadCount: number;
  }> {
    const takePlusOne = Math.min(take, 50) + 1;
    const [rows, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        take: takePlusOne,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;

    return {
      notifications: items.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        type: n.type,
        link: n.link,
        read: n.readAt !== null,
        createdAt: n.createdAt,
      })),
      pagination: {
        cursor: hasMore ? items[items.length - 1].id : null,
        hasMore,
      },
      unreadCount,
    };
  }

  async unreadCountFor(userId: string): Promise<number> {
    try {
      return this.prisma.notification.count({
        where: { userId, readAt: null },
      });
    } catch {
      return 0;
    }
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!notification) {
      throw new NotFoundException("Notification not found");
    }
    if (notification.readAt === null) {
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { readAt: new Date() },
      });
    }
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
