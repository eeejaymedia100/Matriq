import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
  Pressable,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { MainStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeContext";
import { ThemedScreen } from "../../components/Surface";
import { Button, Icon } from "../../components";
import { useOfflineAi } from "../../offline/OfflineAiContext";
import { formatBytes, type OfflineModel } from "../../offline/models";
import type { MatriqTheme, MatriqThemeColors } from "../../theme/themes";

type Nav = NativeStackNavigationProp<MainStackParamList, "OfflineModels">;

/**
 * Offline AI model picker (round-2 QA §7). Models are a compact 3-column
 * grid showing name + size; tapping one opens its detail view (RAM needed,
 * speed, description) with download/use/delete actions.
 */
export function OfflineModelsScreen() {
  const { theme } = useTheme();
  const colors = theme.colors;
  const styles = makeStyles(theme, colors);

  const navigation = useNavigation<Nav>();
  const { models, freeSpace, preferOffline, setPreferOffline, refreshFreeSpace } =
    useOfflineAi();
  const [selected, setSelected] = useState<OfflineModel | null>(null);

  useEffect(() => {
    void refreshFreeSpace();
  }, [refreshFreeSpace]);

  return (
    <ThemedScreen>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Icon name="cloudOff" size={26} color={colors.brand} />
          </View>
          <Text style={styles.heroTitle}>AI that works with no internet</Text>
          <Text style={styles.heroText}>
            Download a model once over Wi-Fi and the AI Study Companion keeps
            answering questions even when there's no network at all. No data
            charges afterwards.
          </Text>
        </View>

        <View style={styles.toggleCard}>
          <View style={styles.toggleTextWrap}>
            <Text style={styles.toggleTitle}>Always use offline AI</Text>
            <Text style={styles.toggleSub}>
              Uses the on-device model for every question instead of the online
              AI. Great if data is expensive or the network is unreliable.
            </Text>
          </View>
          <Switch
            value={preferOffline}
            onValueChange={(v) => void setPreferOffline(v)}
            trackColor={{ true: colors.brand, false: colors.border }}
            thumbColor={preferOffline ? colors.brand : colors.surface}
          />
        </View>

        <View style={styles.storageRow}>
          <Icon name="vault" size={16} color={colors.textMuted} />
          <Text style={styles.storageText}>
            {freeSpace !== null
              ? `Free storage: ${formatBytes(freeSpace)}`
              : "Checking free storage…"}
          </Text>
        </View>

        {/* Compact 3-column grid — name + size only */}
        <View style={styles.grid}>
          {models.map((model) => (
            <ModelTile
              key={model.id}
              model={model}
              onPress={() => setSelected(model)}
            />
          ))}
        </View>

        <View style={styles.noteCard}>
          <Icon name="info" size={18} color={colors.info} />
          <Text style={styles.noteText}>
            Bigger models give better answers but use more storage and battery.
            Tap any model for the full details.
          </Text>
        </View>

        <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()}>
          <Icon name="arrowLeft" size={16} color={colors.brand} />
          <Text style={styles.backText}>Back to AI Study Companion</Text>
        </TouchableOpacity>
      </ScrollView>

      <ModelDetailModal
        model={selected}
        onClose={() => setSelected(null)}
      />
    </ThemedScreen>
  );
}

/** "Downloading… 62% · 2.3 MB/s · ~1 min left" style progress line. */
function downloadMetaText(
  progress: number,
  speedBps?: number,
  etaSeconds?: number | null,
): string {
  const pct = Math.round(progress * 100);
  const parts = [`Downloading… ${pct}%`];
  if (speedBps !== undefined && speedBps > 0) {
    parts.push(`${(speedBps / (1024 * 1024)).toFixed(1)} MB/s`);
  }
  if (etaSeconds !== undefined && etaSeconds !== null && Number.isFinite(etaSeconds)) {
    const mins = Math.ceil(etaSeconds / 60);
    parts.push(mins >= 1 ? `~${mins} min left` : `~${Math.ceil(etaSeconds)}s left`);
  }
  return parts.join(" · ");
}

