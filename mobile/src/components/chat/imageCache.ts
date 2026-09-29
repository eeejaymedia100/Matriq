/**
 * Image cache for AI-chat carousels — expo-file-system based disk cache
 * with an in-memory hot map. The app is data-conscious (prepaid data is
 * the product's core constraint), so every carousel image is downloaded
 * ONCE and reused for the session and after.
 *
 * Cache key = FNV-1a hash of the URL (deterministic, no crypto dep needed
 * for a filename). Entries live in the OS cache dir under "ai-img/".
 * Failures degrade gracefully: a failed download just means "load from the
 * network again next time" — never an error surface to the student.
 */

import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

const MAX_DISK_BYTES = 50 * 1024 * 1024; // 50 MB — generous but bounded
const memory = new Map<string, string>(); // url -> local uri
const inflight = new Map<string, Promise<string | null>>();
let dirReady = false;

/** Cache directory root, or null when the filesystem is unavailable (web). */
function cacheBase(): string | null {
  const base = FileSystem.cacheDirectory;
  return base ? `${base}ai-img/` : null;
}

/** FNV-1a 32-bit — collision-safe enough for a cache filename. */
function hashUrl(url: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i += 1) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + url.length.toString(36);
}

function extFor(url: string): string {
  const m = /\.(jpe?g|png|webp|gif)(?:$|\?)/i.exec(url);
  return m ? `.${m[1].toLowerCase()}` : ".img";
}

async function ensureDir(): Promise<string | null> {
  const base = cacheBase();
  if (!base) return null;
  if (dirReady) return base;
  try {
    const info = await FileSystem.getInfoAsync(base);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(base, { intermediates: true });
    }
    dirReady = true;
  } catch {
    // Cache unavailable (rare) — callers fall back to network URLs.
    dirReady = true;
  }
  return base;
}

/** Best-effort disk accounting: skip write when the dir is over budget. */
async function withinBudget(base: string): Promise<boolean> {
  try {
    if (Platform.OS === "web") return false;
    const entries = await FileSystem.readDirectoryAsync(base);
    let total = 0;
    for (const name of entries) {
      try {
        const info = await FileSystem.getInfoAsync(`${base}${name}`);
        if (info.exists && typeof info.size === "number") {
          total += info.size;
        }
      } catch {
        // single unreadable entry — ignore
      }
    }
    return total < MAX_DISK_BYTES;
  } catch {
    return true; // don't let accounting break caching
  }
}

/**
 * Resolve a remote image URL to a local cached URI. Returns the original
 * URL when caching is unavailable — the carousel always has something to
 * render. Concurrent calls for the same URL share one download.
 */
export async function cachedImageUri(url: string): Promise<string> {
  if (!url || !/^https:\/\//i.test(url)) return url;
  if (Platform.OS === "web") return url; // browser handles its own caching
  const hit = memory.get(url);
  if (hit) return hit;

  const existing = inflight.get(url);
  if (existing) {
    return (await existing) ?? url;
  }

  const task = (async (): Promise<string | null> => {
    const base = await ensureDir();
    if (!base) return null;
    const path = `${base}${hashUrl(url)}${extFor(url)}`;
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists && info.size > 0) {
        return path;
      }
    } catch {
      // fall through to download
    }
    try {
      if (await withinBudget(base)) {
        const res = await FileSystem.downloadAsync(url, path);
        if (res.status === 200 && res.uri) {
          return res.uri;
        }
      }
    } catch {
      // network/cache failure — surface the remote URL instead
    }
    return null;
  })();

  inflight.set(url, task);
  try {
    const local = await task;
    const resolved = local ?? url;
    if (local) memory.set(url, local);
    return resolved;
  } finally {
    inflight.delete(url);
  }
}
