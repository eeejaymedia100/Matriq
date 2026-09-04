/**
 * Achievement Board types — mirror of the backend contract
 * (backend/src/achievements). The server is the single authority for what is
 * earned; the app only reports on-device signals and renders the board.
 */

export type AchievementCategory =
  | "Foundations"
  | "Consistency"
  | "AI Learning"
  | "Knowledge";

export type AchievementRarity = "common" | "uncommon" | "rare" | "epic";

export interface AchievementProgress {
  current: number;
  target: number;
}

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

export interface AchievementBoard {
  achievements: BoardAchievement[];
  earnedCount: number;
}

export const CATEGORY_ORDER: AchievementCategory[] = [
  "Foundations",
  "Consistency",
  "AI Learning",
  "Knowledge",
];

export const CATEGORY_META: Record<
  AchievementCategory,
  { label: string; blurb: string }
> = {
  Foundations: {
    label: "Foundations",
    blurb: "Set up Matriq the right way.",
  },
  Consistency: {
    label: "Consistency",
    blurb: "Show up, day after day.",
  },
  "AI Learning": {
    label: "AI Learning",
    blurb: "Learn faster with AI.",
  },
  Knowledge: {
    label: "Knowledge",
    blurb: "Build your own library of understanding.",
  },
};