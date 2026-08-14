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
import { useTheme } from "../theme/ThemeContext";
import { Icon } from "./icons";

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
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const colors = theme.colors;
  const isPassword = secureTextEntry;
  const hasValue = typeof value === "string" && value.length > 0;
  const showValidCheck = valid && hasValue && !error;

  const borderColor = error
    ? colors.error
    : showValidCheck
      ? colors.success
      : focused
        ? colors.accent
        : colors.border;

  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <View
        style={[
          styles.inputWrapper,
          {
            backgroundColor: colors.surface,
            borderColor,
            borderRadius: theme.radii.md,
          },
          focused && {
            ...(theme.mode === "glass"
              ? { boxShadow: `0 0 0 3px ${colors.accent}33` }
              : { boxShadow: `0 0 0 3px ${colors.accent}55` }),
          },
        ]}
      >
        <TextInput
          style={[styles.input, { color: colors.textPrimary }]}
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
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon
              name={showPassword ? "eyeOff" : "eye"}
              size={20}
              color={colors.textMuted}
            />
          </TouchableOpacity>
        ) : showValidCheck ? (
          <View style={styles.iconBtn}>
            <Icon name="check" size={20} color={colors.success} />
          </View>
        ) : rightIcon ? (
          <View style={styles.iconBtn}>{rightIcon}</View>
        ) : null}
      </View>
      {error ? (
        <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
      ) : null}
      {hint && !error ? (
        <Text style={[styles.hint, { color: colors.textMuted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
  },
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  iconBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  error: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
});
