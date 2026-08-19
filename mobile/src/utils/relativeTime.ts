/**
 * Relative-time labels ("just now", "5m ago", "3h ago", "2d ago", or a short
 * date for older timestamps). Shared by Home, Timetable, Notifications and the
 * AI history screens instead of a copy per screen.
 */
export function relativeTimeFrom(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

/** Relative-time label from an ISO timestamp string. */
export function timeAgo(iso: string): string {
  return relativeTimeFrom(new Date(iso).getTime());
}
