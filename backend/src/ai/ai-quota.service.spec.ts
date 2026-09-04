import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AiQuotaService } from "./ai-quota.service";
import { PrismaService } from "../prisma/prisma.service";
import { EntitlementService } from "../entitlement/entitlement.service";

describe("AiQuotaService", () => {
  let service: AiQuotaService;

  const mockPrisma = {
    aiQueryLog: {
      count: jest.fn(),
    },
  };

  const env: Record<string, string> = {
    QUICKIE_FREE_DAILY: "20",
  };

  const mockConfigService = {
    get: jest.fn((key: string) => env[key]),
  };

  const mockEntitlements = {
    status: jest.fn().mockResolvedValue({ isPremium: false }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    env.QUICKIE_FREE_DAILY = "20";

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiQuotaService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EntitlementService, useValue: mockEntitlements },
      ],
    }).compile();

    service = module.get<AiQuotaService>(AiQuotaService);
  });

  describe("status", () => {
    it("reports premium users as unlimited", async () => {
      mockEntitlements.status.mockResolvedValueOnce({ isPremium: true });

      const s = await service.status("u1");

      expect(s.isPremium).toBe(true);
      expect(s.limit).toBeNull();
      expect(s.remainingToday).toBeNull();
      // Premium status must never even consult the counter.
      expect(mockPrisma.aiQueryLog.count).not.toHaveBeenCalled();
    });

    it("reports remaining free questions for a free user", async () => {
      mockPrisma.aiQueryLog.count.mockResolvedValueOnce(13);

      const s = await service.status("u1");

      expect(s.isPremium).toBe(false);
      expect(s.limit).toBe(20);
      expect(s.usedToday).toBe(13);
      expect(s.remainingToday).toBe(7);
    });

    it("clamps remaining at zero when over the limit", async () => {
      mockPrisma.aiQueryLog.count.mockResolvedValueOnce(50);

      const s = await service.status("u1");

      expect(s.remainingToday).toBe(0);
    });
  });

  describe("authorize", () => {
    it("allows premium users without counting", async () => {
      mockEntitlements.status.mockResolvedValueOnce({ isPremium: true });

      await expect(service.authorize("u1")).resolves.toBeUndefined();
      expect(mockPrisma.aiQueryLog.count).not.toHaveBeenCalled();
    });

    it("allows a free user who is under the daily cap", async () => {
      mockPrisma.aiQueryLog.count.mockResolvedValueOnce(19);

      await expect(service.authorize("u1")).resolves.toBeUndefined();
    });

    it("throws 403 QUICKIE_LIMIT when the free budget is exhausted", async () => {
      mockPrisma.aiQueryLog.count.mockResolvedValueOnce(20);

      let caught: unknown;
      try {
        await service.authorize("u1");
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ForbiddenException);
      const response = (caught as ForbiddenException).getResponse() as {
        code: string;
        message: string;
      };
      expect(response.code).toBe("QUICKIE_LIMIT");
      expect(response.message).toContain("20 free questions");
    });

    it("counts only real (non-cached) generations", async () => {
      mockPrisma.aiQueryLog.count.mockResolvedValueOnce(0);

      await service.authorize("u1");

      expect(mockPrisma.aiQueryLog.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ cached: false }),
        }),
      );
    });

    it("counts only today's rows (midnight UTC window)", async () => {
      mockPrisma.aiQueryLog.count.mockResolvedValueOnce(0);

      await service.authorize("u1");

      const call = mockPrisma.aiQueryLog.count.mock.calls[0][0] as {
        where: { createdAt: { gte: Date } };
      };
      const start = call.where.createdAt.gte;
      expect(start.getUTCHours()).toBe(0);
      expect(start.getUTCMinutes()).toBe(0);
      expect(start.getUTCSeconds()).toBe(0);
      expect(start.getUTCMilliseconds()).toBe(0);
    });
  });

  describe("configuration", () => {
    it("falls back to the default cap when the env var is missing", async () => {
      delete env.QUICKIE_FREE_DAILY;
      mockPrisma.aiQueryLog.count.mockResolvedValueOnce(0);

      const s = await service.status("u1");

      expect(s.limit).toBe(20);
    });

    it("ignores non-numeric env values", async () => {
      env.QUICKIE_FREE_DAILY = "lots";
      mockPrisma.aiQueryLog.count.mockResolvedValueOnce(0);

      const s = await service.status("u1");

      expect(s.limit).toBe(20);
    });

    it("honours a configured cap of zero (cloud AI off for free tier)", async () => {
      env.QUICKIE_FREE_DAILY = "0";
      mockPrisma.aiQueryLog.count.mockResolvedValueOnce(0);

      let caught: unknown;
      try {
        await service.authorize("u1");
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ForbiddenException);
    });
  });
});
