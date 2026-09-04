import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { BannersService } from "./banners.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

describe("BannersService", () => {
  let service: BannersService;
  let prisma: PrismaService;

  const mockBanner = {
    id: "b-1",
    title: "Exam timetable",
    body: "Final exams start Monday.",
    linkLabel: null,
    linkUrl: null,
    published: true,
    startsAt: null,
    endsAt: null,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrisma = {
      banner: {
        findMany: jest.fn().mockResolvedValue([mockBanner]),
        findUnique: jest.fn().mockResolvedValue(mockBanner),
        create: jest.fn().mockResolvedValue(mockBanner),
        update: jest.fn().mockResolvedValue(mockBanner),
        delete: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((ops) => Promise.all(ops)),
    };

    const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BannersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<BannersService>(BannersService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe("listActive", () => {
    it("filters to published banners within the schedule window", async () => {
      const result = await service.listActive();
      expect(result.banners).toHaveLength(1);
      const where = (prisma.banner.findMany as jest.Mock).mock.calls[0][0]
        .where as Record<string, unknown>;
      expect(where.published).toBe(true);
      expect(where.OR).toBeDefined();
      expect(where.AND).toBeDefined();
    });
  });

  describe("listAll", () => {
    it("computes the live flag from publish state + schedule", async () => {
      (prisma.banner.findMany as jest.Mock).mockResolvedValue([
        { ...mockBanner, published: true },
        {
          ...mockBanner,
          id: "b-2",
          published: true,
          startsAt: new Date(Date.now() + 60_000),
        },
        { ...mockBanner, id: "b-3", published: false },
      ]);
      const result = await service.listAll();
      expect(result.banners[0].live).toBe(true);
      expect(result.banners[1].live).toBe(false); // scheduled in the future
      expect(result.banners[2].live).toBe(false); // draft
    });
  });

  describe("create — validation hardening", () => {
    it("rejects an over-length title", async () => {
      await expect(
        service.create({ title: "x".repeat(121), body: "b" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects an over-length body", async () => {
      await expect(
        service.create({ title: "t", body: "x".repeat(501) }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects endsAt before startsAt", async () => {
      await expect(
        service.create({
          title: "t",
          body: "b",
          startsAt: new Date("2026-10-10T10:00:00Z").toISOString(),
          endsAt: new Date("2026-10-01T10:00:00Z").toISOString(),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("accepts a valid scheduled banner", async () => {
      await expect(
        service.create({
          title: "t",
          body: "b",
          startsAt: new Date("2026-10-01T10:00:00Z").toISOString(),
          endsAt: new Date("2026-10-10T10:00:00Z").toISOString(),
        }),
      ).resolves.toBeDefined();
    });
  });

  describe("update — schedule hardening", () => {
    it("rejects setting endsAt before the existing startsAt", async () => {
      (prisma.banner.findUnique as jest.Mock).mockResolvedValue({
        ...mockBanner,
        startsAt: new Date("2026-10-10T10:00:00Z"),
      });
      await expect(
        service.update("b-1", {
          endsAt: new Date("2026-10-01T10:00:00Z").toISOString(),
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("create", () => {
    it("rejects empty title/body", async () => {
      await expect(
        service.create({ title: " ", body: "x" }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create({ title: "x", body: "" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects non-http linkUrl", async () => {
      await expect(
        service.create({ title: "t", body: "b", linkUrl: "javascript:alert(1)" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("creates a banner with defaults", async () => {
      await service.create({ title: "t", body: "b" });
      const data = (prisma.banner.create as jest.Mock).mock.calls[0][0].data;
      expect(data.published).toBe(false);
      expect(data.sortOrder).toBe(0);
      expect(data.startsAt).toBeNull();
    });
  });

  describe("update", () => {
    it("throws when the banner does not exist", async () => {
      (prisma.banner.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.update("nope", { title: "t" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("applies only provided fields", async () => {
      await service.update("b-1", { published: true });
      const data = (prisma.banner.update as jest.Mock).mock.calls[0][0].data;
      expect(data.published).toBe(true);
      expect(data.title).toBeUndefined();
    });
  });

  describe("remove", () => {
    it("deletes an existing banner", async () => {
      const result = await service.remove("b-1");
      expect(result.ok).toBe(true);
      expect(prisma.banner.delete).toHaveBeenCalledWith({ where: { id: "b-1" } });
    });
  });

  describe("reorder", () => {
    it("applies the new order in one transaction", async () => {
      await service.reorder([
        { id: "b-2", sortOrder: 0 },
        { id: "b-1", sortOrder: 1 },
      ]);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.banner.update).toHaveBeenCalledTimes(2);
    });

    it("rejects an empty reorder list", async () => {
      await expect(service.reorder([])).rejects.toThrow(BadRequestException);
    });

    it("rejects duplicate ids", async () => {
      await expect(
        service.reorder([
          { id: "b-1", sortOrder: 0 },
          { id: "b-1", sortOrder: 1 },
        ]),
      ).rejects.toThrow(BadRequestException);
    });
  });
});