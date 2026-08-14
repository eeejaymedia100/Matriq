import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Platform, StyleSheet } from "react-native";
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
const SKIPPED_KEY = "skipped_update_version";

/**
 * Silent background updater (spec §15). New versions download in the
 * background — no blocking modal, no "keep the app open" bar. When the
 * download finishes a slim, non-blocking banner appears; the install is also
 * triggered automatically at the next natural reopen (fresh app start) if the
 * user hasn't applied it yet.
 */
export function UpdateOverlay() {
  const { theme } = useTheme();
  const colors = theme.colors;

  const [ready, setReady] = useState<AppUpdateInfo | null>(null);
  const [showBanner, setShowBanner] = useState(false);
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

      const skipped = await getItem(SKIPPED_KEY).catch(() => null);
      if (skipped === String(info.versionCode)) return;

      const ok = await downloadSilently(info);
      if (ok) {
        setReady(info);
        setShowBanner(true);
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

  const handleInstallNow = useCallback(async () => {
    if (!ready || installing) return;
    setInstalling(true);
    const ok = await installApk(ready);
    if (ok) {
      setShowBanner(false);
    } else {
      // Let the user retry by keeping the banner.
      setInstalling(false);
    }
  }, [ready, installing]);

  const handleDismiss = useCallback(async () => {
    await setItem(SKIPPED_KEY, String(ready?.versionCode ?? "")).catch(() => {});
    setShowBanner(false);
  }, [ready]);

  // Web build (for iOS users) has no APK path — nothing here.
  if (Platform.OS === "web") return null;
  if (!showBanner || !ready) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View
        style={[
          styles.banner,
          {
            backgroundColor: theme.mode === "glass" ? "rgba(30,12,48,0.96)" : colors.surface,
            borderColor: colors.border,
            ...(theme.mode === "pop" ? { borderWidth: 2, borderColor: colors.borderStrong, boxShadow: "3px 3px 0 #170B26" } : { borderWidth: 1 }),
          },
        ]}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: colors.accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="download" size={19} color="#170B26" />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>
            Matriq {ready.versionName} ready
          </Text>
          <Text style={[theme.typography.caption, { color: colors.textSecondary, lineHeight: 18 }]} numberOfLines={2}>
            Downloaded in the background. Restart to apply it.
          </Text>
        </View>
        <Pressable
          onPress={() => void handleInstallNow()}
          disabled={installing}
          style={{
            paddingVertical: 9,
            paddingHorizontal: 16,
            borderRadius: theme.radii.md,
            backgroundColor: colors.accent,
            borderWidth: theme.mode === "pop" ? 2 : 0,
            borderColor: colors.borderStrong,
            marginLeft: 8,
          }}
        >
          <Text style={{ fontFamily: "PlusJakartaSans_700Bold", fontSize: 13, color: "#170B26" }}>
            {installing ? "Opening…" : "Install"}
          </Text>
        </Pressable>
        <Pressable onPress={() => void handleDismiss()} hitSlop={10} style={{ marginLeft: 8 }}>
          <Icon name="x" size={16} color={colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 88,
    zIndex: 900,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
});
