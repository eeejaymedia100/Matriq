import React, { useEffect, useMemo, useRef } from "react";
import { View, Text, Pressable, StyleSheet, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withDelay,
  withRepeat,
  Easing,
} from "react-native-reanimated";
import { useTheme } from "../theme/ThemeContext";
import { Icon, type IconName } from "./icons";
import { brand } from "../theme/tokens";

/**
 * Reusable badge-unlock celebration (spec §11) — a particle burst + a
 * bounce-in badge reveal, so every future badge can reuse the same moment.
 * Pure reanimated: no confetti dependency needed, works on Android + web.
 */
export interface CelebrationBadge {
  title: string;
  body: string;
  icon: IconName;
}

const CONFETTI_COLORS = [brand.lime500, brand.purple500, "#FF6BB3", brand.lime400, "#8FBCFF"];

interface Particle {
  id: number;
  color: string;
  left: number; // %
  size: number;
  delay: number;
  duration: number;
  rotate: number;
}

function makeParticles(n: number): Particle[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    left: (i / n) * 100 + Math.random() * 6 - 3,
    size: 6 + Math.random() * 8,
    delay: Math.random() * 600,
    duration: 1800 + Math.random() * 1400,
    rotate: Math.random() * 360,
  }));
}

export function CelebrationOverlay({
  visible,
  badge,
  onClose,
}: {
  visible: boolean;
  badge: CelebrationBadge;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const colors = theme.colors;

  const particles = useMemo(() => makeParticles(44), [visible]);
  const autoClose = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) return;
    autoClose.current = setTimeout(() => onClose(), 4200);
    return () => {
      if (autoClose.current) clearTimeout(autoClose.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.backdrop]}>
      {/* Falling confetti */}
      {particles.map((p) => (
        <Confetti key={p.id} particle={p} />
      ))}

      {/* Badge reveal */}
      <Pressable style={styles.center} onPress={onClose}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.mode === "glass" ? "rgba(30,12,48,0.96)" : colors.surface,
              borderColor: colors.border,
              ...(theme.mode === "pop"
                ? { borderWidth: 2, borderColor: brand.ink, boxShadow: "5px 5px 0 #170B26" }
                : { borderWidth: 1 }),
            },
          ]}
        >
          <View
            style={{
              width: 76,
              height: 76,
              borderRadius: 24,
              backgroundColor: colors.accent,
              alignItems: "center",
              justifyContent: "center",
              transform: [{ rotate: "-4deg" }],
              marginBottom: 18,
            }}
          >
            <Icon name={badge.icon} size={36} color="#170B26" strokeWidth={1.8} />
          </View>
          <Text style={[theme.typography.captionBold, { color: colors.accent, letterSpacing: 2, textTransform: "uppercase" }]}>
            Badge unlocked
          </Text>
          <Text style={[theme.typography.h2, { color: colors.textPrimary, textAlign: "center", marginTop: 8 }]}>
            {badge.title}
          </Text>
          <Text
            style={[
              theme.typography.body,
              { color: colors.textSecondary, textAlign: "center", marginTop: 8, lineHeight: 23, maxWidth: 300 },
            ]}
          >
            {badge.body}
          </Text>
          <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 20 }]}>Tap anywhere</Text>
        </View>
      </Pressable>
    </View>
  );
}

function Confetti({ particle }: { particle: Particle }) {
  // Pixel-based fall (reanimated transforms are numeric); 1000px covers any
  // portrait screen from the top of the overlay.
  const fall = useSharedValue(-60);
  const spin = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    fall.value = withDelay(
      particle.delay,
      withTiming(1000, {
        duration: particle.duration,
        easing: Easing.in(Easing.quad),
      }),
    );
    spin.value = withDelay(
      particle.delay,
      withRepeat(withTiming(720, { duration: particle.duration }), -1, false),
    );
    opacity.value = withDelay(
      particle.delay + particle.duration * 0.7,
      withTiming(0, { duration: particle.duration * 0.3 }),
    );
  }, [fall, spin, opacity, particle]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: fall.value },
      { rotate: `${spin.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.particle,
        {
          left: `${particle.left}%` as ViewStyle["left"],
          width: particle.size,
          height: particle.size * 1.6,
          backgroundColor: particle.color,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(13,6,32,0.6)",
    zIndex: 1000,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    borderRadius: 28,
    padding: 30,
    alignItems: "center",
    width: "100%",
    maxWidth: 340,
  },
  particle: {
    position: "absolute",
    top: 0,
    borderRadius: 3,
  },
});
