import { Test, TestingModule } from "@nestjs/testing";
import { AchievementsService, ACHIEVEMENTS } from "./achievements.service";
import { PrismaService } from "../prisma/prisma.service";

function baseUser() {
  return {
    profilePhotoUrl: "https://x/y.jpg",
    institutionId: "inst-1",
    faculty: "Science",
    department: "Computer Science",
    level: "300",
    emailVerified: true,
  };
}

function makeModule(overrides: {
  user?: unknown;
  counts?: Partial<Record<string, number>>;
  unlocks?: unknown[];
}) {
  const mockPrisma = {
    user: { findUnique: jest.fn().mockResolvedValue(overrides.user ?? baseUser()) },
    aiQueryLog: { count: jest.fn().mockResolvedValue(overrides.counts?.ai ?? 0) },
    focusModeSession: { count: jest.fn().mockResolvedValue(overrides.counts?.focus ?? 0) },
    vaultItem: { count: jest.fn().mockResolvedValue(overrides.counts?.vault ?? 0) },
    libraryView: { count: jest.fn().mockResolvedValue(overrides.counts?.views ?? 0) },
    librarySave: { count: jest.fn().mockResolvedValue(overrides.counts?.saves ?? 0) },
    achievementUnlock: {
      findMany: jest.fn().mockResolvedValue(overrides.unlocks ?? []),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  return mockPrisma;
}

describe("AchievementsService", () => {
  let service: AchievementsService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AchievementsService,
        { provide: PrismaService, useValue: makeModule({}) },
      ],
    }).compile();

    service = module.get<AchievementsService>(AchievementsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it("defines a full board with no placeholders — every achievement has a real condition", () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(14);
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
    expect(ids.size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.title.trim()).not.toBe("");
      expect(a.body.trim()).not.toBe("");
      expect(a.hint.trim()).not.toBe("");
    }
  });

  it("returns a fresh board with nothing earned for a brand-new user", async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AchievementsService,
        {
          provide: PrismaService,
          useValue: makeModule({
            user: {
              profilePhotoUrl: null,
              institutionId: null,
              faculty: "",
              department: "",
              level: "",
              emailVerified: false,
            },
          }),
        },
      ],
    }).compile();
    const svc = module.get<AchievementsService>(AchievementsService);
    const result = await svc.evaluateBoard("u-1", {});
    expect(result.achievements.length).toBe(ACHIEVEMENTS.length);
    expect(result.earnedCount).toBe(0);
    expect(result.achievements.every((a) => !a.earned)).toBe(true);
  });

  it("earns server-signal achievements from real DB counts", async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AchievementsService,
        {
          provide: PrismaService,
          useValue: makeModule({
            counts: { ai: 30, focus: 6, vault: 6, views: 2, saves: 1 },
          }),
        },
      ],
    }).compile();
    const svc = module.get<AchievementsService>(AchievementsService);

    const result = await svc.evaluateBoard("u-1", {});
    const byId = new Map(result.achievements.map((a) => [a.id, a]));
    expect(byId.get("ai_25")?.earned).toBe(true);
    expect(byId.get("focus_5_maps")?.earned).toBe(true);
    expect(byId.get("uploads_5")?.earned).toBe(true);
    expect(byId.get("first_library_read")?.earned).toBe(true);
    expect(byId.get("first_library_save")?.earned).toBe(true);
    expect(byId.get("first_upload")?.earned).toBe(true);
    expect(byId.get("first_focus_map")?.earned).toBe(true);
    expect(byId.get("first_ai_qa")?.earned).toBe(true);
    // Profile achievements from the user row.
    expect(byId.get("profile_complete")?.earned).toBe(true);
    expect(byId.get("verified_member")?.earned).toBe(true);
  });

  it("respects client-reported on-device signals (notes, streak, offline AI, todos)", async () => {
    const result = await service.evaluateBoard("u-1", {
      notesCount: 12,
      offlineAiCount: 2,
      streak: 8,
      todosDone: true,
    });
    const byId = new Map(result.achievements.map((a) => [a.id, a]));
    expect(byId.get("notes_10")?.earned).toBe(true);
    expect(byId.get("streak_7")?.earned).toBe(true);
    expect(byId.get("streak_21")?.earned).toBe(false);
    expect(byId.get("streak_21")?.progress).toEqual({ current: 8, target: 21 });
    expect(byId.get("first_foundations")?.earned).toBe(true);
    // Combined cloud + offline AI counts.
    expect(byId.get("ai_25")?.earned).toBe(false);
    expect(byId.get("first_ai_qa")?.earned).toBe(true);
  });

  it("persists newly earned achievements once and keeps earnedAt stable", async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AchievementsService,
        {
          provide: PrismaService,
          useValue: makeModule({
            counts: { vault: 1 },
            unlocks: [
              { achievementId: "first_upload", earnedAt: new Date("2026-01-01") },
            ],
          }),
        },
      ],
    }).compile();
    const svc = module.get<AchievementsService>(AchievementsService);
    const p = module.get<PrismaService>(PrismaService);

    const result = await svc.evaluateBoard("u-1", {});
    const firstUpload = result.achievements.find((a) => a.id === "first_upload")!;
    expect(firstUpload.earned).toBe(true);
    expect(firstUpload.earnedAt).toBe("2026-01-01T00:00:00.000Z");
    // Only the NEW unlock should be written (createMany called once, no dupes).
    expect(p.achievementUnlock.createMany).toHaveBeenCalledTimes(1);
  });

  it("never earns anything from an empty profile", async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AchievementsService,
        {
          provide: PrismaService,
          useValue: makeModule({
            user: {
              profilePhotoUrl: null,
              institutionId: null,
              faculty: "",
              department: "",
              level: "",
              emailVerified: false,
            },
          }),
        },
      ],
    }).compile();
    const svc = module.get<AchievementsService>(AchievementsService);
    const result = await svc.evaluateBoard("u-1", {});
    const byId = new Map(result.achievements.map((a) => [a.id, a]));
    expect(byId.get("profile_complete")?.earned).toBe(false);
    expect(byId.get("verified_member")?.earned).toBe(false);
    expect(result.earnedCount).toBe(0);
  });

  it("returns an empty board for an unknown user", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    const result = await service.evaluateBoard("ghost", {});
    expect(result.achievements).toEqual([]);
    expect(result.earnedCount).toBe(0);
  });
});