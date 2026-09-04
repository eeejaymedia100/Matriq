import React, { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "../theme/ThemeContext";
import { Icon } from "./icons";
import { GameBadge } from "./GameBadge";
import type { StreakState } from "../utils/streak";

/** easeOutCubic — game-feel count-up pacing (fast start, gentle landing). */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Study-streak badge — game-style arrival, not a static chip (round-4 design
 * pass). Entrance is a REAL spring (overshoot + settle) driven on the UI
 * thread via reanimated — not CSS — with a frame-by-frame count-up numeral
 * and a gentle continuous flame flicker once it lands. Deliberately NO
 * streak levels/tiers: project framework round-3 gamification §1 reserves
 * levels for later and keeps one streak, one badge. Fully respects
 * prefers-reduced-motion: static, calm chip when the OS asks for it.
 */
export function StreakBadge({ streak }: { streak: StreakState }) {
  const { theme } = useTheme();
  const colors = theme.colors;

  const [reduceMotion, setReduceMotion] = useState(false);
  const [display, setDisplay] = useState(0);

  // Entrance: pill scales/rises in with spring overshoot.
  const entrance = useSharedValue(0);
  // Continuous idle flicker on the flame tile (the only "alive" element).
  const flicker = useSharedValue(1);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  const active = streak.current > 0;

  // Replay the entrance whenever the streak becomes active or grows — the
  // badge "pops" exactly when there's news to celebrate. The zero state
  // fades in once, calmly.
  useEffect(() => {
    if (reduceMotion) {
      entrance.value = 1;
      return;
    }
    entrance.value = 0;
    if (active) {
      entrance.value = withSpring(1, {
        damping: 10,
        stiffness: 220,
        mass: 0.65,
      });
    } else {
      entrance.value = withTiming(1, { duration: 320 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reduceMotion, streak.current]);

  // Count-up the numeral frame-by-frame (rAF — independent of the entrance).
  useEffect(() => {
    if (!active) {
      setDisplay(0);
      return;
    }
    if (reduceMotion) {
      setDisplay(streak.current);
      return;
    }
    const from = 0;
    const to = streak.current;
    const ms = 700;
    const t0 = performance.now();
    let raf: number;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      setDisplay(Math.round(from + (to - from) * easeOutCubic(p)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active, reduceMotion, streak.current]);

  useEffect(() => {
    if (!active || reduceMotion) return;
    flicker.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 650 }),
        withTiming(1, { duration: 650 }),
      ),
      -1,
      false,
    );
    return () => {
      flicker.value = 1;
    };
  }, [active, reduceMotion, flicker]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [
      { translateY: (1 - entrance.value) * 14 },
      { scale: entrance.value },
      { rotate: `${(1 - entrance.value) * -5}deg` },
    ],
  }));

  const flameStyle = useAnimatedStyle(() => ({
    transform: [{ scale: flicker.value }],
  }));

  const pillBase: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingRight: 14,
    borderRadius: theme.radii.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  };

  // No streak yet — a quiet nudge, still gently animated in.
  if (!active) {
    return (
      <Animated.View
        style={[pillBase, pillStyle, { paddingLeft: 6 }]}
        accessibilityRole="text"
        accessibilityLabel="Study today to start a streak"
      >
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 12,
            backgroundColor: colors.surfaceAlt,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="book" size={17} color={colors.textSecondary} />
        </View>
        <Text style={[theme.typography.caption, { color: colors.textSecondary }]}>
          Study today to start a streak
        </Text>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[pillBase, pillStyle, { paddingLeft: 6 }]}
      accessibilityRole="text"
      accessibilityLabel={`${streak.current}-day study streak${
        streak.best > streak.current ? `, best ${streak.best}` : ""
      }`}
    >
      {/* Metallic flame badge — game-style, layered (UI direction: the streak
          badge should be especially polished). The count-up numeral next to it
          stays the serif big-numeral moment. */}
      <Animated.View style={flameStyle}>
        <GameBadge rarity="rare" icon="flame" earned size="sm" />
      </Animated.View>

      {/* Count-up numeral + label */}
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
        {/* Serif big numeral — the streak count is a locked serif moment
            (round-4: display/h1/h2 + big numerals get Fraunces). */}
        <Text
          style={[
            theme.serif.numeral,
            { fontSize: 24, lineHeight: 26, color: colors.textPrimary },
          ]}
        >
          {display}
        </Text>
        <Text
          style={[
            theme.typography.captionBold,
            { color: colors.textPrimary },
          ]}
        >
          day streak
        </Text>
        {streak.best > streak.current ? (
          <Text style={[theme.typography.small, { color: colors.textMuted }]}>
            · best {streak.best}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}