import React, { useEffect } from "react";
import { Image, StyleSheet, Text, useColorScheme } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { TAGLINE } from "../theme/tokens";

/** Matches the native splash config in app.json so the native → JS handoff is
 *  pixel-identical (zero flicker). */
export const SPLASH_BG = "#121212";

interface AnimatedSplashScreenProps {
  /** True once the app's first real screen is mounted and resources are loaded. */
  ready: boolean;
  /** Called when the exit animation finishes — unmount the overlay. */
  onDone: () => void;
}

/**
 * JS splash overlay that takes over from the native launch screen and
 * seamlessly scales + fades the brand logo out into the first app screen
 * (passcode). The logo follows the system light/dark mode: purple M in light,
 * lime M in dark — matching the theme-aware launcher icons.
 */
export function AnimatedSplashScreen({ ready, onDone }: AnimatedSplashScreenProps) {
  const scheme = useColorScheme();
  const dark = scheme === "dark";
  const logo = dark
    ? require("../../assets/splash-icon-dark.png")
    : require("../../assets/splash-icon.png");

  const logoScale = useSharedValue(1);
  const logoOpacity = useSharedValue(1);
  const overlayOpacity = useSharedValue(1);

  useEffect(() => {
    if (!ready) return;
    // Logo scales up and fades, then the whole overlay dissolves into the app.
    logoScale.value = withTiming(1.22, {
      duration: 600,
      easing: Easing.inOut(Easing.cubic),
    });
    logoOpacity.value = withTiming(0, {
      duration: 450,
      easing: Easing.out(Easing.quad),
    });
    overlayOpacity.value = withDelay(
      120,
      withTiming(0, { duration: 620, easing: Easing.out(Easing.cubic) }, () => {
        // Fire unconditionally — if reanimated ever reports an interrupted
        // animation, the overlay must still unmount (App.tsx also has a
        // 4s hard failsafe on top of this).
        onDone();
      }),
    );
  }, [ready, onDone, logoScale, logoOpacity, overlayOpacity]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.overlay, overlayStyle]}
      pointerEvents={ready ? "none" : "auto"}
    >
      <Animated.View style={[styles.center, logoStyle]}>
        <Image source={logo} style={styles.logo} resizeMode="contain" />
        <Text style={styles.tagline}>{TAGLINE}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: SPLASH_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 132,
    height: 132,
  },
  tagline: {
    marginTop: 18,
    color: "rgba(255,255,255,0.55)",
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
});
