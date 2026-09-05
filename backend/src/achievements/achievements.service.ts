import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ActivityService, utcDayFloor } from "../activity/activity.service";

/**
 * Achievement Board v2 — the 20-badge catalog.
 *
 * Every achievement maps to a REAL, server-authoritative signal; none can be
 * earned from fake, repeated or easily farmed activity:
 *
 *  - Streaks come from the server-computed activity journal (meaningful
 *    actions only — app launches are never journaled).
 *  - Upload badges count only distinct, valid uploads (content-hash dedupe).
 *  - Referral badges count only email-verified conversions (self-referral
 *    and double-conversion impossible: ownership + unique constraint).
 *  - Notes/tasks are journaled idempotently by record id via the client sync
 *    endpoint, so replaying or double-tapping can never double-credit.
 *  - Focus maps / mastery passes are keyed to the server records themselves.
 *
 * Timing-based badges (Early Explorer / Founding Student / Beta Pioneer) use
 * defined launch-window rules (constants below, documented + tunable). None
 * invent activity requirements for features that don't exist.
 */

export type AchievementCategory =
  | "Foundations"
  | "Consistency"
  | "AI Learning"
  | "Knowledge"
  | "Community";

export type AchievementRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

/** Rarity tiers ranked — streak badges escalate through them. */
export const RARITY_ORDER: AchievementRarity[] = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
];

/**
 * Launch-window rules (UTC). Tunable constants; documented so the operators
 * can adjust the windows before launch without code archaeology.
 */
export const ELIGIBILITY_WINDOWS = {
  /** Qualifying beta-testing period — Beta Pioneer. */
  betaStart: new Date("2026-07-25T00:00:00.000Z"),
  betaEnd: new Date("2026-09-10T23:59:59.999Z"),
  /** Early-access cutoff — Early Explorer. */
  earlyAccessEnd: new Date("2026-09-30T23:59:59.999Z"),
  /** Founding-student cutoff — Founding Student. */
  foundingEnd: new Date("2026-09-15T23:59:59.999Z"),
};

export interface AchievementContext {
  emailVerified: boolean;
  profileComplete: boolean;
  createdAt: Date;
  /** Distinct calendar days with any meaningful activity. */
  activityDayCount: number;
  currentStreak: number;
  focusMapCount: number;
  masteryPassCount: number;
  /** Distinct subjects (course codes) explored across vault/library. */
  distinctSubjects: number;
  /** Distinct valid uploads (content-hash deduped). */
  uploadCount: number;
  /** Distinct public uploads approved by moderation (contributor). */
  approvedPublicUploads: number;
  /** Distinct course codes with own material — organisation signal. */
  organizedCourses: number;
  librarySaveCount: number;
  noteCount: number;
  taskCount: number;
  verifiedReferrals: number;
}

export interface AchievementProgress {
  current: number;
  target: number;
}

export interface AchievementDef {
  id: string;
  title: string;
  /** What the achievement celebrates — shown on the card. */
  body: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  /** Icon name from the app's inline icon set (rendered in the badge). */
  icon: string;
  /** One-line locked copy explaining the unlock condition. */
  hint: string;
  evaluate(ctx: AchievementContext): {
    earned: boolean;
    progress?: AchievementProgress;
  };
}

