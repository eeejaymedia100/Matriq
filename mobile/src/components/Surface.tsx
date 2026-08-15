import React, { useState } from "react";
import {
  View,
  Pressable,
  type ViewStyle,
  type StyleProp,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useTheme } from "../theme/ThemeContext";
import { AmbientBlobs } from "./AmbientBlobs";

/**
 * Theme-aware surface. In Glass it's a translucent frosted card with a
 * hairline border; in Pop it's pale clay with a dual shadow. `variant:
 * "sticker"` is the Pop signature — thick ink border + hard offset shadow
 * that visibly collapses when pressed. `pressable` + `onPress` wires the
 * tactile press feedback.
 */
export function Surface({
  children,
  style,
  variant = "card",
  pressable = false,
  onPress,
  testID,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: "card" | "sticker" | "flat";
  pressable?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  const { theme } = useTheme();
  const [pressed, setPressed] = useState(false);
  const scale = useSharedValue(1);

  const base: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  };

  let variantStyle: ViewStyle = {};
  if (variant === "sticker") {
    variantStyle =
      theme.mode === "pop"
        ? pressed
          ? theme.shadows.stickerPressed
          : theme.shadows.sticker
        : {
            borderWidth: 1,
            borderColor: theme.colors.accent + "55",
            backgroundColor: theme.colors.surfaceAlt,
          };
  } else if (variant === "card") {
    // Round-2 QA §10: in Pop, the thick ink border + offset shadow IS the
    // default container style now — not an occasional accent. Glass keeps
    // its soft float.
    variantStyle =
      theme.mode === "pop"
        ? pressed
          ? theme.shadows.stickerPressed
          : theme.shadows.sticker
        : pressed
          ? theme.shadows.cardPressed
          : theme.shadows.card;
  } else {
    variantStyle = {
      backgroundColor: theme.colors.surfaceAlt,
      borderColor: "transparent",
    };
  }

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    setPressed(true);
    scale.value = withSpring(0.97, { damping: 18, stiffness: 320, mass: 0.5 });
  };
  const handlePressOut = () => {
    setPressed(false);
    scale.value = withSpring(1, { damping: 14, stiffness: 240, mass: 0.6 });
  };

  const inner = (
    <Animated.View
      style={[base, variantStyle, style, animatedStyle]}
      testID={testID}
    >
      {children}
    </Animated.View>
  );

  if (pressable && onPress) {
    return (
      <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
        {inner}
      </Pressable>
    );
  }
  return inner;
}

/**
 * Themed full-screen wrapper: paints the theme background and lays the Glass
 * ambient blobs behind content. Use as the root of every screen.
 */
export function ThemedScreen({
  children,
  style,
  blobs = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  blobs?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View style={[{ flex: 1, backgroundColor: theme.colors.bg }, style]}>
      {blobs ? <AmbientBlobs /> : null}
      {children}
    </View>
  );
}
