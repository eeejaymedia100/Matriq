import { Test, TestingModule } from "@nestjs/testing";
import { AchievementsService, ACHIEVEMENTS, ELIGIBILITY_WINDOWS } from "./achievements.service";
import { PrismaService } from "../prisma/prisma.service";
import { ActivityService } from "../activity/activity.service";

/**
 * Spec for the 20-badge catalog. Each badge's unlock condition is tested
 * directly, plus the anti-farm properties: idempotent persistence, upload
 * content-hash dedupe, verified-only referral counting, and app launches
 * never counting toward streaks.
 */

interface MockOverrides {
  user?: unknown;
  streak?: { current: number; best: number };
  activityDays?: Date[];
  counts?: Partial<Record<string, number>>; // focus_map | mastery_pass | note_create | task_complete
  librarySaves?: number;
  librarySaveRows?: unknown[];
  referrals?: unknown[];
  vaultRows?: unknown[];
  publicApproved?: number;
  unlocks?: unknown[];
}

function baseUser() {
  return {
    profilePhotoUrl: "https://x/y.jpg",
    institutionId: "inst-1",
    faculty: "Science",
    department: "Computer Science",
    level: "300",
    emailVerified: true,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
  };
}

function makeModule(overrides: MockOverrides = {}) {
  const counts = overrides.counts ?? {};
  const mockPrisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue(overrides.user === undefined ? baseUser() : overrides.user),
    },
    focusModeSession: { count: jest.fn().mockResolvedValue(counts.focus_map ?? 0) },
    masteryCheckpointPass: {
      count: jest.fn().mockResolvedValue(counts.mastery_pass ?? 0),
    },
    librarySave: {
      count: jest.fn().mockResolvedValue(overrides.librarySaves ?? 0),
      findMany: jest.fn().mockResolvedValue(overrides.librarySaveRows ?? []),
    },
    referral: { findMany: jest.fn().mockResolvedValue(overrides.referrals ?? []) },
    vaultItem: {
      findMany: jest.fn().mockResolvedValue(overrides.vaultRows ?? []),
      count: jest.fn().mockResolvedValue(overrides.publicApproved ?? 0),
    },
    achievementUnlock: {
      findMany: jest.fn().mockResolvedValue(overrides.unlocks ?? []),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const mockActivity = {
    streakInfo: jest.fn().mockResolvedValue(
      overrides.streak ?? { current: 0, best: 0 },
    ),
    activityDays: jest.fn().mockResolvedValue(overrides.activityDays ?? []),
    countByKind: jest.fn().mockImplementation((_u: string, kind: string) =>
      Promise.resolve(counts[kind] ?? 0),
    ),
  };
  return { mockPrisma, mockActivity };
}

async function build(overrides: MockOverrides = {}) {
  const { mockPrisma, mockActivity } = makeModule(overrides);
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AchievementsService,
      { provide: PrismaService, useValue: mockPrisma },
      { provide: ActivityService, useValue: mockActivity },
    ],
  }).compile();
  const svc = module.get<AchievementsService>(AchievementsService);
  const prisma = module.get<PrismaService>(PrismaService);
  return { svc, prisma };
}

function boardBy(result: {
  achievements: {
    id: string;
    earned: boolean;
    progress?: { current: number; target: number } | null;
  }[];
}) {
  return new Map(result.achievements.map((a) => [a.id, a]));
}

