import React, { useEffect, useState } from "react";
import { AccessibilityInfo, Pressable, PressableProps } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * PressableScale — the app's standard touch feel: a quick spring press-down
 * with a light haptic tick, settling back with a softer spring. Respects
 * reduce-motion (no scale, no haptic). Used anywhere a tap should feel
 * physical rather than like a web link.
 */
export function PressableScale({
  style,
  children,
  haptic = true,
  onPress,
  ...rest
}: PressableProps & { haptic?: boolean }) {
  const scale = useSharedValue(1);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPressIn={() => {
        if (!reduceMotion) {
          scale.value = withSpring(0.965, { damping: 18, stiffness: 320 });
        }
      }}
      onPressOut={() => {
        if (!reduceMotion) {
          scale.value = withSpring(1, { damping: 14, stiffness: 260 });
        }
      }}
      onPress={(e) => {
        if (haptic && !reduceMotion) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
            () => {},
          );
        }
        onPress?.(e);
      }}
      style={[animated, style]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
