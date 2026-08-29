import { getItem, setItem } from "./storage";

/**
 * Study streak (round-3 gamification §1). Tracks consecutive days of
 * MEANINGFUL study activity — a completed AI Q&A, saving a note, or adding a
 * study material — never plain app launches or taps. One streak, one badge;
 * deliberately no points, levels or leaderboards yet.
 *
 * Persistent on-device via the shared storage wrapper, so a streak survives
 * app restarts and works fully offline.
 */
export interface StreakState {
  /** Consecutive days with study activity, ending today (or the last day). */
  current: number;
  /** Best streak ever reached. */
  best: number;
  /** Local date ("YYYY-MM-DD") of the most recent study day. */
  lastActiveDay: string;
}

const STREAK_KEY = "streak_state";

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysAgoKey(n: number): string {
  return dayKey(new Date(Date.now() - n * 86_400_000));
}

const EMPTY: StreakState = { current: 0, best: 0, lastActiveDay: "" };

export async function getStreak(): Promise<StreakState> {
  try {
    const raw = await getItem(STREAK_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<StreakState>;
    return {
      current:
        typeof parsed.current === "number" && parsed.current > 0
          ? parsed.current
          : 0,
      best: typeof parsed.best === "number" ? parsed.best : 0,
      lastActiveDay:
        typeof parsed.lastActiveDay === "string" ? parsed.lastActiveDay : "",
    };
  } catch {
    return { ...EMPTY };
  }
}

/**
 * Record a meaningful study action for today. Idempotent per day: any number
 * of study actions on the same day still count as one streak day.
 */
export async function logStudyActivity(): Promise<StreakState> {
  const state = await getStreak();
  const today = dayKey(new Date());

  // Already counted today — don't inflate the streak with repeat actions.
  if (state.lastActiveDay === today) return state;

  // Streak continues only when yesterday was also a study day; otherwise it
  // restarts at 1 (a gap resets the chain, best is preserved).
  const current = state.lastActiveDay === daysAgoKey(1) ? state.current + 1 : 1;
  const next: StreakState = {
    current,
    best: Math.max(state.best, current),
    lastActiveDay: today,
  };
  await setItem(STREAK_KEY, JSON.stringify(next));
  return next;
}

/** "1 day" / "5 days" label for the Home streak chip. */
export function streakLabel(streak: StreakState): string {
  return `${streak.current} day${streak.current === 1 ? "" : "s"}`;
}
