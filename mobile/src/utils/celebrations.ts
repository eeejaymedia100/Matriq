import { getItem, setItem } from "./storage";
import type { PendingCelebration } from "./badgeDesign";

/**
 * Celebration delivery — exactly-once, app-wide.
 *
 * Two sources can celebrate a badge: the server board diff (any screen) and
 * on-device triggers (e.g. finishing the four To-Do's = first_foundations).
 * Both funnel through one bus with a persisted seen-set, so a badge is
 * celebrated once no matter which path notices it first — even across app
 * restarts (a badge earned while the app was closed celebrates on next
 * launch, exactly once).
 */

const SEEN_KEY = "badge_celebrations_seen_v1";
const QUEUE_KEY = "badge_celebrations_queue_v1";

/**
 * Celebration aliases — the same conceptual achievement under two ids
 * (device-local trigger vs server authority). Either being seen marks the
 * other as celebrated, so the student never sees the same moment twice.
 */
const CELEBRATION_ALIASES: Record<string, string[]> = {
  all_todos: ["first_foundations"],
  first_foundations: ["all_todos"],
};

async function loadSeen(): Promise<string[]> {
  try {
    const raw = await getItem(SEEN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveSeen(seen: string[]): Promise<void> {
  await setItem(SEEN_KEY, JSON.stringify(seen.slice(-500)));
}

type Listener = (queue: PendingCelebration[]) => void;

const listeners = new Set<Listener>();
let inMemoryQueue: PendingCelebration[] | null = null;

async function loadQueue(): Promise<PendingCelebration[]> {
  if (inMemoryQueue) return inMemoryQueue;
  try {
    const raw = await getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue: PendingCelebration[]): Promise<void> {
  inMemoryQueue = queue;
  await setItem(QUEUE_KEY, JSON.stringify(queue));
  for (const l of listeners) {
    try {
      l(queue);
    } catch {
      // A broken listener must never break delivery.
    }
  }
}

/** Subscribe to celebration queue changes (the host does this once). */
export function subscribeToCelebrations(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Current queue snapshot (used by the host on mount to drain leftovers). */
export async function currentCelebrationQueue(): Promise<PendingCelebration[]> {
  return loadQueue();
}

/**
 * Queue celebrations for anything not yet seen. Persists the seen-set
 * immediately — a crash mid-ceremony must never re-celebrate.
 * Returns the queue length after enqueueing (for logging/tests).
 */
export async function queueCelebrations(
  items: PendingCelebration[],
): Promise<number> {
  if (items.length === 0) return (await loadQueue()).length;
  const seen = await loadSeen();
  const seenSet = new Set(seen);
  // Alias-aware: a queued/seen sibling id (device-local vs server id for the
  // same achievement) suppresses the duplicate celebration.
  const fresh = items.filter(
    (i) =>
      !seenSet.has(i.id) &&
      !(CELEBRATION_ALIASES[i.id] ?? []).some((alias) => seenSet.has(alias)),
  );
  if (fresh.length === 0) return (await loadQueue()).length;

  const queue = await loadQueue();
  // Keep celebration order by earn date (oldest unlock first).
  const merged = [...queue, ...fresh].sort(
    (a, b) =>
      new Date(a.earnedAt).getTime() - new Date(b.earnedAt).getTime(),
  );
  await saveSeen([...seen, ...fresh.map((f) => f.id)]);
  await saveQueue(merged);
  return merged.length;
}

/** The host drains the current badge when the student finishes with it. */
export async function dequeueCelebration(id: string): Promise<void> {
  const queue = await loadQueue();
  await saveQueue(queue.filter((q) => q.id !== id));
}

/** Test/dev helper: clear delivery state. */
export async function resetCelebrations(): Promise<void> {
  await setItem(SEEN_KEY, JSON.stringify([]));
  await saveQueue([]);
}
