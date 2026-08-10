import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { AnnouncementsService } from "./announcements.service";
import { PrismaService } from "../prisma/prisma.service";

describe("AnnouncementsService", () => {
  let service: AnnouncementsService;
  let prisma: PrismaService;

  const mockAnnouncement = {
    id: "ann-1",
    associationId: "assoc-1",
    authorExecutiveId: "exec-1",
    title: "Welcome",
    body: "Welcome to NAAS!",
    pinned: false,
    createdAt: new Date(),
    author: {
      role: "president",
      user: { fullName: "President Name" },
    },
    _count: { reads: 5 },
  };

  beforeEach(async () => {
    const mockPrisma = {
      association: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "assoc-1", name: "NAAS" }),
      },
      announcement: {
        findMany: jest.fn().mockResolvedValue([mockAnnouncement]),
        findUnique: jest.fn().mockResolvedValue(mockAnnouncement),
        create: jest.fn().mockResolvedValue(mockAnnouncement),
      },
      announcementRead: {
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([
          {
            user: { id: "user-1", fullName: "Test User" },
            readAt: new Date(),
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnnouncementsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AnnouncementsService>(AnnouncementsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe("list", () => {
    it("should return paginated announcements with read counts", async () => {
      const result = await service.list("assoc-1");

      expect(result.announcements).toHaveLength(1);
      expect(result.announcements[0].title).toBe("Welcome");
      expect(result.announcements[0].readCount).toBe(5);
    });

    it("should throw when association not found", async () => {
      (prisma.association.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.list("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("create", () => {
    it("should create and return an announcement", async () => {
      const result = await service.create("assoc-1", "exec-1", "Title", "Body");

      expect(result.title).toBe("Welcome");
      expect(prisma.announcement.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("markRead", () => {
    it("should upsert a read receipt and return count", async () => {
      const result = await service.markRead("ann-1", "user-1");

      expect(result.read).toBe(true);
      expect(result.readCount).toBe(1);
      expect(prisma.announcementRead.upsert).toHaveBeenCalledTimes(1);
    });

    it("should throw when announcement not found", async () => {
      (prisma.announcement.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.markRead("nonexistent", "user-1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getReads", () => {
    it("should return readers list", async () => {
      const result = await service.getReads("ann-1");

      expect(result.readers).toHaveLength(1);
      expect(result.readers[0].fullName).toBe("Test User");
    });
  });
});
