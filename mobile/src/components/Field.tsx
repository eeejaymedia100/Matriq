import React, { useState } from "react";
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TouchableOpacity,
  type TextInputProps,
  type ViewStyle,
  type StyleProp,
} from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { Icon } from "./icons";

interface FieldProps extends TextInputProps {
  /** Label — shown as the placeholder when empty, collapses to a caption when focused/filled. */
  label: string;
  error?: string;
  hint?: string;
  /** Live "this field is correct" check (green tick), like platform forms. */
  valid?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * Field — the single text-input primitive for the whole app, modelled on the
 * fields students already trust (WhatsApp, Netflix, iOS Settings): a quiet
 * filled container, the label swapping between placeholder and collapsed
 * caption, one 1px focus line in lime, and no colored halos or glow rings.
 * Password fields get the standard show/hide affordance.
 *
 * Deliberately simple: no absolute-position math, no animation on the label —
 * the swap is instant and predictable, exactly like the platform fields it
 * imitates. minHeight 52 keeps a thumb-sized target.
 */
export function Field({
  label,
  error,
  hint,
  valid,
  containerStyle,
  secureTextEntry,
  value,
  editable = true,
  placeholder,
  ...props
}: FieldProps) {
  // When resting (unfocused + empty), the field shows the caller's explicit
  // placeholder if it has one (e.g. "you@example.com"), otherwise the label
  // itself — the WhatsApp/Netflix pattern.
  const { theme } = useTheme();
  const colors = theme.colors;
  const [focused, setFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isPassword = secureTextEntry;
  const hasValue = typeof value === "string" && value.length > 0;
  const floated = focused || hasValue;
  const showValidCheck = valid && hasValue && !error;

  // One border. Quiet by default; the focus line is the only decoration.
  const borderColor = error
    ? colors.error
    : showValidCheck
      ? colors.success
      : focused
        ? colors.accent
        : colors.border;

  return (
    <View style={[styles.container, containerStyle]}>
      <View
        style={[
          styles.box,
          {
            backgroundColor: editable ? colors.surfaceAlt : colors.surface,
            borderColor,
            borderRadius: theme.radii.md,
          },
          !editable && { opacity: 0.6 },
        ]}
      >
        {floated ? (
          <Text
            style={[
              styles.labelFloated,
              { color: error ? colors.error : colors.textMuted },
            ]}
          >
            {label}
          </Text>
        ) : null}

        <TextInput
          style={[
            styles.input,
            {
              color: colors.textPrimary,
              paddingRight: isPassword ? 48 : 16,
              paddingTop: floated ? 2 : 15,
              paddingBottom: 15,
            },
          ]}
          placeholderTextColor={colors.textMuted}
          placeholder={floated ? "" : placeholder ?? label}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          secureTextEntry={isPassword && !showPassword}
          value={value}
          editable={editable}
          {...props}
        />

        {isPassword ? (
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            style={styles.iconBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={showPassword ? "Hide password" : "Show password"}
          >
            <Icon
              name={showPassword ? "eyeOff" : "eye"}
              size={20}
              color={colors.textMuted}
            />
          </TouchableOpacity>
        ) : showValidCheck ? (
          <View style={styles.iconBtn} pointerEvents="none">
            <Icon name="check" size={20} color={colors.success} />
          </View>
        ) : null}
      </View>

      {error ? (
        <Text style={[styles.note, { color: colors.error }]}>{error}</Text>
      ) : hint ? (
        <Text style={[styles.note, { color: colors.textMuted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  box: {
    borderWidth: 1,
  },
  labelFloated: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    marginLeft: 16,
    marginRight: 16,
    marginTop: 8,
  },
  input: {
    fontSize: 16,
    lineHeight: 22,
    minHeight: 52,
    paddingLeft: 16,
  },
  iconBtn: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  note: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
});
