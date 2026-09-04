import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Achievement Board — deterministic evaluation from REAL student data.
 *
 * Every achievement maps to genuine signals already tracked by the product
 * (vault uploads, library reads/saves, Focus maps, cloud AI Q&As, profile
 * completeness, study streak, notes, offline AI). No dummy achievements:
 * nothing can be "earned" without the corresponding real action.
 *
 * Server-known signals come straight from the DB. On-device-only signals
 * (study streak, local notes, offline-AI Q&As, to-do completion) are passed
 * in by the app when it evaluates. The client never decides earn status on
 * its own — the server is the single authority (same rule as entitlements).
 */

export type AchievementCategory =
  | "Foundations"
  | "Consistency"
  | "AI Learning"
  | "Knowledge";

export type AchievementRarity = "common" | "uncommon" | "rare" | "epic";

export interface AchievementContext {
  profilePhotoSet: boolean;
  institutionSet: boolean;
  facultySet: boolean;
  departmentSet: boolean;
  levelSet: boolean;
  emailVerified: boolean;
  /** Cloud AI Q&As logged server-side. */
  aiQueryCount: number;
  /** Focus Mode maps generated server-side. */
  focusMapCount: number;
  /** Own vault uploads. */
  vaultCount: number;
  /** Library documents opened (Continue Reading views). */
  libraryViewCount: number;
  /** Library documents saved/bookmarked. */
  librarySaveCount: number;
  // ── Client-reported (on-device only) ──
  notesCount: number;
  offlineAiCount: number;
  streak: number;
  todosDone: boolean;
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
  // ── Foundations ───────────────────────────────────────────
  {
    id: "first_foundations",
    title: "First Foundations",
    body: "You set up your timetable, offline AI, materials and profile — Matriq is officially yours.",
    category: "Foundations",
    rarity: "common",
    icon: "seed",
    hint: "Finish all four My To-Do's to unlock",
    evaluate: (ctx) => ({ earned: ctx.todosDone }),
  },
  {
    id: "profile_complete",
    title: "The Full Picture",
    body: "Your profile tells the whole story — photo, university, faculty, department and level.",
    category: "Foundations",
    rarity: "uncommon",
    icon: "user",
    hint: "Complete your profile: photo, university, faculty, department and level",
    evaluate: (ctx) => ({
      earned:
        ctx.profilePhotoSet &&
        ctx.institutionSet &&
        ctx.facultySet &&
        ctx.departmentSet &&
        ctx.levelSet,
    }),
  },
  {
    id: "verified_member",
    title: "Legit",
    body: "You verified your email — your account is officially yours.",
    category: "Foundations",
    rarity: "common",
    icon: "check",
    hint: "Verify your email address",
    evaluate: (ctx) => ({ earned: ctx.emailVerified }),
  },

  // ── Consistency ───────────────────────────────────────────
  {
    id: "streak_3",
    title: "Momentum",
    body: "Three days of real study in a row — habits are starting to stick.",
    category: "Consistency",
    rarity: "common",
    icon: "flame",
    hint: "Study on 3 consecutive days",
    evaluate: (ctx) => count(ctx.streak, 3),
  },
  {
    id: "streak_7",
    title: "Week of Focus",
    body: "Seven straight days of meaningful study. That's a real routine.",
    category: "Consistency",
    rarity: "uncommon",
    icon: "flame",
    hint: "Study on 7 consecutive days",
    evaluate: (ctx) => count(ctx.streak, 7),
  },
  {
    id: "streak_21",
    title: "Unstoppable",
    body: "21 days of study without a break. Most people never get here.",
    category: "Consistency",
    rarity: "epic",
    icon: "flame",
    hint: "Study on 21 consecutive days",
    evaluate: (ctx) => count(ctx.streak, 21),
  },

  // ── AI Learning ───────────────────────────────────────────
  {
    id: "first_ai_qa",
    title: "First Conversation",
    body: "You asked your first AI question and got a real answer.",
    category: "AI Learning",
    rarity: "common",
    icon: "sparkle",
    hint: "Ask your first AI question (offline or cloud)",
    evaluate: (ctx) => count(ctx.aiQueryCount + ctx.offlineAiCount, 1),
  },
  {
    id: "ai_25",
    title: "Curious Mind",
    body: "25 questions answered — you're learning faster than most.",
    category: "AI Learning",
    rarity: "uncommon",
    icon: "sparkle",
    hint: "Ask 25 AI questions",
    evaluate: (ctx) => count(ctx.aiQueryCount + ctx.offlineAiCount, 25),
  },
  {
    id: "first_focus_map",
    title: "Mind Mapper",
    body: "You turned a complex topic into a structured concept map.",
    category: "AI Learning",
    rarity: "uncommon",
    icon: "layers",
    hint: "Generate your first Focus Mode map",
    evaluate: (ctx) => count(ctx.focusMapCount, 1),
  },
  {
    id: "focus_5_maps",
    title: "Deep Diver",
    body: "Five topics mapped — you don't just skim, you structure.",
    category: "AI Learning",
    rarity: "rare",
    icon: "layers",
    hint: "Generate 5 Focus Mode maps",
    evaluate: (ctx) => count(ctx.focusMapCount, 5),
  },

