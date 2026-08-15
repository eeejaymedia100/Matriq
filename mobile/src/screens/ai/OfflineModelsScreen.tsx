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

function ModelCard({ model }: { model: OfflineModel }) {
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
            <Icon name="check" size={12} color={colors.success} />
            <Text style={[styles.tierBadgeText, styles.inUseText]}>In use</Text>
          </View>
        )}
      </View>

      <Text style={styles.cardTitle}>{model.name}</Text>
      <Text style={styles.cardDesc}>{model.description}</Text>

      <View style={styles.specRow}>
        <View style={styles.specItem}>
          <Icon name="download" size={14} color={colors.textMuted} />
          <Text style={styles.specText}>{formatBytes(model.sizeBytes)}</Text>
        </View>
        <View style={styles.specItem}>
          <Icon name="phone" size={14} color={colors.textMuted} />
          <Text style={styles.specText}>{model.ramNote}</Text>
        </View>
        <View style={styles.specItem}>
          <Icon name="zap" size={14} color={colors.textMuted} />
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
            <View style={styles.errorRow}>
              <Icon name="alert" size={14} color={colors.error} />
              <Text style={styles.errorText}>{download.error}</Text>
            </View>
          )}
        </View>
      ) : isDownloaded ? (
        <View style={styles.downloadedActions}>
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
  const { theme } = useTheme();
  const colors = theme.colors;
  const styles = makeStyles(theme, colors);

  const navigation = useNavigation<Nav>();
  const { models, freeSpace, preferOffline, setPreferOffline, refreshFreeSpace } =
    useOfflineAi();

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
            The AI model isn't included in the app — it's a separate download
            you control. Download once over Wi-Fi, and the AI Study Companion
            keeps answering questions even when there's no network at all. No
            data charges afterwards.
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

        {models.map((model) => (
          <ModelCard key={model.id} model={model} />
        ))}

        <View style={styles.noteCard}>
          <Icon name="info" size={18} color={colors.info} />
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
          <Icon name="arrowLeft" size={16} color={colors.brand} />
          <Text style={styles.backText}>Back to AI Study Companion</Text>
        </TouchableOpacity>
      </ScrollView>
    </ThemedScreen>
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
    card: {
      backgroundColor: colors.surface,
      borderRadius: theme.radii.lg,
      padding: theme.spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      gap: theme.spacing.sm,
    },
    cardRecommended: { borderColor: colors.brand },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
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
    inUseBadge: { backgroundColor: colors.successBg, marginLeft: "auto" },
    inUseText: { color: colors.success },
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
    },
    specRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.md },
    specItem: { flexDirection: "row", alignItems: "center", gap: 4 },
    specText: {
      fontFamily: theme.typography.small.fontFamily,
      fontSize: theme.typography.small.fontSize,
      color: colors.textMuted,
    },
    downloadWrap: { gap: theme.spacing.xs },
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
    errorRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: theme.spacing.xs,
    },
    errorText: {
      fontFamily: theme.typography.caption.fontFamily,
      fontSize: theme.typography.caption.fontSize,
      lineHeight: theme.typography.caption.lineHeight,
      color: colors.error,
      flex: 1,
    },
    downloadedActions: { gap: theme.spacing.sm },
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
  });
}