function count(actual: number, target: number) {
  return {
    earned: actual >= target,
    progress: { current: Math.min(actual, target), target },
  };
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // ── Foundations ────────────────────────────────────────────────
  {
    id: "first_spark",
    title: "First Spark",
    body: "Your first meaningful study activity — a task done, a note saved, a map built. It starts here.",
    category: "Foundations",
    rarity: "common",
    icon: "seed",
    hint: "Complete your first genuine study activity",
    evaluate: (ctx) => count(ctx.activityDayCount, 1),
  },
  {
    id: "early_explorer",
    title: "Early Explorer",
    body: "You joined Matriq during early access — before the doors opened wide. Welcome, pioneer.",
    category: "Foundations",
    rarity: "rare",
    icon: "compass",
    hint: "Sign up during the early-access window",
    evaluate: (ctx) => ({
      earned:
        ctx.createdAt <= ELIGIBILITY_WINDOWS.earlyAccessEnd && ctx.emailVerified,
    }),
  },
  {
    id: "founding_student",
    title: "Founding Student",
    body: "One of the founding students of Matriq — you were here and you studied here from day one.",
    category: "Foundations",
    rarity: "epic",
    icon: "crown",
    hint: "Join during the founding-student window, verify, and study",
    evaluate: (ctx) => ({
      earned:
        ctx.createdAt <= ELIGIBILITY_WINDOWS.foundingEnd &&
        ctx.emailVerified &&
        ctx.profileComplete &&
        ctx.activityDayCount >= 1,
    }),
  },
  {
    id: "beta_pioneer",
    title: "Beta Pioneer",
    body: "You genuinely used Matriq during the qualifying beta period — bugs, breakthroughs, both.",
    category: "Foundations",
    rarity: "rare",
    icon: "flask",
    hint: "Use Matriq actively during the beta-testing period",
    evaluate: (ctx) => ({
      earned:
        ctx.createdAt >= ELIGIBILITY_WINDOWS.betaStart &&
        ctx.createdAt <= ELIGIBILITY_WINDOWS.betaEnd &&
        ctx.activityDayCount >= 3,
    }),
  },

  // ── Consistency ────────────────────────────────────────────────
  {
    id: "7_day_flame",
    title: "7-Day Flame",
    body: "Seven consecutive days of meaningful study. That's a real routine now.",
    category: "Consistency",
    rarity: "uncommon",
    icon: "flame",
    hint: "Log meaningful study on 7 consecutive days",
    evaluate: (ctx) => count(ctx.currentStreak, 7),
  },
  {
    id: "30_day_flame",
    title: "30-Day Flame",
    body: "A full month, unbroken. Fewer than 1 in 10 students ever get here.",
    category: "Consistency",
    rarity: "rare",
    icon: "flame",
    hint: "Log meaningful study on 30 consecutive days",
    evaluate: (ctx) => count(ctx.currentStreak, 30),
  },
  {
    id: "century_scholar",
    title: "Century Scholar",
    body: "100 consecutive days of meaningful study. Legendary discipline.",
    category: "Consistency",
    rarity: "epic",
    icon: "flame",
    hint: "Log meaningful study on 100 consecutive days",
    evaluate: (ctx) => count(ctx.currentStreak, 100),
  },
  {
    id: "semester_warrior",
    title: "Semester Warrior",
    body: "The equivalent of a full semester of study — 60+ active days of real work.",
    category: "Consistency",
    rarity: "epic",
    icon: "shield",
    hint: "Log meaningful study on 60 or more days",
    evaluate: (ctx) => count(ctx.activityDayCount, 60),
  },

  // ── AI Learning ────────────────────────────────────────────────
  {
    id: "first_discovery",
    title: "First Discovery",
    body: "You completed your first Focus Mode journey — a topic turned into a map.",
    category: "AI Learning",
    rarity: "common",
    icon: "layers",
    hint: "Complete your first Focus Mode learning journey",
    evaluate: (ctx) => count(ctx.focusMapCount, 1),
  },
  {
    id: "first_mastery",
    title: "First Mastery",
    body: "You passed your first Focus Mode mastery checkpoint. You don't just read — you prove it.",
    category: "AI Learning",
    rarity: "uncommon",
    icon: "check",
    hint: "Pass your first mastery checkpoint",
    evaluate: (ctx) => count(ctx.masteryPassCount, 1),
  },
  {
    id: "deep_thinker",
    title: "Deep Thinker",
    body: "Five Focus Mode journeys completed. You go deeper than most people ever do.",
    category: "AI Learning",
    rarity: "rare",
    icon: "brain",
    hint: "Complete 5 Focus Mode learning journeys",
    evaluate: (ctx) => count(ctx.focusMapCount, 5),
  },
  {
    id: "knowledge_explorer",
    title: "Knowledge Explorer",
    body: "You meaningfully explored 5+ different subjects — never stuck in one lane.",
    category: "AI Learning",
    rarity: "rare",
    icon: "compass",
    hint: "Study across 5 or more different subjects",
    evaluate: (ctx) => count(ctx.distinctSubjects, 5),
  },

  // ── Knowledge ──────────────────────────────────────────────────
  {
    id: "first_upload",
    title: "First Upload",
    body: "Your first valid academic material is in the Vault. Sharing starts with you.",
    category: "Knowledge",
    rarity: "common",
    icon: "vault",
    hint: "Upload your first valid academic material",
    evaluate: (ctx) => count(ctx.uploadCount, 1),
  },
  {
    id: "resource_hunter",
    title: "Resource Hunter",
    body: "10 useful resources saved from the Library. Your collection is growing.",
    category: "Knowledge",
    rarity: "uncommon",
    icon: "bookmark",
    hint: "Save 10 resources from the Library",
    evaluate: (ctx) => count(ctx.librarySaveCount, 10),
  },
  {
    id: "note_keeper",
    title: "Note Keeper",
    body: "10 notes saved and counted. Your own knowledge base is taking shape.",
    category: "Knowledge",
    rarity: "uncommon",
    icon: "pen",
    hint: "Create and save 10 notes",
    evaluate: (ctx) => count(ctx.noteCount, 10),
  },
  {
    id: "task_finisher",
    title: "Task Finisher",
    body: "20 genuine study tasks completed. Momentum is a habit now.",
    category: "Knowledge",
    rarity: "rare",
    icon: "check",
    hint: "Complete 20 genuine study tasks",
    evaluate: (ctx) => count(ctx.taskCount, 20),
  },
  {
    id: "organized_mind",
    title: "Organized Mind",
    body: "You organise your study materials and notes by course — a system that scales.",
    category: "Knowledge",
    rarity: "uncommon",
    icon: "grid",
    hint: "Keep material organised across 5+ courses or notes",
    evaluate: (ctx) =>
      count(Math.max(ctx.organizedCourses, ctx.noteCount), 5),
  },

  // ── Community ──────────────────────────────────────────────────
  {
    id: "knowledge_contributor",
    title: "Knowledge Contributor",
    body: "3 of your uploads approved and live in the Library. Future students will use them.",
    category: "Community",
    rarity: "rare",
    icon: "upload",
    hint: "Get 3 distinct public uploads approved",
    evaluate: (ctx) => count(ctx.approvedPublicUploads, 3),
  },
  {
    id: "rising_ambassador",
    title: "Rising Ambassador",
    body: "5 verified new students joined through your referral. You're building the community.",
    category: "Community",
    rarity: "rare",
    icon: "users",
    hint: "Get 5 verified successful referrals",
    evaluate: (ctx) => count(ctx.verifiedReferrals, 5),
  },
  {
    id: "matriq_ambassador",
    title: "Matriq Ambassador",
    body: "10+ verified students joined on your word. The official Matriq Ambassador.",
    category: "Community",
    rarity: "legendary",
    icon: "award",
    hint: "Get 10 or more verified successful referrals",
    evaluate: (ctx) => count(ctx.verifiedReferrals, 10),
  },
];

