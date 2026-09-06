import { TelegramCampaignService } from "./telegram-campaign.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Resource Hunt campaign ledger — points, totals, idempotency.
 *
 * The prisma collaborator is a behaviour mock: the transaction callback
 * receives the same mock so create/update calls are assertable, and P2002
 * is simulated for the concurrent-award race.
 */
function makePrisma() {
  const contributions = new Map<string, { points: number; participantId: string }>();
  const participants = new Map<
    string,
    {
      id: string;
      telegramId: string;
      username: string | null;
      firstName: string | null;
      verifiedAt: Date | null;
      university: string | null;
      points: number;
      approvedCount: number;
      updatedAt: Date;
    }
  >();

  let nextId = 1;
  const participant = (telegramId: string) => {
    const existing = participants.get(telegramId);
    if (existing) return existing;
    const row = {
      id: `p-${nextId++}`,
      telegramId,
      username: null as string | null,
      firstName: null as string | null,
      verifiedAt: null as Date | null,
      university: null as string | null,
      points: 0,
      approvedCount: 0,
      updatedAt: new Date(),
    };
    participants.set(telegramId, row);
    return row;
  };

  const prisma = {
    telegramParticipant: {
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const row = participant(where.telegramId);
        Object.assign(row, {
          username: update.username ?? create.username ?? row.username,
          firstName: update.firstName ?? create.firstName ?? row.firstName,
        });
        return { ...row };
      }),
      findUnique: jest.fn(async ({ where }: any) => participants.get(where.telegramId) ?? null),
      findMany: jest.fn(async ({ orderBy, take }: any) =>
        [...participants.values()]
          .filter((p) => p.approvedCount > 0)
          .sort((a, b) => {
            for (const o of orderBy) {
              const key = Object.keys(o)[0] as "points" | "approvedCount" | "updatedAt";
              const diff = (b[key] as number) - (a[key] as number);
              if (diff !== 0) return diff;
            }
            return 0;
          })
          .slice(0, take),
      ),
      update: jest.fn(async ({ where, data }: any) => {
        const row = where.telegramId
          ? participants.get(where.telegramId)
          : [...participants.values()].find((p) => p.id === where.id);
        if (!row) throw new Error("not found");
        if (data.verifiedAt) row.verifiedAt = data.verifiedAt;
        if (data.university) row.university = data.university;
        if (data.points?.increment) row.points += data.points.increment;
        if (data.approvedCount?.increment) row.approvedCount += data.approvedCount.increment;
        return { ...row };
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const row = participants.get(where.telegramId);
        if (!row || (where.verifiedAt === null && row.verifiedAt !== null)) return { count: 0 };
        row.verifiedAt = data.verifiedAt;
        return { count: 1 };
      }),
    },
    resourceContribution: {
      findUnique: jest.fn(async ({ where }: any) => contributions.get(where.submissionId) ?? null),
      create: jest.fn(async ({ data }: any) => {
        if (contributions.has(data.submissionId)) {
          const err = new Error("Unique constraint failed") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        contributions.set(data.submissionId, { points: data.points, participantId: data.participantId });
        return { points: data.points };
      }),
    },
  };
  // Assigned after creation so the transaction callback receives the mock
  // itself (create/update inside the tx hit the same behaviour mocks).
  (prisma as any).$transaction = jest.fn(async (fn: (tx: any) => Promise<unknown>) => fn(prisma));

  return { prisma, contributions, participants, participant };
}

function makeService(prisma: ReturnType<typeof makePrisma>["prisma"]) {
  return new TelegramCampaignService(prisma as unknown as PrismaService);
}

