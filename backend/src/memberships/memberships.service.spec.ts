import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { MembershipsService } from "./memberships.service";
import { PrismaService } from "../prisma/prisma.service";

describe("MembershipsService", () => {
  let service: MembershipsService;
  let prisma: PrismaService;

  const mockAssociation = {
    id: "assoc-1",
    name: "NAAS",
    shortCode: "NAAS",
    faculty: "Agriculture",
    status: "active",
  };

  const mockMembership = {
    id: "mem-1",
    userId: "user-1",
    associationId: "assoc-1",
    status: "pending",
    joinedAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrisma = {
      association: {
        findUnique: jest.fn().mockResolvedValue(mockAssociation),
      },
      membership: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(mockMembership),
        delete: jest.fn().mockResolvedValue(mockMembership),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembershipsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<MembershipsService>(MembershipsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe("join", () => {
    it("should create a pending membership", async () => {
      const result = await service.join("user-1", "assoc-1");

      expect(result.message).toContain("Successfully joined");
      expect(result.membership.status).toBe("pending");
      expect(prisma.membership.create).toHaveBeenCalledTimes(1);
    });

    it("should return existing membership if already joined", async () => {
      (prisma.membership.findUnique as jest.Mock).mockResolvedValue(
        mockMembership,
      );

      const result = await service.join("user-1", "assoc-1");

      expect(result.message).toBe("Already a member");
      expect(prisma.membership.create).not.toHaveBeenCalled();
    });

    it("should throw when association not found or suspended", async () => {
      (prisma.association.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.join("user-1", "nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("leave", () => {
    it("should delete the membership", async () => {
      (prisma.membership.findUnique as jest.Mock).mockResolvedValue(
        mockMembership,
      );

      const result = await service.leave("user-1", "assoc-1");

      expect(result.message).toBe("Successfully left");
      expect(prisma.membership.delete).toHaveBeenCalledTimes(1);
    });

    it("should succeed even if not a member", async () => {
      const result = await service.leave("user-1", "assoc-1");

      expect(result.message).toBe("Not a member");
      expect(prisma.membership.delete).not.toHaveBeenCalled();
    });
  });

  describe("listByUser", () => {
    it("should return user memberships", async () => {
      (prisma.membership.findMany as jest.Mock).mockResolvedValue([
        {
          ...mockMembership,
          association: mockAssociation,
        },
      ]);

      const result = await service.listByUser("user-1");

      expect(result.memberships).toHaveLength(1);
      expect(result.memberships[0].association.name).toBe("NAAS");
      expect(result.total).toBe(1);
    });

    it("should return empty list when no memberships", async () => {
      const result = await service.listByUser("user-1");

      expect(result.memberships).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });
});
