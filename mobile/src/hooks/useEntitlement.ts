import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { getItem, setItem } from "../utils/storage";
import type { BackendEntitlement } from "../offline/focus";

/**
 * Magic Plus entitlement — DISPLAY ONLY.
 *
 * The backend is the authority for paid cloud usage. The app reads /focus/status
 * to show the student where they stand (free generations left, whether they're
 * premium), and caches the last-known value so the workspace can still describe
 * Focus Mode while offline. A client-side flag is never the final word — the
 * server re-checks entitlement on every generation.
 */
const ENTT_CACHE_KEY = "magic_plus_entitlement";

export function useEntitlement() {
  const [status, setStatus] = useState<BackendEntitlement | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const s = await api.get<BackendEntitlement>("/focus/status");
      setStatus(s);
      await setItem(ENTT_CACHE_KEY, JSON.stringify(s));
    } catch {
      // Offline / transient — fall back to the cached value; never block UI.
      try {
        const raw = await getItem(ENTT_CACHE_KEY);
        if (raw) setStatus(JSON.parse(raw) as BackendEntitlement);
      } catch {
        /* ignore */
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, loading, refresh };
}