/** One grid tile — just name, tier and size (round-2 QA §7). */
function ModelTile({
  model,
  onPress,
}: {
  model: OfflineModel;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const { downloaded, activeModelId } = useOfflineAi();

  const isDownloaded = !!downloaded[model.id];
  const isActive = activeModelId === model.id;

  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        minWidth: "30%",
        maxWidth: "32%",
        alignItems: "center",
        gap: 6,
        paddingVertical: 14,
        paddingHorizontal: 6,
        borderRadius: theme.radii.md,
        backgroundColor: colors.surface,
        borderWidth: 1.5,
        borderColor: isActive ? colors.accent : model.recommended ? colors.brand + "66" : colors.border,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          backgroundColor: colors.surfaceAlt,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon
          name={isDownloaded ? "check" : model.tier === "Medium" ? "layers" : model.tier === "Small" ? "zap" : "dot"}
          size={16}
          color={isDownloaded ? colors.success : colors.brand}
        />
      </View>
      <Text
        numberOfLines={1}
        style={[theme.typography.captionBold, { color: colors.textPrimary, fontSize: 12 }]}
      >
        {model.name.split(" ")[0]} {model.name.split(" ")[1] ?? ""}
      </Text>
      <Text style={[theme.typography.small, { color: colors.textMuted }]}>
        {formatBytes(model.sizeBytes)}
      </Text>
      {model.recommended ? (
        <View
          style={{
            borderRadius: 999,
            paddingHorizontal: 7,
            paddingVertical: 2,
            backgroundColor: colors.accent,
          }}
        >
          <Text style={{ fontSize: 9, fontWeight: "700", color: "#170B26" }}>
            Recommended
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Full detail for the tapped model — RAM, speed, description, actions. */
function ModelDetailModal({
  model,
  onClose,
}: {
  model: OfflineModel | null;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const styles = makeStyles(theme, colors);

  const {
    downloaded,
    activeModelId,
    engineState,
    engineProgress,
    downloads,
    startDownload,
    cancelDownload,
    deleteModel,
    selectModel,
  } = useOfflineAi();

  if (!model) return null;

  const isDownloaded = !!downloaded[model.id];
  const isActive = activeModelId === model.id;
  const download = downloads[model.id];

  const onDelete = () => {
    Alert.alert(
      "Delete this model?",
      `${model.name} (${formatBytes(model.sizeBytes)}) will be removed from your phone. You can download it again anytime.`,
      [
        { text: "Keep", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => void deleteModel(model.id) },
      ],
    );
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.modalBackdrop}
        onPress={onClose}
      >
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{model.name}</Text>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                <View style={styles.tierBadge}>
                  <Text style={styles.tierBadgeText}>{model.tier}</Text>
                </View>
                {model.recommended ? (
                  <View style={[styles.tierBadge, styles.recoBadge]}>
                    <Text style={[styles.tierBadgeText, styles.recoBadgeText]}>Recommended</Text>
                  </View>
                ) : null}
                {isActive ? (
                  <View style={[styles.tierBadge, styles.inUseBadge]}>
                    <Icon name="check" size={12} color={colors.success} />
                    <Text style={[styles.tierBadgeText, styles.inUseText]}>In use</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Icon name="x" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={styles.cardDesc}>{model.description}</Text>

          <View style={styles.specList}>
            <View style={styles.specItem}>
              <Icon name="download" size={15} color={colors.textMuted} />
              <Text style={styles.specText}>Download: {formatBytes(model.sizeBytes)}</Text>
            </View>
            <View style={styles.specItem}>
              <Icon name="phone" size={15} color={colors.textMuted} />
              <Text style={styles.specText}>RAM needed: {model.ramNote}</Text>
            </View>
            <View style={styles.specItem}>
              <Icon name="zap" size={15} color={colors.textMuted} />
              <Text style={styles.specText}>Speed: {model.speedNote}</Text>
            </View>
          </View>

          {download ? (
            <View style={{ gap: 8, marginTop: 8 }}>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.max(download.progress * 100, 3)}%` },
                  ]}
                />
              </View>
              <View style={styles.downloadMeta}>
                <Text style={styles.downloadText}>
                  {downloadMetaText(download.progress, download.speedBps, download.etaSeconds)}
                </Text>
                <TouchableOpacity onPress={() => void cancelDownload(model.id)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
              {download.error ? (
                <View style={styles.errorRow}>
                  <Icon name="alert" size={14} color={colors.error} />
                  <Text style={styles.errorText}>{download.error}</Text>
                </View>
              ) : null}
            </View>
          ) : isDownloaded ? (
            <View style={{ gap: 10, marginTop: 12 }}>
              {isActive ? (
                <View style={styles.engineWrap}>
                  {engineState === "loading" && (
                    <>
                      <ActivityIndicator size="small" color={colors.brand} />
                      <Text style={styles.engineText}>
                        Loading model… {Math.round(engineProgress * 100)}%
                      </Text>
                    </>
                  )}
                  {engineState === "ready" && (
                    <Text style={styles.engineText}>
                      Ready — answers work without internet
                    </Text>
                  )}
                  {engineState === "error" && (
                    <Text style={styles.errorText}>
                      Couldn't start. Try a smaller model.
                    </Text>
                  )}
                </View>
              ) : (
                <Button
                  title="Use this model"
                  size="md"
                  variant={model.recommended ? "primary" : "outline"}
                  onPress={() => void selectModel(model.id)}
                />
              )}
              <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
                <Icon name="trash" size={16} color={colors.error} />
                <Text style={styles.deleteText}>Delete model</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ marginTop: 12 }}>
              <Button
                title={`Download (${formatBytes(model.sizeBytes)})`}
                size="md"
                variant={model.recommended ? "primary" : "outline"}
                onPress={() => void startDownload(model.id)}
              />
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(theme: MatriqTheme, colors: MatriqThemeColors) {
  return StyleSheet.create({
    content: {
      padding: theme.spacing.md,
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.md,
    },
    hero: {
      backgroundColor: colors.surface,
      borderRadius: theme.radii.lg,
      padding: theme.spacing.lg,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    heroIcon: {
      width: 52,
      height: 52,
      borderRadius: 999,
      backgroundColor: colors.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: theme.spacing.sm,
    },
    heroTitle: {
      fontFamily: theme.typography.h3.fontFamily,
      fontSize: theme.typography.h3.fontSize,
      lineHeight: theme.typography.h3.lineHeight,
      color: colors.textPrimary,
      textAlign: "center",
    },
    heroText: {
      fontFamily: theme.typography.caption.fontFamily,
      fontSize: theme.typography.caption.fontSize,
      lineHeight: theme.typography.caption.lineHeight,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: theme.spacing.xs,
    },
    toggleCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      backgroundColor: colors.surface,
      borderRadius: theme.radii.lg,
      padding: theme.spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    toggleTextWrap: { flex: 1 },
    toggleTitle: {
      fontFamily: theme.typography.bodyBold.fontFamily,
      fontSize: theme.typography.bodyBold.fontSize,
      color: colors.textPrimary,
    },
    toggleSub: {
      fontFamily: theme.typography.small.fontFamily,
      fontSize: theme.typography.small.fontSize,
      lineHeight: theme.typography.small.lineHeight,
      color: colors.textMuted,
      marginTop: theme.spacing.xs,
    },
    storageRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      paddingHorizontal: theme.spacing.xs,
    },
    storageText: {
      fontFamily: theme.typography.caption.fontFamily,
      fontSize: theme.typography.caption.fontSize,
      color: colors.textMuted,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
      justifyContent: "flex-start",
    },
    tierBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 999,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 3,
    },
    tierBadgeText: {
      fontFamily: theme.typography.small.fontFamily,
      fontSize: theme.typography.small.fontSize,
      color: colors.textSecondary,
    },
    recoBadge: { backgroundColor: colors.successBg },
    recoBadgeText: { color: colors.success },
    inUseBadge: { backgroundColor: colors.successBg },
    inUseText: { color: colors.success },
    noteCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: theme.spacing.sm,
      backgroundColor: colors.infoBg,
      borderRadius: theme.radii.md,
      padding: theme.spacing.md,
    },
    noteText: {
      fontFamily: theme.typography.caption.fontFamily,
      fontSize: theme.typography.caption.fontSize,
      lineHeight: theme.typography.caption.lineHeight,
      color: colors.textSecondary,
      flex: 1,
    },
    backLink: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing.xs,
      paddingVertical: theme.spacing.md,
    },
    backText: {
      fontFamily: theme.typography.captionBold.fontFamily,
      fontSize: theme.typography.captionBold.fontSize,
      color: colors.brand,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: "center",
      padding: theme.spacing.lg,
    },
    modalCard: {
      backgroundColor: colors.surface,
      borderRadius: theme.radii.xl,
      padding: theme.spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
      boxShadow:
        theme.mode === "pop"
          ? "4px 4px 0 rgba(23,11,38,0.25)"
          : "0 10px 40px rgba(0,0,0,0.45)",
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: theme.spacing.sm,
    },
    cardTitle: {
      fontFamily: theme.typography.h3.fontFamily,
      fontSize: theme.typography.h3.fontSize,
      lineHeight: theme.typography.h3.lineHeight,
      color: colors.textPrimary,
    },
    cardDesc: {
      fontFamily: theme.typography.caption.fontFamily,
      fontSize: theme.typography.caption.fontSize,
      lineHeight: theme.typography.caption.lineHeight,
      color: colors.textSecondary,
      marginTop: theme.spacing.sm,
    },
    specList: {
      gap: theme.spacing.sm,
      marginTop: theme.spacing.md,
      backgroundColor: colors.surfaceAlt,
      borderRadius: theme.radii.md,
      padding: theme.spacing.md,
    },
    specItem: { flexDirection: "row", alignItems: "center", gap: 8 },
    specText: {
      fontFamily: theme.typography.caption.fontFamily,
      fontSize: theme.typography.caption.fontSize,
      color: colors.textPrimary,
    },
    progressTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.border,
      overflow: "hidden",
    },
    progressFill: { height: "100%", borderRadius: 4, backgroundColor: colors.brand },
    downloadMeta: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    downloadText: {
      fontFamily: theme.typography.caption.fontFamily,
      fontSize: theme.typography.caption.fontSize,
      color: colors.textSecondary,
    },
    cancelText: {
      fontFamily: theme.typography.captionBold.fontFamily,
      fontSize: theme.typography.captionBold.fontSize,
      color: colors.brand,
    },
    errorRow: { flexDirection: "row", alignItems: "flex-start", gap: theme.spacing.xs },
    errorText: {
      fontFamily: theme.typography.caption.fontFamily,
      fontSize: theme.typography.caption.fontSize,
      lineHeight: theme.typography.caption.lineHeight,
      color: colors.error,
      flex: 1,
    },
    engineWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    engineText: {
      fontFamily: theme.typography.caption.fontFamily,
      fontSize: theme.typography.caption.fontSize,
      color: colors.textSecondary,
      flexShrink: 1,
    },
    deleteBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing.xs,
      paddingVertical: theme.spacing.sm,
    },
    deleteText: {
      fontFamily: theme.typography.captionBold.fontFamily,
      fontSize: theme.typography.captionBold.fontSize,
      color: colors.error,
    },
  });
}
