import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(associationId: string, cursor?: string, take = 20) {
    const association = await this.prisma.association.findUnique({
      where: { id: associationId },
    });
    if (!association) {
      throw new NotFoundException("Association not found");
    }

    const takePlusOne = Math.min(take, 50) + 1;

    const announcements = await this.prisma.announcement.findMany({
      where: { associationId },
      take: takePlusOne,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      include: {
        author: {
          select: {
            role: true,
            user: { select: { fullName: true } },
          },
        },
        _count: { select: { reads: true } },
      },
    });

    const hasMore = announcements.length > take;
    const items = hasMore ? announcements.slice(0, take) : announcements;

    return {
      announcements: items.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        pinned: a.pinned,
        author: {
          name: a.author.user?.fullName ?? "Executive",
          role: a.author.role,
        },
        readCount: a._count.reads,
        createdAt: a.createdAt,
      })),
      pagination: {
        cursor: hasMore ? items[items.length - 1].id : null,
        hasMore,
      },
    };
  }

  async create(
    associationId: string,
    authorExecutiveId: string,
    title: string,
    body: string,
    pinned = false,
  ) {
    const announcement = await this.prisma.announcement.create({
      data: {
        associationId,
        authorExecutiveId,
        title,
        body,
        pinned,
      },
      include: {
        author: {
          select: {
            role: true,
            user: { select: { fullName: true } },
          },
        },
      },
    });

    this.logger.log(
      `Announcement created: ${announcement.id} in association ${associationId}`,
    );

    return {
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      pinned: announcement.pinned,
      author: {
        name: announcement.author.user?.fullName ?? "Executive",
        role: announcement.author.role,
      },
      createdAt: announcement.createdAt,
    };
  }

  async markRead(announcementId: string, userId: string) {
    const announcement = await this.prisma.announcement.findUnique({
      where: { id: announcementId },
    });
    if (!announcement) {
      throw new NotFoundException("Announcement not found");
    }

    await this.prisma.announcementRead.upsert({
      where: {
        announcementId_userId: { announcementId, userId },
      },
      create: { announcementId, userId },
      update: { readAt: new Date() },
    });

    // Return updated read count
    const count = await this.prisma.announcementRead.count({
      where: { announcementId },
    });

    return { read: true, readCount: count };
  }

  async getReads(announcementId: string) {
    const announcement = await this.prisma.announcement.findUnique({
      where: { id: announcementId },
      include: {
        _count: { select: { reads: true } },
      },
    });
    if (!announcement) {
      throw new NotFoundException("Announcement not found");
    }

    const reads = await this.prisma.announcementRead.findMany({
      where: { announcementId },
      include: {
        user: { select: { id: true, fullName: true } },
      },
      orderBy: { readAt: "desc" },
    });

    return {
      announcementId,
      title: announcement.title,
      readCount: announcement._count.reads,
      readers: reads.map((r) => ({
        userId: r.user.id,
        fullName: r.user.fullName,
        readAt: r.readAt,
      })),
    };
  }
}
