import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  View,
  Text,
  ScrollView,
  Pressable,
  Modal,
  ActivityIndicator,
  Platform,
} from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardScreen } from "../../components/KeyboardScreen";
import { Surface } from "../../components/Surface";
import { PressableScale } from "../../components/PressableScale";
import { GameBadge } from "../../components/GameBadge";
import { Icon } from "../../components/icons";
import { useAchievements } from "../../hooks/AchievementsProvider";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  type BoardAchievement,
} from "../../utils/achievements";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const RARITY_LABEL: Record<string, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Epic",
};

function progressPct(a: BoardAchievement): number {
  if (!a.progress || a.progress.target <= 0) return 0;
  return Math.min(100, Math.round((a.progress.current / a.progress.target) * 100));
}

/**
 * Achievement Board — built like a trophy room, not a settings page.
 *
 * Hierarchy:
 *  1. Hero count + progress rail (the scoreboard).
 *  2. "Next up" — the badge closest to unlocking (goal gradient: always a
 *     visible next step).
 *  3. The board, per category. Earned badges sit in proper cases (lime
 *     hairline, stronger for rare/epic); locked badges are borderless ghosts
 *     on the background. Earning one visibly promotes it out of the void and
 *     into a case — that promotion IS the reward loop.
 */
export function AchievementsScreen() {
  const { theme } = useTheme();
  const colors = theme.colors;
  const { board, loading, refresh } = useAchievements();
  const [selected, setSelected] = useState<BoardAchievement | null>(null);

  const achievements = board?.achievements ?? [];
  const earnedCount = board?.earnedCount ?? 0;
  const total = achievements.length;

  // Closest to unlocking: earned items excluded, then highest progress.
  const nextUp = useMemo(() => {
    const locked = achievements.filter((a) => !a.earned);
    if (locked.length === 0) return null;
    return (
      [...locked]
        .sort((a, b) => progressPct(b) - progressPct(a))
        .find((a) => progressPct(a) > 0) ?? locked[0]
    );
  }, [achievements]);

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

      {/* Scoreboard — big count, slim rail, refresh */}
      <View style={{ marginTop: 18 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
          <Text
            style={{
              fontFamily: theme.typography.bodyBold.fontFamily,
              fontWeight: "800",
              fontSize: 34,
              lineHeight: 38,
              color: colors.textPrimary,
            }}
          >
            {earnedCount}
          </Text>
          <Text
            style={[
              theme.typography.body,
              { color: colors.textMuted, marginLeft: 7, marginBottom: 3 },
            ]}
          >
            of {total} earned
          </Text>
          <View style={{ flex: 1 }} />
          <PressableScale
            onPress={() => void refresh()}
            hitSlop={8}
            accessibilityLabel="Refresh achievements"
            style={{ padding: 6, marginBottom: 2 }}
          >
            <Icon name="refresh" size={18} color={colors.textMuted} />
          </PressableScale>
        </View>
        <View
          style={{
            marginTop: 10,
            height: 5,
            borderRadius: 3,
            backgroundColor: colors.surfaceAlt,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              width: `${total ? Math.round((earnedCount / total) * 100) : 0}%`,
              height: 5,
              borderRadius: 3,
              backgroundColor: colors.accent,
            }}
          />
        </View>
      </View>

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
        <>
          {/* Next up — the one closest to unlocking */}
          {nextUp ? (
            <PressableScale
              onPress={() => setSelected(nextUp)}
              accessibilityRole="button"
              accessibilityLabel={`Next up: ${nextUp.title}, ${progressPct(nextUp)} percent`}
              style={{ marginTop: 18 }}
            >
              <Surface style={{ padding: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 13 }}>
                  <GameBadge
                    rarity={nextUp.rarity}
                    icon={nextUp.icon as never}
                    earned={false}
                    size="sm"
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      numberOfLines={1}
                      style={[
                        theme.typography.small,
                        {
                          color: colors.accentText,
                          textTransform: "uppercase",
                          letterSpacing: 1,
                          fontSize: 10,
                        },
                      ]}
                    >
                      Next up
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        theme.typography.captionBold,
                        { color: colors.textPrimary, marginTop: 2 },
                      ]}
                    >
                      {nextUp.title}
                    </Text>
                    {nextUp.progress ? (
                      <>
                        <View
                          style={{
                            marginTop: 8,
                            height: 5,
                            borderRadius: 3,
                            backgroundColor: colors.surfaceAlt,
                            overflow: "hidden",
                          }}
                        >
                          <View
                            style={{
                              width: `${progressPct(nextUp)}%`,
                              height: 5,
                              borderRadius: 3,
                              backgroundColor: colors.accent,
                            }}
                          />
                        </View>
                        <Text
                          style={[theme.typography.small, { color: colors.textMuted, marginTop: 5 }]}
                        >
                          {nextUp.progress.current} / {nextUp.progress.target}
                        </Text>
                      </>
                    ) : null}
                  </View>
                  <Icon name="chevronRight" size={16} color={colors.textMuted} />
                </View>
              </Surface>
            </PressableScale>
          ) : null}

          {/* The board */}
          {CATEGORY_ORDER.map((category) => {
            const items = achievements.filter((a) => a.category === category);
            if (items.length === 0) return null;
            const earnedInCategory = items.filter((a) => a.earned).length;
            return (
              <View key={category} style={{ marginTop: 28 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={[theme.typography.h3, { color: colors.textPrimary }]}>
                    {CATEGORY_META[category].label}
                  </Text>
                  <Text style={[theme.typography.small, { color: colors.textMuted }]}>
                    {earnedInCategory}/{items.length}
                  </Text>
                </View>

                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 14 }}>
                  {items.map((a) =>
                    a.earned ? (
                      <EarnedCase key={a.id} achievement={a} onPress={() => setSelected(a)} />
                    ) : (
                      <LockedGhost key={a.id} achievement={a} onPress={() => setSelected(a)} />
                    ),
                  )}
                </View>
              </View>
            );
          })}
        </>
      )}

      <AchievementDetailModal
        achievement={selected}
        items={achievements.filter((a) => a.earned)}
        onSelect={setSelected}
        onClose={() => setSelected(null)}
      />
    </KeyboardScreen>
  );
}

