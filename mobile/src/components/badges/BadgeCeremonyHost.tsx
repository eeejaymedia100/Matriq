import React, { useCallback, useEffect, useState } from "react";
import { UnlockCeremony } from "./UnlockCeremony";
import {
  subscribeToCelebrations,
  currentCelebrationQueue,
  dequeueCelebration,
} from "../../utils/celebrations";
import type { PendingCelebration } from "../../utils/badgeDesign";

/**
 * BadgeCeremonyHost — mounts once at the app root and plays queued badge
 * unlock ceremonies app-wide, no matter which screen earned the badge.
 * Delivery is exactly-once (persisted seen-set in celebrations.ts); the
 * queue survives restarts, so unlocks made while the app was closed still
 * get their moment on next launch.
 */
export function BadgeCeremonyHost() {
  const [queue, setQueue] = useState<PendingCelebration[]>([]);

  useEffect(() => {
    let mounted = true;
    // Drain anything left over from a previous session first.
    currentCelebrationQueue().then((q) => {
      if (mounted && q.length > 0) setQueue(q);
    });
    const unsub = subscribeToCelebrations((q) => {
      if (mounted && q.length > 0) setQueue(q);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const handleDone = useCallback(() => {
    setQueue((current) => {
      for (const item of current) void dequeueCelebration(item.id);
      return [];
    });
  }, []);

  if (queue.length === 0) return null;
  return <UnlockCeremony queue={queue} onDone={handleDone} />;
}
