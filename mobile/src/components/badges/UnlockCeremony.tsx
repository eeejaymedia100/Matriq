import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Modal,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../theme/ThemeContext";
import { brand } from "../../theme/tokens";
import { GameBadge } from "../GameBadge";
import { ParticleField } from "./ParticleField";
import { ceremonyLineFor, particleThemeFor } from "../../utils/badgeDesign";
import type { PendingCelebration } from "../../utils/badgeDesign";
import type { AchievementRarity } from "../../utils/achievements";

const RARITY_LABEL: Record<AchievementRarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Epic",
};

/** Stable PRNG seed per badge — the same badge always bursts the same way. */
function hashSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h || 1;
}

/**
 * UnlockCeremony — the Skia evolution of the old confetti overlay.
 *
 * Apple-style reward moment: the card springs in (small overshoot, slight
 * rotate settle), the badge lands with haptic punctuation, and a
 * rarity-tuned particle burst (Skia, UI-thread) blooms behind it. Copy is
 * calm and personal, never arcade-loud.
 *
 * Gesture-first, per the product direction:
 *   tap                → advance to the next unlock (or finish)
 *   swipe up           → advance (momentum feel)
 *   swipe down / back  → dismiss everything
 *
 * Fully accessible: reduce-motion renders a static card (no particles, no
 * springs), and each unlock is announced to screen readers.
 */
