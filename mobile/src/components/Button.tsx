import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useTheme } from "../theme/ThemeContext";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
}

/**
 * Theme-aware button.
 * - primary → lime accent (Pop: ink sticker border + offset shadow that
 *   collapses on press; Glass: lime with soft glow) — the "look here" action.
 * - secondary → ink brand chrome.
 * - outline / ghost → quiet alternatives.
 */
export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  style,
  textStyle,
  fullWidth = true,
}: ButtonProps) {
  const { theme, isGlass } = useTheme();
  const scale = useSharedValue(1);

  const colors = theme.colors;

  const base: ViewStyle = {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.md,
    flexDirection: "row",
  };

  const variantStyle: ViewStyle =
    variant === "primary"
      ? {
          backgroundColor: colors.accent,
          // Restraint pass: flat lime, no ink outline, no glow. The press
          // scale (below) is the tactile feedback — decoration isn't.
        }
      : variant === "secondary"
        ? {
            // Secondary: lime fill + ink label in BOTH themes (ink-on-lime is
            // the brand pairing). The old black fill forced white text —
            // banned by the contrast rules.
            backgroundColor: colors.accent,
            borderWidth: 1.5,
            borderColor: colors.borderStrong,
          }
        : variant === "outline"
          ? {
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: colors.borderStrong,
            }
          : { backgroundColor: "transparent" };

  const sizeStyle: ViewStyle =
    size === "sm"
      ? { paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.md }
      : size === "md"
        ? {
            paddingVertical: theme.spacing.md - 2,
            paddingHorizontal: theme.spacing.lg,
          }
        : {
            paddingVertical: theme.spacing.md + 2,
            paddingHorizontal: theme.spacing.xl,
          };

  const labelColor =
    variant === "primary"
      ? "#17181A"
      : variant === "secondary"
        ? "#17181A"
        : colors.textPrimary;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.97, { damping: 20, stiffness: 340, mass: 0.4 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 12, stiffness: 220, mass: 0.5 });
  };

  return (
    <Animated.View
      style={[
        fullWidth && { width: "100%" },
        disabled && { opacity: 0.5 },
        animatedStyle,
      ]}
    >
      <TouchableOpacity
        style={[base, variantStyle, sizeStyle, style]}
        onPress={onPress}
        disabled={disabled || loading}
        activeOpacity={0.85}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {loading ? (
          <ActivityIndicator color={labelColor} size="small" />
        ) : (
          <Text
            style={[
              {
                fontFamily: theme.typography.bodyBold.fontFamily,
                fontSize: size === "sm" ? 13 : size === "md" ? 15 : 17,
                lineHeight: size === "lg" ? 24 : 20,
                color: labelColor,
              },
              textStyle,
            ]}
          >
            {title}
          </Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({});