describe("TelegramCampaignService", () => {
  it("registers a first-time participant idempotently by telegram id", async () => {
    const { prisma } = makePrisma();
    const svc = makeService(prisma);

    const first = await svc.ensureParticipant({ id: 111, username: "ada", first_name: "Ada" });
    const second = await svc.ensureParticipant({ id: 111, username: "ada", first_name: "Ada" });

    expect(first.id).toBe(second.id);
    expect(prisma.telegramParticipant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { telegramId: "111" } }),
    );
    expect(prisma.telegramParticipant.upsert).toHaveBeenCalledTimes(2);
  });

  it("marks verification exactly once and persists the university", async () => {
    const { prisma } = makePrisma();
    const svc = makeService(prisma);
    await svc.ensureParticipant({ id: 222 });

    await svc.markVerified("222");
    await svc.markVerified("222"); // idempotent re-verify
    await svc.setUniversity("222", "University of Benin");

    const row = await prisma.telegramParticipant.findUnique({ where: { telegramId: "222" } });
    expect(row?.verifiedAt).toBeTruthy();
    expect(row?.university).toBe("University of Benin");
  });

  it("awards points once per approved submission and updates totals", async () => {
    const { prisma } = makePrisma();
    const svc = makeService(prisma);
    const p = await svc.ensureParticipant({ id: 333 });

    const award = await svc.awardForSubmission({
      id: "0f0e0d0c-0000-4000-8000-000000000001",
      participantId: p.id,
      courseCode: "CHM 101",
      materialType: "past_question",
    });

    expect(award.awarded).toBe(true);
    expect(award.points).toBe(1);
    const row = await prisma.telegramParticipant.findUnique({ where: { telegramId: "333" } });
    expect(row?.points).toBe(1);
    expect(row?.approvedCount).toBe(1);
  });

  it("never double-awards for the same submission", async () => {
    const { prisma } = makePrisma();
    const svc = makeService(prisma);
    const p = await svc.ensureParticipant({ id: 444 });
    const submissionId = "0f0e0d0c-0000-4000-8000-000000000002";

    const first = await svc.awardForSubmission({
      id: submissionId, participantId: p.id, courseCode: "CHM 101", materialType: "past_question",
    });
    const second = await svc.awardForSubmission({
      id: submissionId, participantId: p.id, courseCode: "CHM 101", materialType: "past_question",
    });

    expect(first.awarded).toBe(true);
    expect(second.awarded).toBe(false);
    const row = await prisma.telegramParticipant.findUnique({ where: { telegramId: "444" } });
    expect(row?.points).toBe(1); // not 2
    expect(row?.approvedCount).toBe(1);
  });

  it("treats a lost concurrent-award race as already-recorded, not an error", async () => {
    const { prisma } = makePrisma();
    const svc = makeService(prisma);
    const p = await svc.ensureParticipant({ id: 555 });

    // Simulate the ledger row already existing (another worker won).
    (prisma.resourceContribution.findUnique as jest.Mock).mockResolvedValueOnce({ points: 1 });

    const result = await svc.awardForSubmission({
      id: "0f0e0d0c-0000-4000-8000-000000000003",
      participantId: p.id,
      courseCode: "CHM 101",
      materialType: "past_question",
    });
    expect(result.awarded).toBe(false);
    expect(result.reason).toBe("already recorded");
  });

  it("ranks the leaderboard by points and includes approved counts", async () => {
    const { prisma } = makePrisma();
    const svc = makeService(prisma);
    const a = await svc.ensureParticipant({ id: 1, first_name: "Ada" });
    const b = await svc.ensureParticipant({ id: 2, first_name: "Femi" });

    for (let i = 0; i < 3; i++) {
      await svc.awardForSubmission({
        id: `0f0e0d0c-0000-4000-8000-00000000001${i}`,
        participantId: a.id, courseCode: "CHM 101", materialType: "past_question",
      });
    }
    await svc.awardForSubmission({
      id: "0f0e0d0c-0000-4000-8000-000000000020",
      participantId: b.id, courseCode: "MTH 105", materialType: "lecture_note",
    });

    const board = await svc.leaderboard(10);
    expect(board[0].name).toBe("Ada");
    expect(board[0].points).toBe(3);
    expect(board[0].approvedCount).toBe(3);
    expect(board[1].points).toBe(1);
    expect(board.length).toBe(2);
  });
});