export function UnlockCeremony({
  queue,
  onDone,
}: {
  queue: PendingCelebration[];
  onDone: () => void;
}) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const { width, height } = useWindowDimensions();

  const [index, setIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  const entrance = useSharedValue(0);
  const glow = useSharedValue(0);
  const translateY = useSharedValue(0);
  const panOpacity = useSharedValue(1);
  const transitioning = useRef(false);

  const total = queue.length;
  const item = queue[Math.min(index, Math.max(0, total - 1))];
  const isLast = index >= total - 1;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  const finishAll = useCallback(() => {
    onDone();
  }, [onDone]);

  const commitAdvance = useCallback(() => {
    transitioning.current = false;
    if (index >= total - 1) {
      finishAll();
      return;
    }
    setIndex((i) => i + 1);
  }, [index, total, finishAll]);

  const advance = useCallback(() => {
    if (transitioning.current) return;
    transitioning.current = true;
    if (reduceMotion) {
      commitAdvance();
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    entrance.value = withTiming(
      0,
      { duration: 150, easing: Easing.in(Easing.quad) },
      (finished) => {
        if (finished) runOnJS(commitAdvance)();
      },
    );
  }, [reduceMotion, commitAdvance, entrance]);

  const dismissAll = useCallback(() => {
    if (transitioning.current) return;
    transitioning.current = true;
    if (reduceMotion) {
      finishAll();
      return;
    }
    translateY.value = withTiming(300, { duration: 230, easing: Easing.in(Easing.quad) });
    panOpacity.value = withTiming(0, { duration: 230 }, (finished) => {
      if (finished) runOnJS(finishAll)();
    });
  }, [reduceMotion, finishAll, translateY, panOpacity]);

  // Per-badge entrance sequence: spring in, then haptic punctuation as the
  // badge "lands" (~260ms in). Re-runs per index via key'd remount below.
  useEffect(() => {
    if (!item) return;
    transitioning.current = false;
    AccessibilityInfo.announceForAccessibility(
      `Badge unlocked: ${item.title}. ${item.body}`,
    );
    if (reduceMotion) {
      entrance.value = 1;
      glow.value = 1;
      return;
    }
    entrance.value = withSpring(1, { damping: 12.5, stiffness: 190, mass: 0.7 });
    glow.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.quad) });
    const haptic = setTimeout(() => {
      if (item.rarity === "epic" || item.rarity === "rare") {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    }, 260);
    return () => clearTimeout(haptic);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, reduceMotion]);

  // ── Gestures ──────────────────────────────────────────────
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-14, 14])
        .failOffsetX([-28, 28])
        .onUpdate((e) => {
          translateY.value = e.translationY;
          panOpacity.value = 1 - Math.min(0.45, Math.abs(e.translationY) / 620);
        })
        .onEnd((e) => {
          const dismiss = e.translationY > 72 || e.velocityY > 650;
          const next = e.translationY < -48 || e.velocityY < -520;
          if (dismiss) {
            runOnJS(dismissAll)();
          } else if (next) {
            translateY.value = withTiming(0, { duration: 150 });
            panOpacity.value = withTiming(1, { duration: 150 });
            runOnJS(advance)();
          } else {
            translateY.value = withSpring(0, { damping: 17, stiffness: 240 });
            panOpacity.value = withSpring(1, { damping: 17, stiffness: 240 });
          }
        }),
    [dismissAll, advance, translateY, panOpacity],
  );

  const tap = useMemo(
    () =>
      Gesture.Tap().onEnd((_e, success) => {
        if (success) runOnJS(advance)();
      }),
    [advance],
  );

  const gesture = useMemo(() => Gesture.Simultaneous(pan, tap), [pan, tap]);

  // Hooks below must run unconditionally — render-guard happens last.
  const cardStyle = useAnimatedStyle(() => ({
    opacity: panOpacity.value * (0.25 + 0.75 * entrance.value),
    transform: [
      {
        translateY: translateY.value + (1 - entrance.value) * 36,
      },
      { scale: 0.84 + 0.16 * entrance.value },
      { rotate: `${(1 - entrance.value) * -4}deg` },
    ],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: glow.value * 0.96,
  }));

  const badgePop = useAnimatedStyle(() => ({
    transform: [{ scale: 0.6 + 0.4 * entrance.value }],
  }));

  if (!item) return null;

  const themeParticles = particleThemeFor(item.rarity);
  const glass = theme.mode === "glass";
  const pop = theme.mode === "pop";

  const earned = item.earnedAt
    ? new Date(item.earnedAt).toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <Modal
      transparent
      visible
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={dismissAll}
    >
      {/* RNGH requires its own root view inside a Modal on Android. */}
      <GestureHandlerRootView style={styles.flex}>
        {/* Particle burst sits BEHIND the card — Skia, UI-thread, rarity-tuned. */}
        {!reduceMotion ? (
          <ParticleField
            key={`fx-${item.id}`}
            theme={themeParticles}
            origin={{ x: width / 2, y: height / 2 - 74 }}
            seed={hashSeed(item.id)}
            originRadius={66}
            width={width}
            height={height}
            onDone={() => {}}
          />
        ) : null}
        <GestureDetector gesture={gesture}>
          <Animated.View style={[styles.flex, styles.center, backdropStyle]}>
            <Animated.View
              style={[
                styles.card,
                {
                  backgroundColor: glass ? "rgba(24,12,44,0.97)" : colors.surface,
                  borderColor: colors.border,
                  ...(pop
                    ? { borderWidth: 2, borderColor: brand.ink, boxShadow: "5px 5px 0 #170B26" }
                    : { borderWidth: 1 }),
                },
                cardStyle,
              ]}
            >
              <Animated.View style={badgePop}>
                <GameBadge
                  rarity={item.rarity}
                  icon={item.icon as never}
                  earned
                  size="lg"
                />
              </Animated.View>

              <Text
                style={[
                  theme.typography.captionBold,
                  styles.eyebrow,
                  { color: colors.accent },
                ]}
              >
                {total > 1 ? `Badge ${index + 1} of ${total} unlocked` : "Badge unlocked"}
              </Text>

              <Text style={[theme.serif.editorial, styles.title, { color: colors.textPrimary }]}>
                {item.title}
              </Text>

              <Text style={[theme.typography.body, styles.body, { color: colors.textSecondary }]}>
                {item.body}
              </Text>

              <Text style={[theme.typography.small, styles.line, { color: colors.textMuted }]}>
                {ceremonyLineFor(item.rarity, item.id)}
              </Text>

              <View
                style={[
                  styles.chip,
                  { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
                ]}
              >
                <Text
                  style={[
                    theme.typography.small,
                    { color: colors.textSecondary, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8 },
                  ]}
                >
                  {RARITY_LABEL[item.rarity]}
                </Text>
                {earned ? (
                  <>
                    <View style={[styles.dotSep, { backgroundColor: colors.textMuted }]} />
                    <Text style={[theme.typography.small, { color: colors.textSecondary, fontSize: 10 }]}>
                      {earned}
                    </Text>
                  </>
                ) : null}
              </View>

              {total > 1 ? (
                <View style={styles.dots}>
                  {queue.map((q, i) => (
                    <View
                      key={q.id}
                      style={[
                        styles.dot,
                        {
                          backgroundColor: i === index ? colors.accent : colors.border,
                          width: i === index ? 18 : 6,
                        },
                      ]}
                    />
                  ))}
                </View>
              ) : null}

              <Text style={[theme.typography.caption, styles.hint, { color: colors.textMuted }]}>
                Tap to {isLast ? "finish" : "continue"} · swipe down to close
              </Text>
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 28,
    paddingVertical: 30,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  eyebrow: {
    marginTop: 18,
    letterSpacing: 2,
    textTransform: "uppercase",
    fontSize: 11,
  },
  title: {
    marginTop: 10,
    fontSize: 26,
    lineHeight: 32,
    textAlign: "center",
  },
  body: {
    marginTop: 10,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 290,
  },
  line: {
    marginTop: 12,
    textAlign: "center",
  },
  chip: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
  },
  dotSep: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 16,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  hint: {
    marginTop: 18,
    fontSize: 11,
  },
});