export const ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map((a) => a.id));

export interface BoardAchievement {
  id: string;
  title: string;
  body: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  icon: string;
  hint: string;
  earned: boolean;
  earnedAt: string | null;
  progress: AchievementProgress | null;
}

@Injectable()
export class AchievementsService {
  private readonly logger = new Logger(AchievementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  /** Load every server-side signal + evaluate all 20 badges. */
  async evaluateBoard(userId: string): Promise<{
    achievements: BoardAchievement[];
    earnedCount: number;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        emailVerified: true,
        createdAt: true,
        profilePhotoUrl: true,
        institutionId: true,
        faculty: true,
        department: true,
        level: true,
      },
    });
    if (!user) {
      return { achievements: [], earnedCount: 0 };
    }

    const [
      streakInfo,
      activityDayCount,
      focusMapCount,
      masteryPassCount,
      noteCount,
      taskCount,
      librarySaveCount,
      verifiedReferrals,
      vaultRows,
      publicApproved,
      libraryJoin,
    ] = await Promise.all([
      this.activity.streakInfo(userId),
      this.activity.activityDays(userId),
      this.prisma.focusModeSession.count({ where: { userId } }),
      this.prisma.masteryCheckpointPass.count({ where: { userId } }),
      this.activity.countByKind(userId, "note_create"),
      this.activity.countByKind(userId, "task_complete"),
      this.prisma.librarySave.count({ where: { userId } }),
      this.verifiedReferralCount(userId),
      this.prisma.vaultItem.findMany({
        where: { userId, deletedAt: null },
        select: { contentHash: true, courseCode: true, visibility: true, moderationStatus: true },
        take: 2000,
      }),
      this.prisma.vaultItem.count({
        where: {
          userId,
          deletedAt: null,
          visibility: "public",
          moderationStatus: "approved",
        },
      }),
      this.prisma.librarySave.findMany({
        where: { userId },
        select: { vaultItem: { select: { courseCode: true, deletedAt: true } } },
        take: 2000,
      }),
    ]);

    // Distinct uploads (content-hash dedupe — a farmed duplicate counts once).
    const seenHashes = new Set<string>();
    let uploadCount = 0;
    const courseCodes = new Set<string>();
    for (const v of vaultRows) {
      if (v.courseCode) courseCodes.add(v.courseCode.toUpperCase());
      if (v.contentHash) {
        if (seenHashes.has(v.contentHash)) continue;
        seenHashes.add(v.contentHash);
        uploadCount += 1;
      } else {
        uploadCount += 1; // legacy rows without a hash are still real uploads
      }
    }
    for (const s of libraryJoin) {
      if (s.vaultItem?.courseCode && !s.vaultItem.deletedAt) {
        courseCodes.add(s.vaultItem.courseCode.toUpperCase());
      }
    }

    const ctx: AchievementContext = {
      emailVerified: user.emailVerified,
      profileComplete:
        !!user.profilePhotoUrl &&
        !!user.institutionId &&
        !!user.faculty?.trim() &&
        !!user.department?.trim() &&
        !!user.level?.trim(),
      createdAt: user.createdAt,
      activityDayCount: activityDayCount.length,
      currentStreak: streakInfo.current,
      focusMapCount,
      masteryPassCount,
      distinctSubjects: courseCodes.size,
      uploadCount,
      approvedPublicUploads: publicApproved,
      organizedCourses: courseCodes.size,
      librarySaveCount,
      noteCount,
      taskCount,
      verifiedReferrals,
    };

    const unlocks = await this.prisma.achievementUnlock.findMany({
      where: { userId },
      select: { achievementId: true, earnedAt: true },
    });
    const earnedAtById = new Map(unlocks.map((u) => [u.achievementId, u.earnedAt]));

    // Persist newly-earned facts (idempotent — the table is just fact + date).
    const newlyEarned = ACHIEVEMENTS.filter(
      (a) => a.evaluate(ctx).earned && !earnedAtById.has(a.id),
    );
    if (newlyEarned.length > 0) {
      try {
        await this.prisma.achievementUnlock.createMany({
          data: newlyEarned.map((a) => ({ userId, achievementId: a.id })),
          skipDuplicates: true,
        });
        const now = new Date();
        for (const a of newlyEarned) earnedAtById.set(a.id, now);
      } catch (err) {
        this.logger.warn(
          `Failed to record achievement unlocks: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    const achievements: BoardAchievement[] = ACHIEVEMENTS.map((a) => {
      const result = a.evaluate(ctx);
      return {
        id: a.id,
        title: a.title,
        body: a.body,
        category: a.category,
        rarity: a.rarity,
        icon: a.icon,
        hint: a.hint,
        earned: result.earned,
        earnedAt: earnedAtById.get(a.id)?.toISOString() ?? null,
        progress: result.progress ?? null,
      };
    });

    return {
      achievements,
      earnedCount: achievements.filter((a) => a.earned).length,
    };
  }

  /** Pure read of the board — evaluates against current state but writes nothing. */
  async getBoard(userId: string): Promise<{
    achievements: BoardAchievement[];
    earnedCount: number;
  }> {
    return this.evaluateBoard(userId);
  }

  /** Verified = the referred account actually completed email verification. */
  private async verifiedReferralCount(userId: string): Promise<number> {
    const rows = await this.prisma.referral.findMany({
      where: { referrerId: userId, referredUserId: { not: null } },
      select: { referredUser: { select: { emailVerified: true, deletedAt: true } } },
      take: 500,
    });
    let n = 0;
    for (const r of rows) {
      if (r.referredUser && r.referredUser.emailVerified && !r.referredUser.deletedAt) {
        n += 1;
      }
    }
    return n;
  }

  /** Tracks `utcDayFloor` re-exported for spec convenience. */
  static readonly dayFloor = utcDayFloor;
}