import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { ForbiddenException } from "@nestjs/common";
import { EntitlementService } from "./entitlement.service";
import { PrismaService } from "../prisma/prisma.service";

describe("EntitlementService", () => {
  let service: EntitlementService;
  let prisma: {
    magicPlusEntitlement: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      upsert: jest.Mock;
    };
  };

  const mockConfig = {
    get: jest.fn((key: string) => (key === "FOCUS_FREE_ALLOWANCE" ? "10" : undefined)),
  };

  beforeEach(async () => {
    prisma = {
      magicPlusEntitlement: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntitlementService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<EntitlementService>(EntitlementService);
  });

  describe("authorizeGeneration (free allowance / premium gate)", () => {
    it("creates an entitlement row on first use and allows the first generation", async () => {
      // ensureRow: 1st findUnique → null (triggers create), 2nd (inside status)
      // → the post-increment row with 1 used.
      prisma.magicPlusEntitlement.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValue({
          userId: "u1",
          status: "active",
          source: "free_allowance",
          plan: "magic_plus",
          freeGenerationLimit: 10,
          freeGenerationsUsed: 1,
          expiresAt: null,
        });
      prisma.magicPlusEntitlement.create.mockResolvedValue({
        userId: "u1",
        status: "active",
        source: "free_allowance",
        plan: "magic_plus",
        freeGenerationLimit: 10,
        freeGenerationsUsed: 0,
        expiresAt: null,
      });
      prisma.magicPlusEntitlement.update.mockResolvedValue({
        userId: "u1",
        status: "active",
        source: "free_allowance",
        plan: "magic_plus",
        freeGenerationLimit: 10,
        freeGenerationsUsed: 1,
        expiresAt: null,
      });

      const status = await service.authorizeGeneration("u1");
      expect(status.freeRemaining).toBe(9);
      expect(prisma.magicPlusEntitlement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ freeGenerationsUsed: { increment: 1 } }),
        }),
      );
    });

    it("throws MAGIC_PLUS_REQUIRED when the free allowance is exhausted for a free user", async () => {
      prisma.magicPlusEntitlement.findUnique.mockResolvedValue({
        userId: "u1",
        status: "active",
        source: "free_allowance",
        plan: "magic_plus",
        freeGenerationLimit: 10,
        freeGenerationsUsed: 10,
        expiresAt: null,
      });

      await expect(service.authorizeGeneration("u1")).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.magicPlusEntitlement.update).not.toHaveBeenCalled();
    });

    it("allows unlimited generation for a premium (paid/granted) user without consuming allowance", async () => {
      prisma.magicPlusEntitlement.findUnique.mockResolvedValue({
        userId: "u1",
        status: "active",
        source: "subscription",
        plan: "magic_plus",
        freeGenerationLimit: 10,
        freeGenerationsUsed: 10,
        expiresAt: new Date(Date.now() + 86_400_000),
      });

      const status = await service.authorizeGeneration("u1");
      expect(status.isPremium).toBe(true);
      expect(status.freeRemaining).toBeNull();
      expect(prisma.magicPlusEntitlement.update).not.toHaveBeenCalled();
    });

    it("blocks a suspended entitlement", async () => {
      prisma.magicPlusEntitlement.findUnique.mockResolvedValue({
        userId: "u1",
        status: "suspended",
        source: "subscription",
        plan: "magic_plus",
        freeGenerationLimit: 10,
        freeGenerationsUsed: 0,
        expiresAt: null,
      });

      await expect(service.authorizeGeneration("u1")).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe("status", () => {
    it("reports remaining free allowance for a free user", async () => {
      prisma.magicPlusEntitlement.findUnique.mockResolvedValue({
        userId: "u1",
        status: "active",
        source: "free_allowance",
        plan: "magic_plus",
        freeGenerationLimit: 10,
        freeGenerationsUsed: 4,
        expiresAt: null,
      });

      const status = await service.status("u1");
      expect(status.freeRemaining).toBe(6);
      expect(status.isPremium).toBe(false);
      expect(status.entitled).toBe(true);
    });
  });
});