/**
 * Magic Plus — capability boundaries.
 *
 * This module is the ARCHITECTURE for the future premium tier, not the
 * paywall. Nothing here blocks or gates any feature today; `isPremium` always
 * returns false until the subscription system is actually built.
 *
 * The philosophy: the free tier must be genuinely useful (offline AI, notes,
 * OCR, Image to PDF, the community library, CGPA tools — all free, forever).
 * Magic Plus is an optional upgrade for students who want more power,
 * convenience and personalization — never a paywall around basics.
 *
 * Candidate premium capabilities (each one costs Matriq real money or effort
 * to deliver, which is what justifies charging):
 *   - Larger private storage allowance (private files directly create storage
 *     cost; the community library stays unlimited and free by design).
 *   - Higher-quality document processing (full-resolution OCR, larger upload
 *     cap, batch conversions).
 *   - Deeper document intelligence (search inside your own materials, smart
 *     summaries, auto-tagging, source-grounded answers from YOUR vault).
 *   - Advanced study planning (adaptive focus plans, spaced-repetition
 *     scheduling, deadline planning with notifications).
 *   - Cloud backup + sync of private notes/materials across devices.
 *   - Priority processing for large/queued jobs.
 *
 * These are deliberately NOT implemented yet. When a feature is built, it is
 * tagged here so the boundary stays explicit and reviewable in one place.
 */

/** Every future premium capability, listed up front so nothing sneaks in. */
export type PremiumCapability =
  | "largerPrivateStorage"
  | "fullResolutionOcr"
  | "documentIntelligence"
  | "advancedPlanning"
  | "cloudBackupSync"
  | "priorityProcessing";

/**
 * Single gate. Reads a feature flag (env/config) when one exists; until then
 * every capability is off. Callers use this so the eventual flip is one line.
 */
export function isPremiumCapability(_capability: PremiumCapability): boolean {
  // TODO(magic-plus): read the entitlement source (backend /me/plan or a
  // local flag) when the subscription system lands. Deliberately false now —
  // the free tier is complete and nothing is gated.
  return false;
}

/** Human labels — used by future settings UI, kept here for the record. */
export const PREMIUM_LABELS: Record<PremiumCapability, string> = {
  largerPrivateStorage: "Bigger private storage",
  fullResolutionOcr: "Full-resolution OCR",
  documentIntelligence: "Document intelligence",
  advancedPlanning: "Advanced study planning",
  cloudBackupSync: "Cloud backup & sync",
  priorityProcessing: "Priority processing",
};
