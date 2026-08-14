import { getItem, setItem } from "./storage";
import { getTodoState } from "./todos";

/**
 * Badges & celebrations (spec §11). No streak mechanic — badges are awarded
 * for real completed actions. The first trigger is finishing all four
 * My To-Do's items; more can be added later by extending BADGES.
 */
export interface Badge {
  id: string;
  title: string;
  body: string;
  icon: "trophy" | "target" | "layers" | "zap" | "book";
  /** One-line instruction shown while locked. */
  hint: string;
}

export const BADGES: Badge[] = [
  {
    id: "all_todos",
    title: "First Foundations",
    body: "You set up your timetable, offline AI, materials and profile — Matriq is officially yours.",
    icon: "trophy",
    hint: "Finish all four My To-Do's to unlock",
  },
];

const AWARDED_KEY = "badges_awarded";

export async function getAwardedBadgeIds(): Promise<string[]> {
  try {
    const raw = await getItem(AWARDED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function isBadgeAwarded(id: string): Promise<boolean> {
  return (await getAwardedBadgeIds()).includes(id);
}

/** Award a badge; returns true when it was newly awarded (→ trigger celebration). */
export async function awardBadge(id: string): Promise<boolean> {
  const awarded = await getAwardedBadgeIds();
  if (awarded.includes(id)) return false;
  await setItem(AWARDED_KEY, JSON.stringify([...awarded, id]));
  return true;
}

/**
 * Check the To-Do completion badge. Called whenever to-do state changes;
 * returns the badge id to celebrate, or null.
 */
export async function checkTodoBadge(): Promise<string | null> {
  const state = await getTodoState();
  const allDone = state.timetable && state.offlineAi && state.materials && state.photo;
  if (!allDone) return null;
  const newly = await awardBadge("all_todos");
  return newly ? "all_todos" : null;
}
