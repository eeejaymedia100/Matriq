import { Test, TestingModule } from "@nestjs/testing";
import { DashboardService } from "./dashboard.service";
import { PrismaService } from "../prisma/prisma.service";

describe("DashboardService", () => {
  let service: DashboardService;
  let prisma: {
    association: { findUnique: jest.Mock };
    membership: { count: jest.Mock };
    fee: { findMany: jest.Mock };
    payment: {
      findMany: jest.Mock;
      groupBy: jest.Mock;
      count: jest.Mock;
    };
    verificationRequest: { groupBy: jest.Mock };
    receipt: { findUnique: jest.Mock; update: jest.Mock };
    user: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      association: { findUnique: jest.fn() },
      membership: { count: jest.fn() },
      fee: { findMany: jest.fn() },
      payment: {
        findMany: jest.fn(),
        groupBy: jest.fn(),
        count: jest.fn(),
      },
      verificationRequest: { groupBy: jest.fn() },
      receipt: { findUnique: jest.fn(), update: jest.fn() },
      user: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  describe("getStats", () => {
    it("returns dashboard stats for an association", async () => {
      prisma.association.findUnique.mockResolvedValue({
        id: "assoc-1",
        name: "NAAS",
      });
      prisma.membership.count.mockResolvedValue(100);
      prisma.fee.findMany.mockResolvedValue([
        { amountKobo: 200000 },
        { amountKobo: 150000 },
      ]);
      prisma.payment.findMany
        .mockResolvedValueOnce(
          Array(80)
            .fill(0)
            .map((_, i) => ({
              userId: `user-${i}`,
              amountKobo: 200000,
              user: { fullName: `User ${i}` },
              fee: { id: "fee-1", name: "Dues" },
            })),
        )
        .mockResolvedValueOnce(
          Array(5)
            .fill(0)
            .map((_, i) => ({
              userId: `user-${i}`,
              amountKobo: 200000,
              status: "successful",
              paidAt: new Date(),
              createdAt: new Date(),
              user: { fullName: `User ${i}` },
              fee: { id: "fee-1", name: "Dues" },
            })),
        );
      prisma.payment.groupBy.mockResolvedValue([
        { userId: "user-1", _sum: { amountKobo: 400000 } },
      ]);
      prisma.verificationRequest.groupBy.mockResolvedValue([
        { userId: "user-1" },
        { userId: "user-2" },
      ]);
      prisma.payment.count.mockResolvedValueOnce(7).mockResolvedValueOnce(80);
      prisma.user.findMany.mockResolvedValue([
        { id: "user-1", fullName: "Top Payer" },
      ]);

      const result = await service.getStats("assoc-1");

      expect(result.totalMembers).toBe(100);
      expect(result.confirmedMembers).toBe(2);
      expect(result.totalFees).toBe(2);
      expect(result.totalCollectedKobo).toBe(16000000);
      expect(result.paymentRate).toBe(46);
      expect(result.pendingPayments).toBe(7);
      expect(result.successfulPayments).toBe(80);
      expect(result.topPayers).toHaveLength(1);
      expect(result.topPayers[0].name).toBe("Top Payer");
    });

    it("throws NotFoundException for missing association", async () => {
      prisma.association.findUnique.mockResolvedValue(null);
      await expect(service.getStats("bad-id")).rejects.toThrow(
        "Association not found",
      );
    });
  });
});
