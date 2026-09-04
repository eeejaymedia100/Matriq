import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Modal,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardScreen } from "../../components/KeyboardScreen";
import { Surface } from "../../components/Surface";
import { GameBadge } from "../../components/GameBadge";
import { Icon } from "../../components/icons";
import { useAchievements } from "../../hooks/useAchievements";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  type BoardAchievement,
} from "../../utils/achievements";

const RARITY_LABEL: Record<string, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Epic",
};

/**
 * Achievement Board (UI direction §Achievement System). Earned, locked and
 * in-progress achievements grouped into meaningful categories; cards feel
 * collectible (game-quality badges) rather than CSS boxes. Tapping one opens
 * the detail view with how it was earned + a shareable achievement card
 * generated from the student's real data.
 */
export function AchievementsScreen() {
  const { theme } = useTheme();
  const colors = theme.colors;
  const { board, loading, refresh } = useAchievements();
  const [selected, setSelected] = useState<BoardAchievement | null>(null);

  const earnedCount = board?.earnedCount ?? 0;
  const total = board?.achievements.length ?? 0;

  return (
    <KeyboardScreen
      edges={["top", "left", "right"]}
      padding={0}
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 48 }}
    >
      {/* Header — the screen's one serif moment */}
      <Text style={[theme.typography.display, { color: colors.textPrimary }]}>
        Achievements
      </Text>
      <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 2 }]}>
        Earned from real study — nothing here is free.
      </Text>

      {/* Progress summary */}
      <Surface
        variant="sticker"
        style={{ padding: 16, marginTop: 16, flexDirection: "row", alignItems: "center", gap: 12 }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 13,
            backgroundColor: colors.surfaceAlt,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="trophy" size={21} color={colors.brand} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>
            {earnedCount} of {total} earned
          </Text>
          <View
            style={{
              marginTop: 7,
              height: 6,
              borderRadius: 3,
              backgroundColor: colors.surfaceAlt,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${total ? Math.round((earnedCount / total) * 100) : 0}%`,
                height: 6,
                borderRadius: 3,
                backgroundColor: colors.accent,
              }}
            />
          </View>
        </View>
        <Pressable onPress={() => void refresh()} hitSlop={8} accessibilityLabel="Refresh achievements">
          <Icon name="refresh" size={18} color={colors.textMuted} />
        </Pressable>
      </Surface>

      {loading && !board ? (
        <View style={{ alignItems: "center", paddingVertical: 60 }}>
          <ActivityIndicator color={colors.brand} />
          <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 10 }]}>
            Checking your achievements…
          </Text>
        </View>
      ) : !board ? (
        <View style={{ alignItems: "center", paddingVertical: 60 }}>
          <Text style={[theme.typography.caption, { color: colors.textMuted }]}>
            Couldn't load your achievements right now.
          </Text>
        </View>
      ) : (
        CATEGORY_ORDER.map((category) => {
          const items = board.achievements.filter(
            (a) => a.category === category,
          );
          if (items.length === 0) return null;
          const earnedInCategory = items.filter((a) => a.earned).length;
          return (
            <View key={category} style={{ marginTop: 26 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
                <Text style={[theme.typography.h3, { color: colors.textPrimary }]}>
                  {CATEGORY_META[category].label}
                </Text>
                <Text style={[theme.typography.small, { color: colors.textMuted }]}>
                  {earnedInCategory}/{items.length}
                </Text>
              </View>
              <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
                {CATEGORY_META[category].blurb}
              </Text>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
                {items.map((a) => (
                  <Pressable
                    key={a.id}
                    onPress={() => setSelected(a)}
                    style={{ width: "47%" }}
                    accessibilityRole="button"
                    accessibilityLabel={`${a.title}, ${a.earned ? "earned" : "locked"}`}
                  >
                    <Surface
                      style={{
                        padding: 14,
                        alignItems: "center",
                        marginBottom: 0,
                        opacity: a.earned ? 1 : 0.9,
                      }}
                    >
                      <GameBadge
                        rarity={a.rarity}
                        icon={a.icon as never}
                        earned={a.earned}
                        size="md"
                      />
                      <Text
                        numberOfLines={2}
                        style={[
                          theme.typography.captionBold,
                          {
                            color: a.earned ? colors.textPrimary : colors.textSecondary,
                            marginTop: 10,
                            textAlign: "center",
                            lineHeight: 17,
                          },
                        ]}
                      >
                        {a.title}
                      </Text>
                      <Text
                        style={[
                          theme.typography.small,
                          {
                            color: a.earned ? colors.textMuted : colors.textMuted,
                            marginTop: 3,
                            fontSize: 10,
                          },
                        ]}
                      >
                        {a.earned
                          ? `Earned${a.earnedAt ? ` · ${new Date(a.earnedAt).toLocaleDateString()}` : ""}`
                          : a.progress
                            ? `${a.progress.current} / ${a.progress.target}`
                            : "Locked"}
                      </Text>
                    </Surface>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })
      )}

      <AchievementDetailModal
        achievement={selected}
        onClose={() => setSelected(null)}
      />
    </KeyboardScreen>
  );
}

function AchievementDetailModal({
  achievement,
  onClose,
}: {
  achievement: BoardAchievement | null;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const shareRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const share = useCallback(async () => {
    if (!achievement || !shareRef.current) return;
    setSharing(true);
    setShareError(null);
    try {
      // Dynamic import keeps the native module out of the web bundle.
      const { captureRef } = await import("react-native-view-shot");
      const { shareAsync } = await import("expo-sharing");
      const uri = await captureRef(shareRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });
      await shareAsync(uri, {
        mimeType: "image/png",
        dialogTitle: "Share my achievement",
        UTI: "public.png",
      });
    } catch (err) {
      setShareError(
        err instanceof Error ? err.message : "Couldn't create the share image.",
      );
    } finally {
      setSharing(false);
    }
  }, [achievement]);

  if (!achievement) return null;
  const pct = achievement.progress
    ? Math.min(100, Math.round((achievement.progress.current / achievement.progress.target) * 100))
    : 0;

  return (
    <Modal
      visible={!!achievement}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable
        style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}
        onPress={onClose}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderWidth: 1,
            borderColor: colors.border,
            borderBottomWidth: 0,
            padding: 22,
            paddingBottom: 34,
          }}
        >
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: "82%" }}>
            {/* The shareable card — captured as the achievement image */}
            <View ref={shareRef} collapsable={false} style={{ alignItems: "center", paddingVertical: 8 }}>
              <GameBadge
                rarity={achievement.rarity}
                icon={achievement.icon as never}
                earned={achievement.earned}
                size="lg"
              />
              {/* One serif moment — the achievement name */}
              <Text
                style={[
                  theme.serif.editorial,
                  { color: colors.textPrimary, marginTop: 14, textAlign: "center" },
                ]}
              >
                {achievement.title}
              </Text>
              <Text
                style={[
                  theme.typography.caption,
                  {
                    color: colors.textSecondary,
                    marginTop: 6,
                    textAlign: "center",
                    lineHeight: 20,
                    maxWidth: 280,
                  },
                ]}
              >
                {achievement.body}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 12,
                  paddingVertical: 5,
                  paddingHorizontal: 10,
                  borderRadius: theme.radii.pill,
                  backgroundColor: colors.surfaceAlt,
                }}
              >
                <Text style={[theme.typography.small, { color: colors.textSecondary, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8 }]}>
                  {RARITY_LABEL[achievement.rarity]}
                </Text>
                <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.textMuted }} />
                <Text style={[theme.typography.small, { color: colors.textSecondary, fontSize: 10 }]}>
                  Matriq
                </Text>
              </View>
            </View>

            {/* How it was earned */}
            <View
              style={{
                marginTop: 14,
                padding: 14,
                borderRadius: theme.radii.md,
                backgroundColor: colors.surfaceAlt,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={[theme.typography.captionBold, { color: colors.textPrimary }]}>
                {achievement.earned ? "How you earned it" : "How to earn it"}
              </Text>
              <Text style={[theme.typography.caption, { color: colors.textSecondary, marginTop: 4, lineHeight: 19 }]}>
                {achievement.hint}
              </Text>
              {achievement.progress ? (
                <View style={{ marginTop: 10 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={[theme.typography.small, { color: colors.textMuted }]}>
                      Progress
                    </Text>
                    <Text style={[theme.typography.small, { color: colors.textMuted }]}>
                      {achievement.progress.current} / {achievement.progress.target}
                    </Text>
                  </View>
                  <View
                    style={{
                      marginTop: 5,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: colors.border,
                      overflow: "hidden",
                    }}
                  >
                    <View
                      style={{
                        width: `${pct}%`,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: achievement.earned ? colors.accent : colors.brand,
                      }}
                    />
                  </View>
                </View>
              ) : null}
              {achievement.earnedAt ? (
                <Text style={[theme.typography.small, { color: colors.textMuted, marginTop: 10 }]}>
                  Earned {new Date(achievement.earnedAt).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </Text>
              ) : null}
            </View>

            {/* Actions */}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable
                onPress={onClose}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 13,
                  borderRadius: theme.radii.md,
                  backgroundColor: colors.surfaceAlt,
                  borderWidth: 1,
                  borderColor: colors.borderStrong,
                }}
              >
                <Text style={[theme.typography.captionBold, { color: colors.textPrimary }]}>
                  Close
                </Text>
              </Pressable>
              {Platform.OS !== "web" ? (
                <Pressable
                  onPress={() => void share()}
                  disabled={sharing || !achievement.earned}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    paddingVertical: 13,
                    borderRadius: theme.radii.md,
                    backgroundColor: achievement.earned ? colors.accent : colors.surfaceAlt,
                    borderWidth: theme.mode === "pop" && achievement.earned ? 2 : 0,
                    borderColor: colors.borderStrong,
                    opacity: achievement.earned ? 1 : 0.5,
                  }}
                >
                  {sharing ? (
                    <ActivityIndicator size="small" color="#170B26" />
                  ) : (
                    <Text
                      style={{
                        fontFamily: "PlusJakartaSans_700Bold",
                        fontSize: 13,
                        color: achievement.earned ? "#170B26" : colors.textMuted,
                      }}
                    >
                      {achievement.earned ? "Share card" : "Earn it first"}
                    </Text>
                  )}
                </Pressable>
              ) : null}
            </View>
            {shareError ? (
              <Text style={[theme.typography.small, { color: colors.error, marginTop: 10, textAlign: "center" }]}>
                {shareError}
              </Text>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}