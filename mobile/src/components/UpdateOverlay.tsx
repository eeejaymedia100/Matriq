import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import * as IntentLauncher from "expo-intent-launcher";
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import { colors, spacing, typography } from "../theme/colors";
import { Button } from "../components";
import {
  checkForUpdate,
  type AppUpdateInfo,
} from "../services/updateChecker";

const SKIPPED_VERSION_KEY = "skipped_update_version";

/**
 * Global update overlay. On app start it quietly checks the published
 * version manifest; if a newer build exists it offers a one-tap
 * download + install, so users never need to sideload a new APK manually.
 */
export function UpdateOverlay() {
  const [update, setUpdate] = useState<AppUpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;

    // Delay the check so it never interrupts onboarding or the first paint.
    const timer = setTimeout(async () => {
      const info = await checkForUpdate();
      if (!info) return;

      // Don't nag again for a version the user already dismissed.
      const skipped = await SecureStore.getItemAsync(
        SKIPPED_VERSION_KEY,
      ).catch(() => null);
      if (skipped === String(info.versionCode)) return;

      setUpdate(info);
    }, 4000);

    return () => clearTimeout(timer);
  }, []);

  const handleLater = useCallback(async () => {
    if (!update) return;
    await SecureStore.setItemAsync(
      SKIPPED_VERSION_KEY,
      String(update.versionCode),
    ).catch(() => {});
    setUpdate(null);
  }, [update]);

  const handleInstall = useCallback(async () => {
    if (!update || downloading) return;

    setDownloading(true);
    setProgress(0);
    try {
      const cacheDir = FileSystem.cacheDirectory;
      if (!cacheDir) {
        throw new Error("Storage is unavailable on this device");
      }
      const fileName = `matriq-${update.versionCode}.apk`;
      const fileUri = `${cacheDir}${fileName}`;

      // Clear any partial download from a previous attempt.
      const existing = await FileSystem.getInfoAsync(fileUri).catch(
        () => null,
      );
      if (existing?.exists) {
        await FileSystem.deleteAsync(fileUri).catch(() => {});
      }

      const resumable = FileSystem.createDownloadResumable(
        update.url,
        fileUri,
        {},
        (p) => {
          if (p.totalBytesExpectedToWrite > 0) {
            setProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite);
          }
        },
      );

      const result = await resumable.downloadAsync();
      if (!result?.uri) {
        throw new Error("Download failed");
      }

      // The package installer needs a content:// URI with a read grant, not
      // a raw file:// path. expo-file-system's FileProvider handles this.
      const contentUri = await FileSystem.getContentUriAsync(result.uri);

      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: contentUri,
        type: "application/vnd.android.package-archive",
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      });

      // The system installer opens over the app; close the modal.
      setUpdate(null);
    } catch (err) {
      Alert.alert(
        "Update failed",
        err instanceof Error
          ? err.message
          : "Could not download the update. Please try again later.",
      );
    } finally {
      setDownloading(false);
    }
  }, [update, downloading]);

  if (!update) {
    return null;
  }

  const percent = Math.round(progress * 100);

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={downloading ? () => {} : handleLater}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>New version</Text>
          </View>
          <Text style={styles.title}>
            Matriq {update.versionName} is available
          </Text>
          <Text style={styles.subtitle}>
            {update.notes?.trim() ||
              "A new version of Matriq is ready. Update now to get the latest features and fixes."}
          </Text>

          {downloading ? (
            <View style={styles.progressWrap}>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.max(percent, 4)}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                Downloading… {percent}%
              </Text>
            </View>
          ) : (
            <View style={styles.actions}>
              <Button
                title="Update now"
                onPress={handleInstall}
                loading={false}
                size="lg"
              />
              <TouchableOpacity
                style={styles.later}
                onPress={handleLater}
                activeOpacity={0.7}
              >
                <Text style={styles.laterText}>Remind me later</Text>
              </TouchableOpacity>
            </View>
          )}

          {downloading && (
            <View style={styles.downloadingHint}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.downloadingText}>
                Keep the app open — installing will start automatically.
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(13, 6, 32, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.xl,
    alignItems: "center",
  },
  badge: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    marginBottom: spacing.md,
  },
  badgeText: {
    ...typography.captionBold,
    color: colors.primary,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  actions: {
    width: "100%",
    gap: spacing.sm,
    alignItems: "center",
  },
  later: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  laterText: {
    ...typography.body,
    color: colors.textMuted,
  },
  progressWrap: {
    width: "100%",
    marginTop: spacing.xs,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  progressText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  downloadingHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  downloadingText: {
    ...typography.small,
    color: colors.textMuted,
    flexShrink: 1,
  },
});
