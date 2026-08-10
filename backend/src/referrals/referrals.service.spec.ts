import { Test, TestingModule } from "@nestjs/testing";
import { ReferralsService } from "./referrals.service";
import { PrismaService } from "../prisma/prisma.service";

describe("ReferralsService", () => {
  let service: ReferralsService;
  let prisma: PrismaService;

  const mockReferral = {
    id: "ref-uuid-12345678",
    referrerId: "user-1",
    referredUserId: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrisma = {
      referral: {
        create: jest.fn().mockResolvedValue(mockReferral),
        findMany: jest.fn().mockResolvedValue([mockReferral]),
        count: jest.fn().mockResolvedValue(5),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReferralsService>(ReferralsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe("createReferral", () => {
    it("should create a referral and return share code", async () => {
      const result = await service.createReferral("user-1");

      expect(result.shareCode).toBe("ref-uuid");
      expect(prisma.referral.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("listByUser", () => {
    it("should return referrals with stats", async () => {
      const result = await service.listByUser("user-1");

      expect(result.referrals).toHaveLength(1);
      expect(result.stats.total).toBe(5);
    });

    it("should detect ambassador status", async () => {
      // 10 converted = ambassador
      (prisma.referral.count as jest.Mock)
        .mockResolvedValueOnce(12) // total
        .mockResolvedValueOnce(10); // converted (second call)

      const result = await service.listByUser("user-1");

      expect(result.stats.isAmbassador).toBe(true);
    });
  });
});
