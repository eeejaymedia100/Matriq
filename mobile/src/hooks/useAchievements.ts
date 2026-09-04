import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { getItem, setItem } from "../utils/storage";
import { getStreak } from "../utils/streak";
import { listNotes } from "../utils/notes";
import { allTodosDone } from "../utils/todos";
import { loadHistory } from "../offline/history";
import type { AchievementBoard } from "../utils/achievements";

const BOARD_CACHE_KEY = "achievements_board_cache_v1";
// Don't re-evaluate on every Home focus — the board changes slowly.
const REFRESH_TTL_MS = 60 * 1000;
let lastRefreshedAt = 0;

/** Count completed AI Q&As in the offline chat history (user turns). */
async function countOfflineAiExchanges(): Promise<number> {
  try {
    const conversations = await loadHistory();
    return conversations.reduce(
      (sum, c) =>
        sum + c.messages.filter((m) => m.role === "user").length,
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
 * The Achievement Board. Evaluates against real data (server + on-device
 * signals) and caches the result so the board renders offline. Only the
 * server decides what is earned — this hook just reports and renders.
 */
export function useAchievements() {
  const [board, setBoard] = useState<AchievementBoard | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (Date.now() - lastRefreshedAt < REFRESH_TTL_MS) {
      setLoading(false);
      return;
    }
    lastRefreshedAt = Date.now();
    const signals = await collectClientSignals();
    try {
      const data = await api.post<AchievementBoard>(
        "/me/achievements/evaluate",
        signals,
      );
      setBoard(data);
      await setItem(BOARD_CACHE_KEY, JSON.stringify(data)).catch(() => {});
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

  return { board, loading, refresh };
}