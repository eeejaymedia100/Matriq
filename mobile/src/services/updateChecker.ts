import { Platform } from "react-native";
import * as Application from "expo-application";

export interface AppUpdateInfo {
  versionCode: number;
  versionName: string;
  url: string;
  notes?: string;
  publishedAt?: string;
}

// The update manifest is served from the static site (waitlist/ dir mounted
// at matriq.com.ng), so update checks keep working even if the API is down.
const UPDATE_MANIFEST_URL = "https://matriq.com.ng/app-version.json";

/** The versionCode of the installed build (e.g. "2" → 2), or null. */
export async function getCurrentVersionCode(): Promise<number | null> {
  try {
    const raw = Application.nativeBuildVersion;
    if (!raw) return null;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Fetch the published update manifest, or null on any failure. */
export async function fetchUpdateInfo(): Promise<AppUpdateInfo | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(UPDATE_MANIFEST_URL, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as AppUpdateInfo;
  } catch {
    return null;
  }
}

/**
 * Returns update info when a newer versionCode is published, else null.
 * Silently no-ops on non-Android platforms and any network failure.
 */
export async function checkForUpdate(): Promise<AppUpdateInfo | null> {
  if (Platform.OS !== "android") return null;

  const [current, remote] = await Promise.all([
    getCurrentVersionCode(),
    fetchUpdateInfo(),
  ]);

  if (current === null || !remote) return null;
  return remote.versionCode > current ? remote : null;
}
