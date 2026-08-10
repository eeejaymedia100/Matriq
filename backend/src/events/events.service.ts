import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(associationId: string, cursor?: string, take = 20) {
    const association = await this.prisma.association.findUnique({
      where: { id: associationId },
    });
    if (!association) {
      throw new NotFoundException("Association not found");
    }

    const takePlusOne = Math.min(take, 50) + 1;

    const events = await this.prisma.event.findMany({
      where: { associationId },
      take: takePlusOne,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { eventDate: "asc" },
      include: {
        _count: { select: { rsvps: true } },
      },
    });

    const hasMore = events.length > take;
    const items = hasMore ? events.slice(0, take) : events;

    return {
      events: items.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        location: e.location,
        eventDate: e.eventDate,
        rsvpCount: e._count.rsvps,
        createdAt: e.createdAt,
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
    description: string,
    location: string,
    eventDate: Date,
  ) {
    const event = await this.prisma.event.create({
      data: {
        associationId,
        authorExecutiveId,
        title,
        description,
        location,
        eventDate,
      },
    });

    this.logger.log(
      `Event created: ${event.id} in association ${associationId}`,
    );

    return {
      id: event.id,
      title: event.title,
      description: event.description,
      location: event.location,
      eventDate: event.eventDate,
      createdAt: event.createdAt,
    };
  }

  async toggleRsvp(eventId: string, userId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) {
      throw new NotFoundException("Event not found");
    }

    const existing = await this.prisma.eventRsvp.findUnique({
      where: {
        eventId_userId: { eventId, userId },
      },
    });

    if (existing) {
      // Un-RSVP (toggle off)
      await this.prisma.eventRsvp.delete({
        where: { eventId_userId: { eventId, userId } },
      });
      const count = await this.prisma.eventRsvp.count({
        where: { eventId },
      });
      return { rsvp: false, rsvpCount: count };
    }

    // RSVP
    await this.prisma.eventRsvp.create({
      data: { eventId, userId },
    });
    const count = await this.prisma.eventRsvp.count({
      where: { eventId },
    });
    return { rsvp: true, rsvpCount: count };
  }
}
