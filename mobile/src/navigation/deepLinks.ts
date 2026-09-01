import { navigationRef } from "./navigationRef";

/** Only these deep links exist in the main stack — guard unknown targets. */
export const VALID_LINKS = new Set([
  "VerificationStatus",
  "Fees",
  "Explore",
  "Vault",
  "Receipt",
  "Home",
  "Timetable",
]) as ReadonlySet<string>;

/**
 * Navigate to a validated deep-link target (from an in-app feed row or a
 * tapped push notification). Returns false when the link is unknown or the
 * navigator isn't ready yet — callers just ignore that.
 */
export function navigateByLink(link: string | null | undefined): boolean {
  if (!link || !VALID_LINKS.has(link)) return false;
  if (navigationRef.isReady()) {
    navigationRef.navigate(link as never);
    return true;
  }
  return false;
}