/** Earned badge in its case — lime hairline, stronger for rare/epic. */
function EarnedCase({
  achievement,
  onPress,
}: {
  achievement: BoardAchievement;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const showcase = achievement.rarity === "epic" || achievement.rarity === "rare";

  return (
    <PressableScale
      onPress={onPress}
      style={{ width: "47%" }}
      accessibilityRole="button"
      accessibilityLabel={`${achievement.title}, earned`}
    >
      <Surface
        style={{
          padding: 14,
          alignItems: "center",
          marginBottom: 0,
          borderColor: showcase ? colors.accent : `${colors.accent}45`,
          borderWidth: 1,
        }}
      >
        <GameBadge
          rarity={achievement.rarity}
          icon={achievement.icon as never}
          earned={true}
          size="md"
        />
        <Text
          numberOfLines={2}
          ellipsizeMode="tail"
          style={[
            theme.typography.captionBold,
            {
              color: colors.textPrimary,
              marginTop: 10,
              textAlign: "center",
              lineHeight: 17,
            },
          ]}
        >
          {achievement.title}
        </Text>
        <Text
          numberOfLines={1}
          style={[theme.typography.small, { color: colors.textMuted, marginTop: 3, fontSize: 10 }]}
        >
          {achievement.earnedAt
            ? new Date(achievement.earnedAt).toLocaleDateString()
            : RARITY_LABEL[achievement.rarity]}
        </Text>
      </Surface>
    </PressableScale>
  );
}

/** Locked badge — a ghost on the background, no box. Earning it promotes it
 *  into a case; the visual jump between the two states is the point. */
function LockedGhost({
  achievement,
  onPress,
}: {
  achievement: BoardAchievement;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const colors = theme.colors;

  return (
    <PressableScale
      onPress={onPress}
      style={{ width: "47%" }}
      accessibilityRole="button"
      accessibilityLabel={`${achievement.title}, locked`}
    >
      <View style={{ alignItems: "center", paddingVertical: 14, paddingHorizontal: 14 }}>
        <GameBadge
          rarity={achievement.rarity}
          icon={achievement.icon as never}
          earned={false}
          size="md"
        />
        <Text
          numberOfLines={2}
          ellipsizeMode="tail"
          style={[
            theme.typography.captionBold,
            {
              color: colors.textSecondary,
              marginTop: 10,
              textAlign: "center",
              lineHeight: 17,
            },
          ]}
        >
          {achievement.title}
        </Text>
        <Text
          numberOfLines={1}
          style={[theme.typography.small, { color: colors.textMuted, marginTop: 3, fontSize: 10 }]}
        >
          {achievement.progress
            ? `${achievement.progress.current} / ${achievement.progress.target}`
            : "Locked"}
        </Text>
      </View>
    </PressableScale>
  );
}

function AchievementDetailModal({
  achievement,
  items,
  onSelect,
  onClose,
}: {
  achievement: BoardAchievement | null;
  /** Earned badges, in story order — horizontal swipe navigates these. */
  items: BoardAchievement[];
  onSelect: (a: BoardAchievement) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const shareRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  // Drag-to-dismiss from the grabber strip only — vertical drags here never
  // fight the content ScrollView. The whole sheet follows the finger and
  // springs back or dismisses based on distance + velocity.
  const translateY = useSharedValue(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  // Reset between opens — a previous dismissal must not leave the sheet
  // translated for the next achievement.
  useEffect(() => {
    translateY.value = 0;
  }, [achievement, translateY]);

  const drag = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([12, 12])
        .failOffsetX([-24, 24])
        .onUpdate((e) => {
          if (!reduceMotion) translateY.value = Math.max(0, e.translationY);
        })
        .onEnd((e) => {
          const far = e.translationY > 110 || e.velocityY > 800;
          if (far) {
            if (reduceMotion) {
              runOnJS(onClose)();
            } else {
              translateY.value = withTiming(360, { duration: 220 }, (finished) => {
                if (finished) runOnJS(onClose)();
              });
            }
          } else {
            translateY.value = withSpring(0, { damping: 17, stiffness: 240 });
          }
        }),
    [onClose, reduceMotion, translateY],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Horizontal story-swipe: move between earned badges. Attached to the
  // badge card (not the scroller) and fails on vertical drags so scrolling
  // is never hijacked. Edge resistance at either end of the story.
  const index = items.findIndex((i) => i.id === achievement?.id);
  const translateX = useSharedValue(0);
  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-18, 18])
        .failOffsetY([-22, 22])
        .onUpdate((e) => {
          const atStart = index <= 0;
          const atEnd = index >= items.length - 1;
          if ((atStart && e.translationX > 0) || (atEnd && e.translationX < 0)) return;
          translateX.value = e.translationX * 0.85;
        })
        .onEnd((e) => {
          const back = e.translationX > 64 || e.velocityX > 480;
          const fwd = e.translationX < -64 || e.velocityX < -480;
          translateX.value = withSpring(0, { damping: 18, stiffness: 260 });
          if (!back && !fwd) return;
          const nextIdx = fwd ? index + 1 : index - 1;
          if (nextIdx < 0 || nextIdx >= items.length) return;
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          runOnJS(onSelect)(items[nextIdx]);
        }),
    [index, items, onSelect, translateX],
  );
  const swipeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const share = async () => {
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
  };

  if (!achievement) return null;
  const pct = progressPct(achievement);

  return (
    <Modal
      visible={!!achievement}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      {/* RNGH requires its own root view inside a Modal on Android. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
      <Pressable
        style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}
        onPress={onClose}
      >
        <Animated.View style={sheetStyle}>
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
          {/* Grabber — drag down to dismiss (the gesture lives only here). */}
          <GestureDetector gesture={drag}>
            <View
              style={{ alignItems: "center", paddingTop: 2, paddingBottom: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Drag down to close"
            >
              <View
                style={{
                  width: 38,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: colors.borderStrong,
                }}
              />
            </View>
          </GestureDetector>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: "82%" }}>
            {/* The shareable card — captured as the achievement image.
                Horizontal swipe navigates between earned badges. */}
            <GestureDetector gesture={swipe}>
            <Animated.View ref={shareRef} collapsable={false} style={[swipeStyle, { alignItems: "center", paddingVertical: 8 }]}>
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
            </Animated.View>
            </GestureDetector>

            {/* Story dots — position in the earned-badge story. */}
            {items.length > 1 ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 10 }}>
                {items.map((it, i) => (
                  <View
                    key={it.id}
                    style={{
                      width: i === index ? 16 : 5,
                      height: 5,
                      borderRadius: 3,
                      backgroundColor: i === index ? colors.accent : colors.border,
                    }}
                  />
                ))}
              </View>
            ) : null}

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
                    <ActivityIndicator size="small" color="#17181A" />
                  ) : (
                    <Text
                      style={{
                        fontFamily: theme.typography.bodyBold.fontFamily,
                        fontSize: 13,
                        color: achievement.earned ? "#17181A" : colors.textMuted,
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
        </Animated.View>
      </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}
