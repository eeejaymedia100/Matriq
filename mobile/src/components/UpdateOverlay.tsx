import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Platform,
  StyleSheet,
  Modal,
  ActivityIndicator,
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

/**
 * Silent background updater (round-2 QA §12).
 *
 * The new version downloads silently in the background. Once it's finished,
 * a popup appears: "Update detected — restart the application?" with Yes/No.
 *  - Yes → opens the installer now.
 *  - No  → defers, does NOT cancel: the update still applies the next time
 *          the app restarts on its own (fresh app start), and the popup
 *          returns on the next launch until applied.
 */
export function UpdateOverlay() {
  const { theme } = useTheme();
  const colors = theme.colors;

  const [ready, setReady] = useState<AppUpdateInfo | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [installing, setInstalling] = useState(false);
  const ran = useRef(false);

  // ── Silent install at a natural reopen ────────────────────────
  const installReadyVersion = useCallback(async (): Promise<boolean> => {
    const raw = await getItem(READY_KEY).catch(() => null);
    if (!raw) return false;
    const info = JSON.parse(raw) as AppUpdateInfo;
    const current = await getCurrentVersionCode();
    if (current !== null && info.versionCode <= current) {
      await setItem(READY_KEY, "").catch(() => {});
      return false;
    }
    // Not interrupting anything — this runs on a fresh app start.
    return installApk(info);
  }, []);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const boot = async () => {
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
    };
    void boot();
  }, [installReadyVersion]);

  const downloadSilently = async (info: AppUpdateInfo): Promise<boolean> => {
    try {
      const cacheDir = FileSystem.cacheDirectory;
      if (!cacheDir) return false;
      const fileUri = `${cacheDir}matriq-${info.versionCode}.apk`;
      const existing = await FileSystem.getInfoAsync(fileUri).catch(() => null);
      if (existing?.exists) {
        // Already downloaded — just mark it ready.
        await setItem(READY_KEY, JSON.stringify(info)).catch(() => {});
        return true;
      }
      const resumable = FileSystem.createDownloadResumable(info.url, fileUri);
      const result = await resumable.downloadAsync();
      if (!result?.uri) return false;
      await setItem(READY_KEY, JSON.stringify(info)).catch(() => {});
      return true;
    } catch {
      return false;
    }
  };

  const installApk = async (info: AppUpdateInfo): Promise<boolean> => {
    try {
      const cacheDir = FileSystem.cacheDirectory;
      if (!cacheDir) return false;
      const fileUri = `${cacheDir}matriq-${info.versionCode}.apk`;
      const existing = await FileSystem.getInfoAsync(fileUri).catch(() => null);
      if (!existing?.exists) return false;

      const contentUri = await FileSystem.getContentUriAsync(fileUri);
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: contentUri,
        type: "application/vnd.android.package-archive",
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      });
      return true;
    } catch {
      return false;
    }
  };

  const handleYes = useCallback(async () => {
    if (!ready || installing) return;
    setInstalling(true);
    const ok = await installApk(ready);
    if (ok) {
      setShowPrompt(false);
    } else {
      // Installer didn't open — keep the prompt so the user can retry.
      setInstalling(false);
    }
  }, [ready, installing]);

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
