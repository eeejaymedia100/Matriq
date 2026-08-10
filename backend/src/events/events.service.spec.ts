import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { EventsService } from "./events.service";
import { PrismaService } from "../prisma/prisma.service";

describe("EventsService", () => {
  let service: EventsService;
  let prisma: PrismaService;

  const mockEvent = {
    id: "evt-1",
    associationId: "assoc-1",
    authorExecutiveId: "exec-1",
    title: "General Meeting",
    description: "Monthly general meeting",
    location: "Auditorium",
    eventDate: new Date("2026-09-15"),
    createdAt: new Date(),
    _count: { rsvps: 3 },
  };

  beforeEach(async () => {
    const mockPrisma = {
      association: {
        findUnique: jest.fn().mockResolvedValue({ id: "assoc-1" }),
      },
      event: {
        findMany: jest.fn().mockResolvedValue([mockEvent]),
        findUnique: jest.fn().mockResolvedValue(mockEvent),
        create: jest.fn().mockResolvedValue(mockEvent),
      },
      eventRsvp: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(3),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe("list", () => {
    it("should return paginated events with RSVP counts", async () => {
      const result = await service.list("assoc-1");

      expect(result.events).toHaveLength(1);
      expect(result.events[0].rsvpCount).toBe(3);
    });

    it("should throw when association not found", async () => {
      (prisma.association.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.list("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("create", () => {
    it("should create and return an event", async () => {
      const result = await service.create(
        "assoc-1",
        "exec-1",
        "Meeting",
        "Desc",
        "Auditorium",
        new Date("2026-09-15"),
      );

      expect(result.title).toBe("General Meeting");
      expect(prisma.event.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("toggleRsvp", () => {
    it("should RSVP when not already RSVP'd", async () => {
      const result = await service.toggleRsvp("evt-1", "user-1");

      expect(result.rsvp).toBe(true);
      expect(prisma.eventRsvp.create).toHaveBeenCalledTimes(1);
    });

    it("should un-RSVP when already RSVP'd", async () => {
      (prisma.eventRsvp.findUnique as jest.Mock).mockResolvedValue({
        eventId: "evt-1",
        userId: "user-1",
      });

      const result = await service.toggleRsvp("evt-1", "user-1");

      expect(result.rsvp).toBe(false);
      expect(prisma.eventRsvp.delete).toHaveBeenCalledTimes(1);
    });

    it("should throw when event not found", async () => {
      (prisma.event.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.toggleRsvp("nonexistent", "user-1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
