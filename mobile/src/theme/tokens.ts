/**
 * Matriq brand tokens — single source of truth for the two accent hues and
 * the supporting palette (spec §2 "Glass & Pop"). Both themes are built from
 * these; the two themes read as one product only because the accents never
 * drift.
 */

export const brand = {
  purple950: "#14061F", // Glass base background (deep enough to read as void)
  purple600: "#55278F", // Pop brand accent
  purple500: "#7B4BC4", // Avatar gradients, both themes
  lime500: "#C6FF3D", // Primary accent, both themes — never under body text
  lime400: "#DBFF7A", // Lighter lime, on-dark text/hover
  ink: "#170B26", // Pop text + brutalist borders/shadows
  paper: "#F5F1FB", // Pop base background
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
