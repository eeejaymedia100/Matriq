import React, { useState } from "react";
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TouchableOpacity,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { colors, radii, spacing, typography } from "../theme/colors";
import { Ionicons } from "@expo/vector-icons";

interface InputProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
  /**
   * When true (and the field has a value) the box turns green with a check
   * icon — live feedback that the field is filled in correctly.
   */
  valid?: boolean;
  rightIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export function Input({
  label,
  error,
  hint,
  valid,
  rightIcon,
  containerStyle,
  secureTextEntry,
  value,
  ...props
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isPassword = secureTextEntry;
  const hasValue = typeof value === "string" && value.length > 0;
  const showValidCheck = valid && hasValue && !error;

  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.inputWrapper,
          focused && styles.inputFocused,
          error && styles.inputError,
          showValidCheck && styles.inputValid,
        ]}
      >
        <TextInput
          style={styles.input}
          placeholderTextColor={colors.textMuted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          secureTextEntry={isPassword && !showPassword}
          value={value}
          {...props}
        />
        {isPassword ? (
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            style={styles.iconBtn}
          >
            <Ionicons
              name={showPassword ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={colors.textMuted}
            />
          </TouchableOpacity>
        ) : showValidCheck ? (
          <View style={styles.iconBtn}>
            <Ionicons
              name="checkmark-circle"
              size={20}
              color={colors.success}
            />
          </View>
        ) : rightIcon ? (
          <View style={styles.iconBtn}>{rightIcon}</View>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {hint && !error ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  label: {
    ...typography.captionBold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
  },
  inputFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceAlt,
  },
  inputError: { borderColor: colors.error },
  inputValid: { borderColor: colors.success },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.md,
  },
  iconBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  error: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.xs,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
