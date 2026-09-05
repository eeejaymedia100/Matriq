/**
 * Matriq brand tokens — single source of truth for the accent hues and
 * the supporting palette. The brand is BLACK + LIME. There is no purple
 * anywhere in the product (locked correction): dark surfaces are true
 * void blacks, light surfaces are warm neutral paper, and lime is the
 * only accent. The two themes read as one product because the accents
 * never drift.
 */

export const brand = {
  // Dark surfaces — true black, not tinted.
  void: "#0A0A0A", // Glass base background (reads as void)
  voidDeep: "#000000", // Deepest background shade
  // Light surfaces — warm neutral, zero purple tint.
  paper: "#F6F5F2", // Pop base background
  paperDeep: "#ECEAE5", // Pop deep shade / wells
  ink: "#17181A", // Pop text + borders (neutral near-black)
  // The accent — unchanged, the original lime.
  lime500: "#C6FF3D", // Primary accent, both themes — never under body text
  lime400: "#DBFF7A", // Lighter lime, on-dark text/hover
  // Color for text/icons sitting ON lime.
  onAccent: "#17181A",
} as const;

/** One small sparkle icon (four-point flash) is reserved for AI-touched
 *  surfaces only — the offline AI section in Study, nowhere else. */
export const AI_SPARKLE = "sparkle";

/** Tagline shown across splash/loading, onboarding, footers. */
export const TAGLINE = "The smart way.";

export const motionTokens = {
  /** Glass: fluid and continuous, 400–600ms, cubic-bezier(.16,1,.3,1), never bouncy. */
  glass: {
    durationFast: 400,
    duration: 500,
    durationSlow: 600,
    bezier: [0.16, 1, 0.3, 1] as const,
  },
  /** Pop: snappy with slight overshoot, 150–250ms, cubic-bezier(.34,1.56,.64,1). */
  pop: {
    durationFast: 150,
    duration: 200,
    durationSlow: 250,
    bezier: [0.34, 1.56, 0.64, 1] as const,
  },
} as const;
