import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Platform,
  StyleSheet,
  Modal,
  ActivityIndicator,
  AppState,
} from "react-native";
import * as IntentLauncher from "expo-intent-launcher";
import * as FileSystem from "expo-file-system/legacy";
import { getItem, setItem } from "../utils/storage";
import { useTheme } from "../theme/ThemeContext";
import { Icon } from "./icons";
import {
  checkForUpdate,
  getCurrentVersionCode,
  type AppUpdateInfo,
} from "../services/updateChecker";

const READY_KEY = "update_ready_version";

// APKs are tens of megabytes — anything smaller is a truncated partial.
const MIN_PLAUSIBLE_APK_BYTES = 5_000_000;

/** Base64 of the ZIP local-file-header magic "PK\x03\x04". */
const ZIP_HEAD_MAGIC = "UEsDBA==";
/** Base64 of the ZIP end-of-central-directory magic "PK\x05\x06". */
const ZIP_EOCD_MAGIC = "UEsFBg==";

/**
 * Silent background updater (round-2 QA §12).
 *
 * The new version downloads silently in the background. Once it's finished,
 * a popup appears: "Update detected — restart the application?" with Yes/No.
 *  - Yes → opens the installer now.
 *  - No  → defers, does NOT cancel: the update still applies the next time
 *          the app restarts on its own (fresh app start), and the popup
 *          returns on the next launch until applied.
 *
 * Robustness (why installs used to fail):
 *  - The cached APK is validated before install (ZIP magic at the head AND
 *    the end-of-central-directory marker at the tail + a plausible size), so
 *    a partial download from a killed process is never trusted — it's deleted
 *    and re-downloaded instead of failing with "can't parse package".
 *  - If the system blocks the install (unknown-sources permission), the popup
 *    offers BOTH "Open install settings" and "Download in browser" — the
 *    browser path is the bootstrap that works even when the in-app installer
 *    is blocked, because the system browser has its own install permission.
 */

/** Result of trying to hand the APK to the system installer. */
type InstallResult = { ok: true } | { ok: false; reason: "invalid" | "blocked" };

/** True when the cached file looks like a complete, installable APK. */
async function looksLikeValidApk(fileUri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info?.exists) return false;
    if ((info.size ?? 0) < MIN_PLAUSIBLE_APK_BYTES) return false;
    // ZIP local-file header at the start…
    const head = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
      position: 0,
      length: 4,
    });
    if (head !== ZIP_HEAD_MAGIC) return false;
    // …and the end-of-central-directory marker near the tail. A truncated
    // partial download has the head but not the EOCD — this catches it.
    const tailLen = Math.min((info.size ?? 0) - 4, 22);
    if (tailLen < 18) return false;
    const tail = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
      position: (info.size ?? 0) - tailLen,
      length: tailLen,
    });
    if (!tail.includes(ZIP_EOCD_MAGIC)) return false;
    return true;
  } catch {
    return false;
  }
}

