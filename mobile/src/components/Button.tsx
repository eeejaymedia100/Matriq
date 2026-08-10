import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { colors, radii, typography, spacing } from "../theme/colors";

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
  const btnStyle = [
    styles.base,
    styles[variant],
    styles[`size_${size}`],
    fullWidth && styles.fullWidth,
    disabled && styles.disabled,
    style,
  ];

  const labelStyle = [
    styles.label,
    styles[`label_${variant}`],
    styles[`labelSize_${size}`],
    disabled && styles.labelDisabled,
    textStyle,
  ];

  return (
    <TouchableOpacity
      style={btnStyle}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "outline" || variant === "ghost" ? colors.primary : colors.textOnPrimary}
          size="small"
        />
      ) : (
        <Text style={labelStyle}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    flexDirection: "row",
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.accent },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  ghost: { backgroundColor: "transparent" },
  size_sm: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  size_md: { paddingVertical: spacing.md - 2, paddingHorizontal: spacing.lg },
  size_lg: { paddingVertical: spacing.md + 2, paddingHorizontal: spacing.xl },
  fullWidth: { width: "100%" },
  disabled: { opacity: 0.5 },
  label: { ...typography.bodyBold },
  label_primary: { color: colors.textOnPrimary },
  label_secondary: { color: colors.textOnAccent },
  label_outline: { color: colors.primary },
  label_ghost: { color: colors.primary },
  labelSize_sm: { ...typography.captionBold },
  labelSize_md: { ...typography.bodyBold },
  labelSize_lg: { ...typography.h3 },
  labelDisabled: { opacity: 0.7 },
});
