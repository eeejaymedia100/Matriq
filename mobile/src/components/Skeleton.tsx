import React, { useEffect, useState } from "react";
import {
  View,
  Animated,
  StyleSheet,
  type ViewStyle,
  AccessibilityInfo,
} from "react-native";
import { useTheme } from "../theme/ThemeContext";

// ── Skeleton loading primitives ─────────────────────────────────────────────
// YouTube-style: pulsing neutral blocks that mirror the shape of real content,
// so the UI never feels empty while data loads (especially on slow networks).
// Theme-aware: block colour follows the active theme's border token.

interface SkeletonProps {
  width?: number | `${number}%` | "auto";
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

const BASE_OPACITY = 0.4;
const PEAK_OPACITY = 0.9;
const PULSE_MS = 750;

// ── Shared pulse engine ────────────────────────────────────────────────────
// All skeleton blocks share ONE Animated.Value and ONE native animation loop,
// so a screen full of skeletons costs a single native animation (important on
// low-end devices), and every block provably pulses in unison.
const sharedOpacity = new Animated.Value(BASE_OPACITY);
let loop: Animated.CompositeAnimation | null = null;
let activeBlocks = 0;

function startPulse() {
  if (loop) return;
  loop = Animated.loop(
    Animated.sequence([
      Animated.timing(sharedOpacity, {
        toValue: PEAK_OPACITY,
        duration: PULSE_MS,
        useNativeDriver: true,
      }),
      Animated.timing(sharedOpacity, {
        toValue: BASE_OPACITY,
        duration: PULSE_MS,
        useNativeDriver: true,
      }),
    ]),
  );
  loop.start();
}

function stopPulse() {
  loop?.stop();
  loop = null;
  sharedOpacity.setValue(BASE_OPACITY);
}

/**
 * A single pulsing placeholder block. All blocks share the same timing so a
 * screen of skeletons pulses in unison, like YouTube's loading state.
 * Respects the OS "reduce motion" setting (pulses become static blocks).
 */
export function Skeleton({
  width = "100%",
  height = 16,
  borderRadius,
  style,
}: SkeletonProps) {
  const { theme } = useTheme();
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  // Ref-count active blocks: start the shared pulse while any skeleton is on
  // screen, stop it when the last one unmounts (no wasted work in idle tabs).
  useEffect(() => {
    activeBlocks += 1;
    if (!reduceMotion) startPulse();
    return () => {
      activeBlocks -= 1;
      if (activeBlocks === 0) stopPulse();
    };
  }, [reduceMotion]);

  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          height,
          borderRadius: borderRadius ?? theme.radii.sm,
          backgroundColor: theme.colors.border,
          opacity: sharedOpacity,
        },
        style,
      ]}
    />
  );
}

/** A circular placeholder (avatars, icons). */
export function SkeletonCircle({
  size = 48,
  style,
}: {
  size?: number;
  style?: ViewStyle;
}) {
  return <Skeleton width={size} height={size} borderRadius={size / 2} style={style} />;
}

/** A text-line placeholder with pill ends. */
export function SkeletonText({
  width = "100%",
  height = 13,
  style,
}: {
  width?: SkeletonProps["width"];
  height?: number;
  style?: ViewStyle;
}) {
  const { theme } = useTheme();
  return (
    <Skeleton
      width={width}
      height={height}
      borderRadius={theme.radii.pill}
      style={style}
    />
  );
}

/** A card-shaped placeholder matching the app's Card component styling. */
export function SkeletonCard({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: ViewStyle;
}) {
  const { theme } = useTheme();
  const colors = theme.colors;
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: theme.radii.lg,
          padding: theme.spacing.md,
          marginBottom: theme.spacing.md,
          shadowColor: colors.textPrimary,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
          elevation: 2,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
