import { Test, TestingModule } from "@nestjs/testing";
import { DeletionService } from "./deletion.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

/**
 * A transaction mock where any model.method(...) is a resolved no-op jest.fn.
 * Nested access (tx.user.delete) is cached per path so tests can configure
 * the same function the service actually calls.
 */
function txMock() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const make = (): any => {
    const fn = jest.fn().mockResolvedValue(undefined);
    return new Proxy(fn, {
      get(target, prop) {
        const key = String(prop);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (key in target) return (target as any)[key];
        if (key === "then") return undefined;
        const nested = make();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (target as any)[key] = nested;
        return nested;
      },
      apply(_target, _thisArg, args) {
        return (fn as jest.Mock)(...args);
      },
    });
  };
  return make() as unknown as Record<string, Record<string, jest.Mock>> & {
    user: { delete: jest.Mock; update: jest.Mock };
  };
}

describe("DeletionService", () => {
  let service: DeletionService;
  let prisma: PrismaService;

  const mockPrisma = () => ({
    user: {
      update: jest.fn().mockResolvedValue({ id: "user-1" }),
      findUnique: jest.fn().mockResolvedValue({ deletionScheduledAt: null }),
      findMany: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({ id: "placeholder" }),
    },
    refreshTokenFamily: { findMany: jest.fn().mockResolvedValue([]) },
    refreshToken: { updateMany: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn().mockResolvedValue(undefined),
  });

  const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeletionService,
        { provide: PrismaService, useValue: mockPrisma() },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<DeletionService>(DeletionService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe("request", () => {
    it("schedules deletion ~6 months out and revokes sessions", async () => {
      const result = await service.request("user-1", "1.2.3.4");

      const update = (prisma.user.update as jest.Mock).mock.calls[0][0];
      const scheduledFor = update.data.deletionScheduledAt as Date;
      const now = Date.now();

      expect(scheduledFor.getTime() - now).toBeGreaterThan(
        5 * 30 * 24 * 3600 * 1000,
      );
      expect(scheduledFor.getTime() - now).toBeLessThan(
        7 * 30 * 24 * 3600 * 1000,
      );
      expect(result.cancelsOnLogin).toBe(true);
      expect(prisma.refreshTokenFamily.findMany).toHaveBeenCalled();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorType: "student",
          action: "user.deletion_scheduled",
          actorId: "user-1",
        }),
      );
    });

    it("cancels an existing schedule explicitly", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        deletionScheduledAt: new Date(Date.now() + 1000),
      });
      const result = await service.cancel("user-1", "1.2.3.4");

      expect(result.cancelled).toBe(true);
      expect((prisma.user.update as jest.Mock).mock.calls[0][0].data).toEqual({
        deletionScheduledAt: null,
      });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: "user.deletion_cancelled" }),
      );
    });
  });

  describe("sweep", () => {
    it("hard-deletes accounts past their window via a transaction", async () => {
      const due = [{ id: "user-1", email: "a@b.c" }];
      (prisma.user.findMany as jest.Mock).mockResolvedValue(due);
      const tx = txMock();
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (fn: (t: unknown) => Promise<void>) => fn(tx),
      );

      const result = await service.sweep();

      expect(result).toEqual({ deleted: 1, failed: 0 });
      expect(tx.user.delete.mock.calls).toContainEqual([
        { where: { id: "user-1" } },
      ]);
      // Financial records are anonymised, not deleted.
      expect(tx.payment.updateMany.mock.calls).toContainEqual([
        { where: { userId: "user-1" }, data: { userId: null } },
      ]);
    });

    it("keeps sweeping when one account fails", async () => {
      const due = [
        { id: "user-1", email: "a@b.c" },
        { id: "user-2", email: "d@e.f" },
      ];
      (prisma.user.findMany as jest.Mock).mockResolvedValue(due);
      const tx = txMock();
      (tx.user.delete as jest.Mock)
        .mockRejectedValueOnce(new Error("fk"))
        .mockResolvedValueOnce(undefined);
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (fn: (t: unknown) => Promise<void>) => fn(tx),
      );

      const result = await service.sweep();

      expect(result.deleted).toBe(1);
      expect(result.failed).toBe(1);
    });
  });
});
