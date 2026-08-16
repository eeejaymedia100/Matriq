import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { InAppNotificationsService } from "../notifications/in-app.service";

export interface CreateTimetableUpdateDto {
  title: string;
  body: string;
  department?: string;
  level?: string;
}

/**
 * Real-time class/timetable updates (round-2 QA §2). An executive or class
 * rep pushes a change ("GST 202 moved to 2pm") scoped by department + level;
 * students matching that scope see it in their Timetable and get a branded
 * in-app notification. Null department/level means "all".
 */
@Injectable()
export class TimetableService {
  private readonly logger = new Logger(TimetableService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inAppNotificationsService: InAppNotificationsService,
  ) {}

  /** Student view — updates scoped to the caller's department + level. */
  async listForStudent(userId: string, associationId: string) {
    const association = await this.prisma.association.findUnique({
      where: { id: associationId },
    });
    if (!association) throw new NotFoundException("Association not found");

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { department: true, level: true },
    });

    const updates = await this.prisma.timetableUpdate.findMany({
      where: {
        associationId,
        OR: [
          { department: null, level: null },
          ...(user?.department
            ? [{ department: user.department, level: null as string | null }]
            : []),
          ...(user?.level
            ? [{ department: null as string | null, level: user.level }]
            : []),
          ...(user?.department && user?.level
            ? [{ department: user.department, level: user.level }]
            : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        title: true,
        body: true,
        department: true,
        level: true,
        createdAt: true,
        author: { select: { user: { select: { fullName: true } }, role: true } },
      },
    });

    return {
      updates: updates.map((u) => ({
        id: u.id,
        title: u.title,
        body: u.body,
        department: u.department,
        level: u.level,
        createdAt: u.createdAt,
        author: {
          name: u.author.user?.fullName ?? "Executive",
          role: u.author.role,
        },
      })),
      total: updates.length,
    };
  }

  /** Executive view — every update for the association (no student scoping). */
  async listForExecutive(associationId: string) {
    const association = await this.prisma.association.findUnique({
      where: { id: associationId },
    });
    if (!association) throw new NotFoundException("Association not found");

    const updates = await this.prisma.timetableUpdate.findMany({
      where: { associationId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        body: true,
        department: true,
        level: true,
        createdAt: true,
        author: { select: { user: { select: { fullName: true } }, role: true } },
      },
    });

    return {
      updates: updates.map((u) => ({
        id: u.id,
        title: u.title,
        body: u.body,
        department: u.department,
        level: u.level,
        createdAt: u.createdAt,
        author: {
          name: u.author.user?.fullName ?? "Executive",
          role: u.author.role,
        },
      })),
      total: updates.length,
    };
  }

  /** Executive: push a timetable change + notify affected members. */
  async create(
    associationId: string,
    authorExecutiveId: string,
    dto: CreateTimetableUpdateDto,
  ) {
    const association = await this.prisma.association.findUnique({
      where: { id: associationId },
    });
    if (!association) throw new NotFoundException("Association not found");

    const title = dto.title?.trim();
    const body = dto.body?.trim();
    if (!title || !body) {
      throw new BadRequestException(
        "Give the update a short title and the change itself.",
      );
    }

    const update = await this.prisma.timetableUpdate.create({
      data: {
        associationId,
        authorExecutiveId,
        department: dto.department?.trim().slice(0, 120) || null,
        level: dto.level?.trim().slice(0, 40) || null,
        title: title.slice(0, 140),
        body: body.slice(0, 500),
      },
    });

    this.logger.log(
      `Timetable update created: ${update.id} in association ${associationId} (${update.department ?? "*"} / ${update.level ?? "*"})`,
    );

    // Branded in-app class notification (round-2 QA §9/§10).
    void this.inAppNotificationsService.createForAssociationMembers(
      associationId,
      {
        title,
        body: body.slice(0, 240),
        type: "timetable",
        link: "Timetable",
      },
    );

    return {
      id: update.id,
      title: update.title,
      body: update.body,
      department: update.department,
      level: update.level,
      createdAt: update.createdAt,
    };
  }
}
