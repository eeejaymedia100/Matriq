import { Platform } from "react-native";
import * as Updates from "expo-updates";
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

// ── OTA (JS-level updates via expo-updates) ────────────────────────
/**
 * The primary update path. JS-only changes (screens, styles, logic) publish
 * as OTA updates to the static manifest on matriq.com.ng and download in the
 * background — no rebuild, no APK, no reinstall. The update applies the next
 * time the app restarts (expo-updates loads it automatically on cold start;
 * no forced reload mid-session, so the user is never interrupted).
 *
 * The APK updater above remains the fallback for native-level changes (new
 * native module, SDK bump, permissions). Publishing rule of thumb:
 *  - JS-only change → scripts/_publish-ota.sh (fast, silent, automatic)
 *  - native/config change → bump versionCode, rebuild, ship the APK
 *
 * All failures are silent and non-fatal: a failed check keeps the app on its
 * current (working) update.
 */

/** Check the OTA manifest for a newer JS update. False on anything failing. */
export async function checkForOtaUpdate(): Promise<boolean> {
  if (__DEV__) return false;
  try {
    const result = await Updates.checkForUpdateAsync();
    return result.isAvailable;
  } catch {
    return false;
  }
}

/**
 * Download the available OTA update in the background. True when an update
 * was fetched and is staged for the next cold start.
 */
export async function downloadOtaUpdate(): Promise<boolean> {
  if (__DEV__) return false;
  try {
    const result = await Updates.fetchUpdateAsync();
    return result.isNew;
  } catch {
    return false;
  }
}

/**
 * The update ID currently running (null when on the embedded bundle, in dev,
 * or when expo-updates is unavailable — e.g. the web build).
 */
export async function currentOtaUpdateId(): Promise<string | null> {
  try {
    return Updates.updateId ?? null;
  } catch {
    return null;
  }
}
