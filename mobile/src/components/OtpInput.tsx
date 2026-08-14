import React, { useRef } from "react";
import { View, TextInput, Text, type NativeSyntheticEvent, type TextInputKeyPressEventData } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useTheme } from "../theme/ThemeContext";

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  error?: boolean;
}

/**
 * Six individual digit boxes (spec §1/§4 — not one text field).
 * - auto-advance focus as each digit is entered
 * - backspace on an empty box moves focus back
 * - pasting a full code (clipboard/SMS suggestion) fills all six at once
 * - auto-submits once all digits are filled
 * - per-box micro-feedback: a soft scale pulse as each box fills
 */
export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  error = false,
}: OtpInputProps) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const refs = useRef<Array<TextInput | null>>([]);

  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  const focusIndex = (i: number) => {
    const target = Math.max(0, Math.min(length - 1, i));
    refs.current[target]?.focus();
  };

  const handleChange = (i: number, text: string) => {
    const sanitized = text.replace(/[^0-9]/g, "");
    if (!sanitized) return;

    const next = value.split("");
    // Pasting a multi-digit code fills from the current box forward.
    for (let k = 0; k < sanitized.length && i + k < length; k++) {
      next[i + k] = sanitized[k];
    }
    const joined = next.join("").slice(0, length);
    onChange(joined);

    const lastIndex = Math.min(i + sanitized.length, length - 1);
    if (joined.length >= length) {
      refs.current[length - 1]?.blur();
      onComplete?.(joined);
    } else {
      focusIndex(lastIndex + 1);
    }
  };

  const handleKeyPress = (i: number, e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (e.nativeEvent.key === "Backspace" && !digits[i]) {
      focusIndex(i - 1);
    }
  };

  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
      {digits.map((digit, i) => (
        <DigitBox
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          digit={digit}
          active={i === value.length}
          error={error}
          onFocus={() => focusIndex(i)}
          onChangeText={(t) => handleChange(i, t)}
          onKeyPress={(e) => handleKeyPress(i, e)}
          colors={{
            accent: colors.accent,
            border: colors.border,
            error: colors.error,
            surface: colors.surface,
            text: colors.textPrimary,
          }}
          radius={theme.radii.md}
          glass={theme.mode === "glass"}
        />
      ))}
    </View>
  );
}

interface DigitBoxProps {
  digit: string;
  active: boolean;
  error: boolean;
  onFocus: () => void;
  onChangeText: (t: string) => void;
  onKeyPress: (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => void;
  colors: {
    accent: string;
    border: string;
    error: string;
    surface: string;
    text: string;
  };
  radius: number;
  glass: boolean;
}

const DigitBox = React.forwardRef<TextInput, DigitBoxProps>(function DigitBox(
  { digit, active, error, onFocus, onChangeText, onKeyPress, colors, radius, glass },
  ref,
) {
  const pulse = useSharedValue(1);
  const filled = digit.length > 0;

  React.useEffect(() => {
    if (filled) {
      pulse.value = withSpring(1.12, { damping: 9, stiffness: 320 });
      pulse.value = withSpring(1, { damping: 12, stiffness: 220 });
    }
  }, [filled, pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const borderColor = error ? colors.error : filled || active ? colors.accent : colors.border;

  return (
    <Animated.View
      style={[
        {
          flex: 1,
          aspectRatio: 1,
          borderRadius: radius,
          borderWidth: 1.5,
          borderColor,
          backgroundColor: colors.surface,
          alignItems: "center",
          justifyContent: "center",
          maxWidth: 56,
          ...(filled || active
            ? glass
              ? { boxShadow: `0 0 0 3px ${colors.accent}30` }
              : {}
            : {}),
        },
        animatedStyle,
      ]}
    >
      <TextInput
        ref={ref}
        value={digit}
        onChangeText={onChangeText}
        onKeyPress={onKeyPress}
        onFocus={onFocus}
        keyboardType="number-pad"
        maxLength={6}
        selectTextOnFocus
        caretHidden
        style={{
          width: "100%",
          height: "100%",
          textAlign: "center",
          fontSize: 22,
          fontFamily: "PlusJakartaSans_700Bold",
          color: colors.text,
          padding: 0,
        }}
      />
      {filled && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: 5,
            alignSelf: "center",
            width: 5,
            height: 5,
            borderRadius: 3,
            backgroundColor: colors.accent,
          }}
        />
      )}
    </Animated.View>
  );
});
