import React, { useState } from "react";
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
 * - secondary → purple brand.
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
  const [pressed, setPressed] = useState(false);
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
          ...(theme.mode === "pop"
            ? {
                borderWidth: 2,
                borderColor: colors.borderStrong,
                boxShadow: pressed
                  ? "1px 1px 0 #170B26"
                  : "4px 4px 0 #170B26",
              }
            : {
                boxShadow:
                  "0 6px 24px rgba(198,255,61,0.22), 0 2px 6px rgba(0,0,0,0.35)",
              }),
        }
      : variant === "secondary"
        ? {
            backgroundColor: isGlass ? colors.surfaceAlt : colors.brand,
            ...(theme.mode === "pop"
              ? { borderWidth: 2, borderColor: colors.borderStrong }
              : { borderWidth: 1, borderColor: colors.border }),
          }
        : variant === "outline"
          ? {
              backgroundColor: "transparent",
              borderWidth: 1.5,
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
      ? "#170B26"
      : variant === "secondary"
        ? isGlass
          ? colors.textPrimary
          : "#FFFFFF"
        : colors.textPrimary;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    setPressed(true);
    scale.value = withSpring(0.96, { damping: 20, stiffness: 340, mass: 0.4 });
  };
  const handlePressOut = () => {
    setPressed(false);
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
