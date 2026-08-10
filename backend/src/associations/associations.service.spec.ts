import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { AssociationsService } from "./associations.service";
import { PrismaService } from "../prisma/prisma.service";

describe("AssociationsService", () => {
  let service: AssociationsService;
  let prisma: PrismaService;

  const mockAssociation = {
    id: "assoc-1",
    name: "NAAS",
    shortCode: "NAAS",
    faculty: "Agriculture",
    whatsappNumber: "+2348000000000",
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { memberships: 42, fees: 3 },
  };

  beforeEach(async () => {
    const mockPrisma = {
      association: {
        findMany: jest.fn().mockResolvedValue([mockAssociation]),
        findUnique: jest.fn().mockResolvedValue(mockAssociation),
        count: jest.fn().mockResolvedValue(1),
      },
      fee: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "fee-1",
            name: "NAAS Dues 2026/2027",
            amountKobo: 200000,
            currency: "NGN",
            dueDate: new Date("2026-12-31"),
            session: "2026/2027",
          },
        ]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssociationsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AssociationsService>(AssociationsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe("list", () => {
    it("should return paginated associations with member counts", async () => {
      const result = await service.list();

      expect(result.associations).toHaveLength(1);
      expect(result.associations[0].name).toBe("NAAS");
      expect(result.associations[0].memberCount).toBe(42);
      expect(result.pagination.total).toBe(1);
    });

    it("should detect hasMore and return next cursor", async () => {
      (prisma.association.findMany as jest.Mock).mockResolvedValue([
        mockAssociation,
        { ...mockAssociation, id: "assoc-2" },
      ]);

      const result = await service.list(undefined, 1);

      expect(result.associations).toHaveLength(1);
      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.cursor).toBe("assoc-1");
    });
  });

  describe("getById", () => {
    it("should return association detail", async () => {
      const result = await service.getById("assoc-1");

      expect(result.name).toBe("NAAS");
      expect(result.memberCount).toBe(42);
    });

    it("should throw when association not found", async () => {
      (prisma.association.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.getById("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getFees", () => {
    it("should return fees for an association", async () => {
      const result = await service.getFees("assoc-1");

      expect(result.fees).toHaveLength(1);
      expect(result.fees[0].name).toBe("NAAS Dues 2026/2027");
      expect(result.association.name).toBe("NAAS");
    });

    it("should throw when association not found", async () => {
      (prisma.association.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.getFees("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
