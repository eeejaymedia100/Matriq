import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { MainStackParamList } from "../../navigation/types";
import { colors, spacing, typography, radii } from "../../theme/colors";
import { Button } from "../../components";
import { useOfflineAi } from "../../offline/OfflineAiContext";
import { formatBytes, type OfflineModel } from "../../offline/models";

type Nav = NativeStackNavigationProp<MainStackParamList, "OfflineModels">;

function ModelCard({ model }: { model: OfflineModel }) {
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
    <View style={[styles.card, model.recommended && styles.cardRecommended]}>
      <View style={styles.cardHeader}>
        <View style={styles.tierBadge}>
          <Text style={styles.tierBadgeText}>{model.tier}</Text>
        </View>
        {model.recommended && (
          <View style={[styles.tierBadge, styles.recoBadge]}>
            <Text style={[styles.tierBadgeText, styles.recoBadgeText]}>
              Recommended
            </Text>
          </View>
        )}
        {isActive && (
          <View style={[styles.tierBadge, styles.inUseBadge]}>
            <Ionicons name="checkmark-circle" size={12} color={colors.success} />
            <Text style={[styles.tierBadgeText, styles.inUseText]}>In use</Text>
          </View>
        )}
      </View>

      <Text style={styles.cardTitle}>{model.name}</Text>
      <Text style={styles.cardDesc}>{model.description}</Text>

      <View style={styles.specRow}>
        <View style={styles.specItem}>
          <Ionicons name="download-outline" size={14} color={colors.textMuted} />
          <Text style={styles.specText}>{formatBytes(model.sizeBytes)}</Text>
        </View>
        <View style={styles.specItem}>
          <Ionicons name="phone-portrait-outline" size={14} color={colors.textMuted} />
          <Text style={styles.specText}>{model.ramNote}</Text>
        </View>
        <View style={styles.specItem}>
          <Ionicons name="speedometer-outline" size={14} color={colors.textMuted} />
          <Text style={styles.specText}>{model.speedNote}</Text>
        </View>
      </View>

      {download ? (
        <View style={styles.downloadWrap}>
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
              Downloading… {Math.round(download.progress * 100)}%
            </Text>
            <TouchableOpacity onPress={() => void cancelDownload(model.id)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
          {download.error && (
            <Text style={styles.errorText}>{download.error}</Text>
          )}
        </View>
      ) : isDownloaded ? (
        <View style={styles.downloadedActions}>
          {isActive ? (
            <View style={styles.engineWrap}>
              {engineState === "loading" && (
                <>
                  <ActivityIndicator size="small" color={colors.primary} />
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
              title={`Use this model`}
              size="md"
              variant={model.recommended ? "primary" : "outline"}
              onPress={() => void selectModel(model.id)}
            />
          )}
          <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
            <Ionicons name="trash-outline" size={16} color={colors.error} />
            <Text style={styles.deleteText}>Delete</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Button
          title={`Download (${formatBytes(model.sizeBytes)})`}
          size="md"
          variant={model.recommended ? "primary" : "outline"}
          loading={false}
          onPress={() => void startDownload(model.id)}
        />
      )}
    </View>
  );
}

export function OfflineModelsScreen() {
  const navigation = useNavigation<Nav>();
  const { models, freeSpace, preferOffline, setPreferOffline, refreshFreeSpace } =
    useOfflineAi();

  useEffect(() => {
    void refreshFreeSpace();
  }, [refreshFreeSpace]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="cloud-offline-outline" size={26} color={colors.primary} />
        </View>
        <Text style={styles.heroTitle}>AI that works with no internet</Text>
        <Text style={styles.heroText}>
          The AI model isn't included in the app — it's a separate download you
          control. Download once over Wi-Fi, and the AI Study Companion keeps
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
          trackColor={{ true: colors.primaryLight, false: colors.border }}
          thumbColor={preferOffline ? colors.primary : colors.surface}
        />
      </View>

      <View style={styles.storageRow}>
        <Ionicons name="server-outline" size={16} color={colors.textMuted} />
        <Text style={styles.storageText}>
          {freeSpace !== null
            ? `Free storage: ${formatBytes(freeSpace)}`
            : "Checking free storage…"}
        </Text>
      </View>

      {models.map((model) => (
        <ModelCard key={model.id} model={model} />
      ))}

      <View style={styles.noteCard}>
        <Ionicons name="information-circle-outline" size={18} color={colors.info} />
        <Text style={styles.noteText}>
          Bigger models give better answers but use more storage and battery.
          Start with the recommended model — you can switch or delete models
          anytime.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.backLink}
        onPress={() => navigation.goBack()}
      >
        <Ionicons name="arrow-back" size={16} color={colors.primary} />
        <Text style={styles.backText}>Back to AI Study Companion</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
  hero: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  heroTitle: { ...typography.h3, color: colors.textPrimary, textAlign: "center" },
  heroText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  toggleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleTextWrap: { flex: 1 },
  toggleTitle: { ...typography.bodyBold, color: colors.textPrimary },
  toggleSub: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: spacing.xs,
    lineHeight: 16,
  },
  storageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  storageText: { ...typography.caption, color: colors.textMuted },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardRecommended: { borderColor: colors.primaryLight },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  tierBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  tierBadgeText: { ...typography.small, color: colors.textSecondary },
  recoBadge: { backgroundColor: colors.successBg },
  recoBadgeText: { color: colors.success },
  inUseBadge: { backgroundColor: colors.successBg, marginLeft: "auto" },
  inUseText: { color: colors.success },
  cardTitle: { ...typography.h3, color: colors.textPrimary },
  cardDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  specRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  specItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  specText: { ...typography.small, color: colors.textMuted },
  downloadWrap: { gap: spacing.xs },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 4, backgroundColor: colors.primary },
  downloadMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  downloadText: { ...typography.caption, color: colors.textSecondary },
  cancelText: { ...typography.captionBold, color: colors.primary },
  errorText: { ...typography.caption, color: colors.error, lineHeight: 18 },
  downloadedActions: { gap: spacing.sm },
  engineWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  engineText: { ...typography.caption, color: colors.textSecondary, flexShrink: 1 },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  deleteText: { ...typography.captionBold, color: colors.error },
  noteCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.infoBg,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  noteText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  backText: { ...typography.captionBold, color: colors.primary },
});