export function UpdateOverlay() {
  const { theme } = useTheme();
  const colors = theme.colors;

  const [ready, setReady] = useState<AppUpdateInfo | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installBlocked, setInstallBlocked] = useState(false);
  // Guards against overlapping check/download runs (foreground event + timer
  // can fire close together, and an in-flight download must not be restarted).
  const checking = useRef(false);

  const fileUriFor = (info: AppUpdateInfo): string | null => {
    const cacheDir = FileSystem.cacheDirectory;
    return cacheDir ? `${cacheDir}matriq-${info.versionCode}.apk` : null;
  };

  // ── Silent install at a natural reopen ────────────────────────
  const installReadyVersion = useCallback(async (): Promise<boolean> => {
    const raw = await getItem(READY_KEY).catch(() => null);
    if (!raw) return false;
    let info: AppUpdateInfo;
    try {
      info = JSON.parse(raw) as AppUpdateInfo;
    } catch {
      return false;
    }
    const current = await getCurrentVersionCode();
    if (current !== null && info.versionCode <= current) {
      await setItem(READY_KEY, "").catch(() => {});
      return false;
    }
    // Not interrupting anything — this runs on a fresh app start.
    const result = await installApk(info);
    if (result.ok) return true;
    if (result.reason === "invalid") {
      // Corrupt cached copy — clear the ready flag so runCheck re-downloads.
      await setItem(READY_KEY, "").catch(() => {});
    }
    return false;
  }, []);

  const downloadSilently = async (info: AppUpdateInfo): Promise<boolean> => {
    try {
      const fileUri = fileUriFor(info);
      if (!fileUri) return false;
      const existing = await FileSystem.getInfoAsync(fileUri).catch(() => null);
      if (existing?.exists && (await looksLikeValidApk(fileUri))) {
        // A complete, valid copy is already on disk — just mark it ready.
        await setItem(READY_KEY, JSON.stringify(info)).catch(() => {});
        return true;
      }
      if (existing?.exists) {
        // Partial/corrupt file from a crashed download — remove it so the
        // resumable download starts clean instead of trusting a broken file.
        await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(
          () => {},
        );
      }
      const resumable = FileSystem.createDownloadResumable(info.url, fileUri);
      const result = await resumable.downloadAsync();
      if (!result?.uri) return false;
      if (!(await looksLikeValidApk(fileUri))) {
        // Download "completed" but the file is unusable — never mark it ready.
        await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(
          () => {},
        );
        return false;
      }
      await setItem(READY_KEY, JSON.stringify(info)).catch(() => {});
      return true;
    } catch {
      return false;
    }
  };

  /**
   * One update pass: apply an already-downloaded update, otherwise check the
   * manifest and download the newest silently. Safe to call repeatedly — it
   * no-ops while a download is in flight or the prompt is already showing, and
   * a partially-downloaded APK is resumed, never restarted.
   */
  const runCheck = useCallback(async () => {
    if (checking.current || showPrompt) return;
    checking.current = true;
    try {
      // 1. Apply an already-downloaded update at this natural reopen.
      const applied = await installReadyVersion();
      if (applied) return;

      // 2. Otherwise check the manifest and download silently in the background.
      const info = await checkForUpdate();
      if (!info) return;
      const ok = await downloadSilently(info);
      if (ok) {
        // A previously-deferred update re-prompts until applied (No defers,
        // it never cancels).
        setReady(info);
        setShowPrompt(true);
      }
    } finally {
      checking.current = false;
    }
  }, [installReadyVersion, showPrompt]);

  useEffect(() => {
    void runCheck();

    // Re-check when the app returns to the foreground (the common case for
    // "came back online") and periodically while it stays open, so a pending
    // update is fetched as soon as connectivity returns — no manual APK
    // re-download needed.
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void runCheck();
    });
    const interval = setInterval(() => void runCheck(), 30 * 60 * 1000);

    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, [runCheck]);

  const installApk = async (info: AppUpdateInfo): Promise<InstallResult> => {
    try {
      const fileUri = fileUriFor(info);
      if (!fileUri) return { ok: false, reason: "invalid" };
      if (!(await looksLikeValidApk(fileUri))) {
        return { ok: false, reason: "invalid" };
      }
      const contentUri = await FileSystem.getContentUriAsync(fileUri);
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: contentUri,
        type: "application/vnd.android.package-archive",
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      });
      return { ok: true };
    } catch {
      return { ok: false, reason: "blocked" };
    }
  };

  const handleYes = async () => {
    if (!ready || installing) return;
    setInstalling(true);
    setInstallBlocked(false);

    const first = await installApk(ready);
    if (first.ok) {
      setShowPrompt(false);
      setInstalling(false);
      return;
    }

    if (first.reason === "invalid") {
      // The cached copy is corrupt (killed mid-download) — clear it and pull
      // a fresh one, then try once more before giving up.
      const fileUri = fileUriFor(ready);
      if (fileUri) {
        await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(
          () => {},
        );
      }
      await setItem(READY_KEY, "").catch(() => {});
      const redownloaded = await downloadSilently(ready);
      if (redownloaded) {
        const second = await installApk(ready);
        if (second.ok) {
          setShowPrompt(false);
          setInstalling(false);
          return;
        }
      }
    }

    // The system refused the install (unknown sources) — guide the user.
    setInstalling(false);
    setInstallBlocked(true);
  };

  const openInstallSettings = useCallback(async () => {
    try {
      await IntentLauncher.startActivityAsync(
        "android.settings.MANAGE_UNKNOWN_APP_SOURCES",
        { data: "package:app.matriq.mobile" },
      );
    } catch {
      // Ignore — the system install prompt may already be guiding the user.
    }
  }, []);

  /**
   * Bootstrap path: open the APK URL in the system browser. The browser has
   * its own "install unknown apps" permission and handles the download +
   * install prompt itself — works even when the in-app installer is blocked.
   */
  const downloadInBrowser = useCallback(async () => {
    if (!ready) return;
    try {
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: ready.url,
      });
    } catch {
      // Ignore — the settings shortcut is still available.
    }
  }, [ready]);

  const handleNo = useCallback(() => {
    // Defers only — the update still applies at the next natural reopen,
    // and this prompt returns next launch until it's applied.
    setShowPrompt(false);
  }, []);

  // Web build (for iOS users) has no APK path — nothing here.
  if (Platform.OS === "web") return null;

  return (
    <Modal
      visible={showPrompt && !!ready}
      transparent
      animationType="fade"
      onRequestClose={handleNo}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.mode === "glass" ? "rgba(30,12,48,0.98)" : colors.surface,
              borderColor: colors.border,
              ...(theme.mode === "pop"
                ? { borderWidth: 2, borderColor: colors.borderStrong, boxShadow: "5px 5px 0 #170B26" }
                : { borderWidth: 1 }),
            },
          ]}
        >
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              backgroundColor: colors.accent,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 14,
            }}
          >
            <Icon name="download" size={26} color="#170B26" />
          </View>
          <Text style={[theme.typography.h2, { color: colors.textPrimary }]}>
            Update detected
          </Text>
          <Text
            style={[
              theme.typography.body,
              { color: colors.textSecondary, marginTop: 8, textAlign: "center", lineHeight: 24 },
            ]}
          >
            Matriq {ready?.versionName} has finished downloading in the
            background. Restart the application to apply it?
          </Text>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 22, width: "100%" }}>
            <Pressable
              onPress={handleNo}
              disabled={installing}
              style={{
                flex: 1,
                alignItems: "center",
                paddingVertical: 13,
                borderRadius: theme.radii.md,
                borderWidth: 1.5,
                borderColor: colors.borderStrong,
              }}
            >
              <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>
                Not now
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void handleYes()}
              disabled={installing}
              style={{
                flex: 1,
                alignItems: "center",
                paddingVertical: 13,
                borderRadius: theme.radii.md,
                backgroundColor: colors.accent,
                borderWidth: theme.mode === "pop" ? 2 : 0,
                borderColor: colors.borderStrong,
              }}
            >
              {installing ? (
                <ActivityIndicator size="small" color="#170B26" />
              ) : (
                <Text style={{ fontFamily: "PlusJakartaSans_700Bold", fontSize: 14, color: "#170B26" }}>
                  Restart now
                </Text>
              )}
            </Pressable>
          </View>
          {installBlocked ? (
            <View style={{ width: "100%", marginTop: 14 }}>
              <Text
                style={[
                  theme.typography.small,
                  { color: colors.textSecondary, textAlign: "center", lineHeight: 18 },
                ]}
              >
                Android blocked the install. Allow "Install unknown apps" for
                Matriq — or download it in your browser, which has its own
                install permission.
              </Text>
              <Pressable
                onPress={() => void downloadInBrowser()}
                style={{
                  marginTop: 12,
                  alignItems: "center",
                  paddingVertical: 11,
                  borderRadius: theme.radii.md,
                  backgroundColor: colors.accent,
                  borderWidth: theme.mode === "pop" ? 2 : 0,
                  borderColor: colors.borderStrong,
                }}
              >
                <Text style={{ fontFamily: "PlusJakartaSans_700Bold", fontSize: 14, color: "#170B26" }}>
                  Download in browser
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void openInstallSettings()}
                style={{
                  marginTop: 10,
                  alignItems: "center",
                  paddingVertical: 11,
                  borderRadius: theme.radii.md,
                  borderWidth: 1.5,
                  borderColor: colors.borderStrong,
                }}
              >
                <Text style={[theme.typography.bodyBold, { color: colors.accent }]}>
                  Open install settings
                </Text>
              </Pressable>
            </View>
          ) : null}

          <Text style={[theme.typography.small, { color: colors.textMuted, marginTop: 14, textAlign: "center" }]}>
            "Not now" defers — the update applies next time the app restarts.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(10,4,20,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 28,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
  },
});