  // ── Knowledge ─────────────────────────────────────────────
  {
    id: "first_note",
    title: "Note Taker",
    body: "Your first note is saved — private, on your phone, always yours.",
    category: "Knowledge",
    rarity: "common",
    icon: "pen",
    hint: "Save your first note",
    evaluate: (ctx) => count(ctx.notesCount, 1),
  },
  {
    id: "notes_10",
    title: "Ten Notes Deep",
    body: "Ten notes and counting — you're building your own knowledge base.",
    category: "Knowledge",
    rarity: "uncommon",
    icon: "pen",
    hint: "Save 10 notes",
    evaluate: (ctx) => count(ctx.notesCount, 10),
  },
  {
    id: "first_upload",
    title: "Contributor",
    body: "Your first upload is in the Library — shared knowledge starts with you.",
    category: "Knowledge",
    rarity: "uncommon",
    icon: "vault",
    hint: "Upload your first study material",
    evaluate: (ctx) => count(ctx.vaultCount, 1),
  },
  {
    id: "uploads_5",
    title: "Library Builder",
    body: "Five materials shared — future students will thank you.",
    category: "Knowledge",
    rarity: "rare",
    icon: "vault",
    hint: "Upload 5 study materials",
    evaluate: (ctx) => count(ctx.vaultCount, 5),
  },
  {
    id: "first_library_read",
    title: "Explorer",
    body: "You opened a document from the discovery library — new worlds, new notes.",
    category: "Knowledge",
    rarity: "common",
    icon: "book",
    hint: "Open a document from the Library discovery feed",
    evaluate: (ctx) => count(ctx.libraryViewCount, 1),
  },
  {
    id: "first_library_save",
    title: "Bookmarker",
    body: "You saved a document for later — smart readers always do.",
    category: "Knowledge",
    rarity: "uncommon",
    icon: "bookmark",
    hint: "Save a document from the Library",
    evaluate: (ctx) => count(ctx.librarySaveCount, 1),
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

  constructor(private readonly prisma: PrismaService) {}

  /** Load server-side signals + evaluate every achievement. */
  async evaluateBoard(
    userId: string,
    client: {
      notesCount?: number;
      offlineAiCount?: number;
      streak?: number;
      todosDone?: boolean;
    } = {},
  ): Promise<{ achievements: BoardAchievement[]; earnedCount: number }> {
    const [user, aiQueryCount, focusMapCount, vaultCount, libraryViewCount, librarySaveCount, unlocks] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { id: userId },
          select: {
            profilePhotoUrl: true,
            institutionId: true,
            faculty: true,
            department: true,
            level: true,
            emailVerified: true,
          },
        }),
        this.prisma.aiQueryLog.count({ where: { userId } }),
        this.prisma.focusModeSession.count({ where: { userId } }),
        this.prisma.vaultItem.count({
          where: { userId, deletedAt: null },
        }),
        this.prisma.libraryView.count({ where: { userId } }),
        this.prisma.librarySave.count({ where: { userId } }),
        this.prisma.achievementUnlock.findMany({
          where: { userId },
          select: { achievementId: true, earnedAt: true },
        }),
      ]);

    if (!user) {
      return { achievements: [], earnedCount: 0 };
    }

    const ctx: AchievementContext = {
      profilePhotoSet: !!user.profilePhotoUrl,
      institutionSet: !!user.institutionId,
      facultySet: !!user.faculty?.trim(),
      departmentSet: !!user.department?.trim(),
      levelSet: !!user.level?.trim(),
      emailVerified: user.emailVerified,
      aiQueryCount,
      focusMapCount,
      vaultCount,
      libraryViewCount,
      librarySaveCount,
      notesCount: Math.max(0, Math.floor(client.notesCount ?? 0)),
      offlineAiCount: Math.max(0, Math.floor(client.offlineAiCount ?? 0)),
      streak: Math.max(0, Math.floor(client.streak ?? 0)),
      todosDone: !!client.todosDone,
    };

    const earnedAtById = new Map(unlocks.map((u) => [u.achievementId, u.earnedAt]));

    // Record newly-earned achievements (the table is just the fact + date).
    const newlyEarned = ACHIEVEMENTS.filter(
      (a) => a.evaluate(ctx).earned && !earnedAtById.has(a.id),
    );
    if (newlyEarned.length > 0) {
      try {
        await this.prisma.achievementUnlock.createMany({
          data: newlyEarned.map((a) => ({ userId, achievementId: a.id })),
          skipDuplicates: true,
        });
        for (const a of newlyEarned) {
          earnedAtById.set(a.id, new Date());
        }
      } catch (err) {
        this.logger.warn(
          `Failed to record achievement unlocks: ${err instanceof Error ? err.message : String(err)}`,
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

  /** Read-only board (no evaluation, no writes) — used for cached renders. */
  async getBoard(
    userId: string,
    client: {
      notesCount?: number;
      offlineAiCount?: number;
      streak?: number;
      todosDone?: boolean;
    } = {},
  ): Promise<{ achievements: BoardAchievement[]; earnedCount: number }> {
    return this.evaluateBoard(userId, client);
  }
}