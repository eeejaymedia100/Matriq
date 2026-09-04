import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import { api } from "../api/client";
import { getItem, setItem } from "../utils/storage";
import { getStreak } from "../utils/streak";
import { listNotes } from "../utils/notes";
import { allTodosDone } from "../utils/todos";
import { loadHistory } from "../offline/history";
import { awardBadge } from "../utils/badges";
import { queueCelebrations } from "../utils/celebrations";
import type { AchievementBoard, BoardAchievement } from "../utils/achievements";

const BOARD_CACHE_KEY = "achievements_board_cache_v1";
// Don't re-evaluate on every focus — the board changes slowly.
const REFRESH_TTL_MS = 60 * 1000;

/** Count completed AI Q&As in the offline chat history (user turns). */
async function countOfflineAiExchanges(): Promise<number> {
  try {
    const conversations = await loadHistory();
    return conversations.reduce(
      (sum, c) => sum + c.messages.filter((m) => m.role === "user").length,
      0,
    );
  } catch {
    return 0;
  }
}

async function collectClientSignals() {
  const [streakState, notes, todosDone, offlineAiCount] = await Promise.all([
    getStreak(),
    listNotes(),
    allTodosDone(),
    countOfflineAiExchanges(),
  ]);
  return {
    streak: streakState.current,
    notesCount: notes.length,
    todosDone,
    offlineAiCount,
  };
}

/**
 * Board → celebration diff. Every earned badge is offered to the celebration
 * bus; the bus's persisted seen-set makes repeats harmless no-ops. A badge
 * earned while the app was closed therefore celebrates on the next launch,
 * exactly once.
 */
function toCelebrations(achievements: BoardAchievement[]) {
  return achievements
    .filter((a) => a.earned && a.earnedAt)
    .map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      rarity: a.rarity,
      icon: a.icon,
      earnedAt: a.earnedAt as string,
    }));
}

interface AchievementsContextValue {
  board: AchievementBoard | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const AchievementsContext = createContext<AchievementsContextValue | null>(null);

/**
 * The Achievement Board as a root provider: one evaluation feeds the
 * Achievements screen, the Home preview and the unlock ceremony host.
 * Only the server decides what is earned — this provider reports, caches
 * (so the board renders offline) and funnels unlocks into celebrations.
 */
export function AchievementsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [board, setBoard] = useState<AchievementBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const lastRefreshedAt = useRef(0);

  const refresh = useCallback(async () => {
    if (Date.now() - lastRefreshedAt.current < REFRESH_TTL_MS) {
      setLoading(false);
      return;
    }
    lastRefreshedAt.current = Date.now();
    const signals = await collectClientSignals();
    try {
      const data = await api.post<AchievementBoard>(
        "/me/achievements/evaluate",
        signals,
      );
      setBoard(data);
      await setItem(BOARD_CACHE_KEY, JSON.stringify(data)).catch(() => {});
      await queueCelebrations(toCelebrations(data.achievements));
      // Legacy device-local badge sync: once the server confirms
      // first_foundations, retire the old to-do badge trigger so the Home
      // screen never double-celebrates through the legacy overlay.
      if (data.achievements.some((a) => a.id === "first_foundations" && a.earned)) {
        await awardBadge("all_todos").catch(() => {});
      }
    } catch {
      // Offline / error — render the last known board instead of nothing.
      try {
        const raw = await getItem(BOARD_CACHE_KEY);
        if (raw) setBoard(JSON.parse(raw) as AchievementBoard);
      } catch {
        // No cache either — stay empty.
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // First paint from cache (if any), then evaluate fresh.
    (async () => {
      try {
        const raw = await getItem(BOARD_CACHE_KEY);
        if (raw) setBoard(JSON.parse(raw) as AchievementBoard);
      } catch {
        // ignore
      }
      void refresh();
    })();
  }, [refresh]);

  // Re-evaluate when the app returns to the foreground (badges can also be
  // earned server-side while the student is away).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const value = useMemo(
    () => ({ board, loading, refresh }),
    [board, loading, refresh],
  );

  return (
    <AchievementsContext.Provider value={value}>
      {children}
    </AchievementsContext.Provider>
  );
}

export function useAchievements(): AchievementsContextValue {
  const ctx = useContext(AchievementsContext);
  if (!ctx) {
    throw new Error("useAchievements must be used within AchievementsProvider");
  }
  return ctx;
}
