import { getItem, setItem } from "./storage";
import type { FocusMap } from "../offline/focus";

/**
 * Focus Mode history — generated concept maps are saved on-device so a
 * student can reopen a learning structure instead of losing it when they
 * leave the workspace. Capped at 20 maps; oldest are dropped first.
 */
const FOCUS_HISTORY_KEY = "focus_maps_history";
const MAX_MAPS = 20;

export async function listFocusMaps(): Promise<FocusMap[]> {
  try {
    const raw = await getItem(FOCUS_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FocusMap[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getFocusMap(id: string): Promise<FocusMap | null> {
  const maps = await listFocusMaps();
  return maps.find((m) => m.id === id) ?? null;
}

/** Save (or replace by id) a map and return the updated list. */
export async function saveFocusMap(map: FocusMap): Promise<FocusMap[]> {
  const maps = await listFocusMaps();
  const without = maps.filter((m) => m.id !== map.id);
  const next = [map, ...without].slice(0, MAX_MAPS);
  await setItem(FOCUS_HISTORY_KEY, JSON.stringify(next));
  return next;
}

export async function deleteFocusMap(id: string): Promise<FocusMap[]> {
  const maps = await listFocusMaps();
  const next = maps.filter((m) => m.id !== id);
  await setItem(FOCUS_HISTORY_KEY, JSON.stringify(next));
  return next;
}