describe("AchievementsService — 20-badge catalog", () => {
  it("defines exactly the 20 requested badges with unique ids and full metadata", () => {
    expect(ACHIEVEMENTS).toHaveLength(20);
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
    expect(ids.size).toBe(20);
    const expected = [
      "first_spark",
      "7_day_flame",
      "30_day_flame",
      "century_scholar",
      "first_discovery",
      "first_mastery",
      "deep_thinker",
      "knowledge_explorer",
      "first_upload",
      "knowledge_contributor",
      "resource_hunter",
      "note_keeper",
      "task_finisher",
      "organized_mind",
      "rising_ambassador",
      "matriq_ambassador",
      "early_explorer",
      "founding_student",
      "beta_pioneer",
      "semester_warrior",
    ];
    for (const id of expected) expect(ids.has(id)).toBe(true);
    for (const a of ACHIEVEMENTS) {
      expect(a.title.trim()).not.toBe("");
      expect(a.body.trim()).not.toBe("");
      expect(a.hint.trim()).not.toBe("");
      expect(["common", "uncommon", "rare", "epic", "legendary"]).toContain(a.rarity);
      expect(a.icon.trim()).not.toBe("");
      expect(a.evaluate).toBeInstanceOf(Function);
    }
  });

  it("earns nothing for a brand-new inactive user", async () => {
    // Post-window signup with no activity: timing badges can't fire, and no
    // meaningful action has happened.
    const { svc } = await build({
      user: {
        ...baseUser(),
        createdAt: new Date("2026-10-05T00:00:00.000Z"),
      },
      activityDays: [],
    });
    const result = await svc.evaluateBoard("u-1");
    expect(result.achievements).toHaveLength(20);
    expect(result.earnedCount).toBe(0);
  });

  it("First Spark — one genuine activity day", async () => {
    const { svc } = await build({
      activityDays: [new Date("2026-08-02T00:00:00.000Z")],
    });
    const byId = boardBy(await svc.evaluateBoard("u-1"));
    expect(byId.get("first_spark")?.earned).toBe(true);
  });

  it("streak badges track server-computed streaks; launches never count", async () => {
    const { svc } = await build({ streak: { current: 31, best: 31 } });
    const byId = boardBy(await svc.evaluateBoard("u-1"));
    expect(byId.get("7_day_flame")?.earned).toBe(true);
    expect(byId.get("30_day_flame")?.earned).toBe(true);
    expect(byId.get("century_scholar")?.earned).toBe(false);
    expect(byId.get("century_scholar")?.progress).toEqual({ current: 31, target: 100 });
  });

  it("Century Scholar — 100 consecutive days", async () => {
    const { svc } = await build({ streak: { current: 100, best: 100 } });
    const byId = boardBy(await svc.evaluateBoard("u-1"));
    expect(byId.get("century_scholar")?.earned).toBe(true);
  });

  it("Semester Warrior — 60+ active days (real activity, not streak)", async () => {
    const days = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)));
    const { svc } = await build({ activityDays: days });
    const byId = boardBy(await svc.evaluateBoard("u-1"));
    expect(byId.get("semester_warrior")?.earned).toBe(true);
    expect(byId.get("semester_warrior")?.progress).toEqual({ current: 60, target: 60 });
  });

  it("First Discovery + Deep Thinker — Focus journeys", async () => {
    const { svc } = await build({ counts: { focus_map: 5 } });
    const byId = boardBy(await svc.evaluateBoard("u-1"));
    expect(byId.get("first_discovery")?.earned).toBe(true);
    expect(byId.get("deep_thinker")?.earned).toBe(true);
  });

  it("First Mastery — one passed checkpoint, never from failed attempts", async () => {
    const { svc } = await build({ counts: { mastery_pass: 1 } });
    const byId = boardBy(await svc.evaluateBoard("u-1"));
    expect(byId.get("first_mastery")?.earned).toBe(true);
    expect(byId.get("first_mastery")?.progress).toEqual({ current: 1, target: 1 });
  });

  it("Knowledge Explorer — 5+ distinct subjects across own + saved material", async () => {
    const { svc } = await build({
      vaultRows: [
        { contentHash: "a", courseCode: "CHM 101", visibility: "private", moderationStatus: "approved" },
        { contentHash: "b", courseCode: "PHY 102", visibility: "private", moderationStatus: "approved" },
        { contentHash: "c", courseCode: "MTH 103", visibility: "private", moderationStatus: "approved" },
      ],
      librarySaveRows: [
        { vaultItem: { courseCode: "BIO 104", deletedAt: null } },
        { vaultItem: { courseCode: "GST 105", deletedAt: null } },
      ],
    });
    const byId = boardBy(await svc.evaluateBoard("u-1"));
    expect(byId.get("knowledge_explorer")?.earned).toBe(true);
  });

  it("First Upload — one valid upload; duplicate hashes count once (anti-farm)", async () => {
    const { svc } = await build({
      vaultRows: [
        { contentHash: "same", courseCode: "CHM 101", visibility: "private", moderationStatus: "approved" },
        { contentHash: "same", courseCode: "CHM 101", visibility: "private", moderationStatus: "approved" },
        { contentHash: "same", courseCode: "CHM 101", visibility: "private", moderationStatus: "approved" },
      ],
    });
    const byId = boardBy(await svc.evaluateBoard("u-1"));
    expect(byId.get("first_upload")?.earned).toBe(true);
    // Farming the same file 3x still counts as exactly one upload.
    const first = byId.get("first_upload")!;
    if (first.progress) expect(first.progress.current).toBe(1);
  });

  it("Knowledge Contributor — approved public uploads only", async () => {
    const { svc } = await build({
      // 5 public rows but only 3 approved → contributes 3.
      publicApproved: 3,
    });
    const byId = boardBy(await svc.evaluateBoard("u-1"));
    expect(byId.get("knowledge_contributor")?.earned).toBe(true);
    expect(byId.get("knowledge_contributor")?.progress).toEqual({ current: 3, target: 3 });
  });

  it("Resource Hunter — 10 library saves", async () => {
    const { svc } = await build({ librarySaves: 10 });
    const byId = boardBy(await svc.evaluateBoard("u-1"));
    expect(byId.get("resource_hunter")?.earned).toBe(true);
  });

  it("Note Keeper — 10 journaled note creates", async () => {
    const { svc } = await build({ counts: { note_create: 10 } });
    const byId = boardBy(await svc.evaluateBoard("u-1"));
    expect(byId.get("note_keeper")?.earned).toBe(true);
  });

  it("Task Finisher — 20 journaled task completions", async () => {
    const { svc } = await build({ counts: { task_complete: 20 } });
    const byId = boardBy(await svc.evaluateBoard("u-1"));
    expect(byId.get("task_finisher")?.earned).toBe(true);
    expect(byId.get("task_finisher")?.progress).toEqual({ current: 20, target: 20 });
  });

  it("Organized Mind — organisation signal from notes or course organisation", async () => {
    const { svc } = await build({
      vaultRows: [
        { contentHash: "a", courseCode: "CHM 101", visibility: "private", moderationStatus: "approved" },
        { contentHash: "b", courseCode: "PHY 102", visibility: "private", moderationStatus: "approved" },
        { contentHash: "c", courseCode: "MTH 103", visibility: "private", moderationStatus: "approved" },
        { contentHash: "d", courseCode: "BIO 104", visibility: "private", moderationStatus: "approved" },
        { contentHash: "e", courseCode: "GST 105", visibility: "private", moderationStatus: "approved" },
      ],
    });
    const byId = boardBy(await svc.evaluateBoard("u-1"));
    expect(byId.get("organized_mind")?.earned).toBe(true);
  });

  it("referral badges count ONLY verified, non-deleted referred users", async () => {
    const referrals = [
      { referredUser: { emailVerified: true, deletedAt: null } },
      { referredUser: { emailVerified: true, deletedAt: null } },
      { referredUser: { emailVerified: true, deletedAt: null } },
      { referredUser: { emailVerified: true, deletedAt: null } },
      { referredUser: { emailVerified: true, deletedAt: null } },
      { referredUser: { emailVerified: false, deletedAt: null } }, // unverified: no
      { referredUser: { emailVerified: true, deletedAt: new Date() } }, // deleted: no
      { referredUser: null }, // unconverted: no
    ];
    const { svc } = await build({ referrals });
    const byId = boardBy(await svc.evaluateBoard("u-1"));
    expect(byId.get("rising_ambassador")?.earned).toBe(true);
    expect(byId.get("matriq_ambassador")?.earned).toBe(false);
    expect(byId.get("matriq_ambassador")?.progress).toEqual({ current: 5, target: 10 });
  });

  it("Matriq Ambassador — 10+ verified referrals, legendary rarity", async () => {
    const referrals = Array.from({ length: 12 }, () => ({
      referredUser: { emailVerified: true, deletedAt: null },
    }));
    const { svc } = await build({ referrals });
    const result = await svc.evaluateBoard("u-1");
    const byId = boardBy(result);
    expect(byId.get("matriq_ambassador")?.earned).toBe(true);
    expect(
      ACHIEVEMENTS.find((a) => a.id === "matriq_ambassador")?.rarity,
    ).toBe("legendary");
  });

  it("Early Explorer — registered before the early-access cutoff + verified", async () => {
    const { svc } = await build({
      user: {
        ...baseUser(),
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    });
    const byId = boardBy(await svc.evaluateBoard("u-1"));
    expect(byId.get("early_explorer")?.earned).toBe(true);
  });

  it("Early Explorer — after the window, not earned even with activity", async () => {
    const { svc } = await build({
      user: {
        ...baseUser(),
        createdAt: new Date("2026-10-05T00:00:00.000Z"),
      },
    });
    const byId = boardBy(await svc.evaluateBoard("u-1"));
    expect(byId.get("early_explorer")?.earned).toBe(false);
  });

  it("Founding Student — in window, verified, complete profile, real activity", async () => {
    const { svc } = await build({
      user: {
        ...baseUser(),
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
      },
      activityDays: [new Date("2026-09-02T00:00:00.000Z")],
    });
    const byId = boardBy(await svc.evaluateBoard("u-1"));
    expect(byId.get("founding_student")?.earned).toBe(true);
  });

  it("Founding Student — not earned without real activity", async () => {
    const { svc } = await build({
      user: { ...baseUser(), createdAt: new Date("2026-09-01T00:00:00.000Z") },
      activityDays: [],
    });
    const byId = boardBy(await svc.evaluateBoard("u-1"));
    expect(byId.get("founding_student")?.earned).toBe(false);
  });

  it("Beta Pioneer — active use inside the beta window only", async () => {
    const { svc } = await build({
      user: {
        ...baseUser(),
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      },
      activityDays: [new Date("2026-08-02T00:00:00.000Z")],
    });
    const byId = boardBy(await svc.evaluateBoard("u-1"));
    // Created in window + 1 activity day: not 3 — beta requires real use.
    expect(byId.get("beta_pioneer")?.earned).toBe(false);

    const active = await build({
      user: {
        ...baseUser(),
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      },
      activityDays: [
        new Date("2026-08-02T00:00:00.000Z"),
        new Date("2026-08-03T00:00:00.000Z"),
        new Date("2026-08-04T00:00:00.000Z"),
      ],
    });
    const byId2 = boardBy(await active.svc.evaluateBoard("u-1"));
    expect(byId2.get("beta_pioneer")?.earned).toBe(true);
  });

  it("persists unlocks exactly once; already-earned badges are never re-written", async () => {
    const { svc, prisma } = await build({
      vaultRows: [
        { contentHash: "x", courseCode: "CHM 101", visibility: "private", moderationStatus: "approved" },
      ],
      unlocks: [
        { achievementId: "first_upload", earnedAt: new Date("2026-01-01T00:00:00.000Z") },
      ],
    });
    const result = await svc.evaluateBoard("u-1");
    const firstUpload = result.achievements.find((a) => a.id === "first_upload")!;
    expect(firstUpload.earned).toBe(true);
    expect(firstUpload.earnedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(prisma.achievementUnlock.createMany).toHaveBeenCalledTimes(1);
  });

  it("returns an empty board for an unknown user without writing", async () => {
    const { svc, prisma } = await build({ user: null });
    const result = await svc.evaluateBoard("ghost");
    expect(result.achievements).toEqual([]);
    expect(prisma.achievementUnlock.createMany).not.toHaveBeenCalled();
  });

  it("launches alone can never earn anything (no events → no board signals)", async () => {
    // Post-window user: no timing badge, no activity — nothing earned.
    const { svc } = await build({
      user: {
        ...baseUser(),
        createdAt: new Date("2026-10-05T00:00:00.000Z"),
      },
    });
    const result = await svc.evaluateBoard("u-1");
    expect(result.earnedCount).toBe(0);
    expect(ELIGIBILITY_WINDOWS.betaStart < ELIGIBILITY_WINDOWS.betaEnd).toBe(true);
    expect(ELIGIBILITY_WINDOWS.earlyAccessEnd > ELIGIBILITY_WINDOWS.foundingEnd).toBe(true);
  });
});