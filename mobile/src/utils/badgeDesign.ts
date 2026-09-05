import { RARITY_PALETTES } from "../components/GameBadge";
import type { AchievementRarity } from "./achievements";

/**
 * Badge design system — everything the Skia celebration layer needs, derived
 * per rarity. One file so a new rarity tier (e.g. "legendary" when the badge
 * list lands) is a single entry here + in RARITY_PALETTES, and every visual
 * (particles, glow, ceremony pace) follows automatically.
 */

export interface ParticleTheme {
  /** Colors particles are drawn in — pulled from the rarity plate so the
   *  celebration always matches the badge being celebrated. */
  colors: string[];
  /** Particles per burst — more for higher rarity. */
  count: number;
  /** Seconds a particle lives. */
  lifetime: number;
  /** Radial spread velocity, dp/s. */
  speed: number;
  /** Particle radius range, dp. */
  radius: [number, number];
  /** 0–1 — how strongly particles drift downward (gravity feel). */
  gravity: number;
}

const PARTICLE_THEMES: Record<AchievementRarity, ParticleTheme> = {
  // Common: a quiet puff — dust, not fireworks.
  common: {
    colors: ["#C7CDDC", "#97A0B5", "#E4E8F0"],
    count: 18,
    lifetime: 1.1,
    speed: 170,
    radius: [1.2, 2.6],
    gravity: 0.35,
  },
  uncommon: {
    colors: ["#8BDD6E", "#3E8E4E", "#D6F5C0"],
    count: 30,
    lifetime: 1.35,
    speed: 220,
    radius: [1.4, 3.2],
    gravity: 0.3,
  },
  rare: {
    colors: ["#6FD9E8", "#2A7A94", "#D2F1F8"],
    count: 46,
    lifetime: 1.6,
    speed: 260,
    radius: [1.5, 3.6],
    gravity: 0.22,
  },
  // Epic: gold fireworks — the biggest moment the app has.
  epic: {
    colors: ["#FFD96B", "#D99A1B", "#FFF3C4", "#FFE49A"],
    count: 70,
    lifetime: 1.9,
    speed: 320,
    radius: [1.6, 4.2],
    gravity: 0.16,
  },
};

/** Longer, warmer copy for the ceremony than the board's one-liner. */
export const CEREMONY_LINES: Record<AchievementRarity, string[]> = {
  common: ["Every expert was once here.", "Real study, real progress.", "One step at a time."],
  uncommon: ["Most students never get here.", "You're building something.", "Momentum looks good on you."],
  rare: ["This one takes discipline.", "Few reach this. You did.", "The library remembers."],
  epic: ["Legendary discipline.", "This is what dedication looks like.", "Uncommon effort. Uncommon reward."],
};

export function particleThemeFor(rarity: AchievementRarity): ParticleTheme {
  return PARTICLE_THEMES[rarity] ?? PARTICLE_THEMES.common;
}

export function ceremonyLineFor(rarity: AchievementRarity, id: string): string {
  const lines = CEREMONY_LINES[rarity] ?? CEREMONY_LINES.common;
  // Stable pick per badge id — the same badge always gets the same line.
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return lines[h % lines.length];
}

/** A badge queued for celebration, carried in storage between sessions. */
export interface PendingCelebration {
  id: string;
  title: string;
  body: string;
  rarity: AchievementRarity;
  icon: string;
  earnedAt: string;
}
