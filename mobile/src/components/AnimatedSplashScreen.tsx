import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, Text, useColorScheme } from "react-native";
import { TAGLINE } from "../theme/tokens";

/** Matches the native splash config in app.json so the native → JS handoff is
 *  pixel-identical (zero flicker). */
export const SPLASH_BG = "#0A0A0A";

interface AnimatedSplashScreenProps {
  /** True once the app's first real screen is mounted and resources are loaded. */
  ready: boolean;
  /** Called when the exit animation finishes — unmount the overlay. */
  onDone: () => void;
}

/**
 * JS splash overlay that takes over from the native launch screen and
 * seamlessly scales + fades the brand logo out into the first app screen.
 *
 * NOTE: this component deliberately uses React Native's core `Animated` (JS
 * thread) instead of react-native-reanimated. It is the very first thing that
 * animates — reanimated's JSI worklet runtime may not be fully initialized yet
 * on this frame, and calling useSharedValue / withTiming before the native
 * bridge is ready causes a silent native crash (no JS error, the app just
 * closes). ThemePickerScreen follows the same rule for the same reason.
 */
export function AnimatedSplashScreen({ ready, onDone }: AnimatedSplashScreenProps) {
  const scheme = useColorScheme();
  const dark = scheme === "dark";
  const logo = dark
    ? require("../../assets/splash-icon-dark.png")
    : require("../../assets/splash-icon.png");

  const logoScale = useRef(new Animated.Value(1)).current;
  const logoOpacity = useRef(new Animated.Value(1)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const hasStarted = useRef(false);

  useEffect(() => {
    if (!ready || hasStarted.current) return;
    hasStarted.current = true;

    // Logo scales up and fades.
    Animated.parallel([
      Animated.timing(logoScale, {
        toValue: 1.22,
        duration: 600,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 0,
        duration: 450,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      // Overlay fades with a slight delay.
      Animated.sequence([
        Animated.delay(120),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 620,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start(({ finished }) => {
      // Fire unconditionally — "finished" is false when the animation was
      // interrupted (e.g. App.tsx's 4s hard failsafe unmounts us early), but
      // the overlay must always unmount so the user is never trapped.
      onDone();
    });
  }, [ready, onDone, logoScale, logoOpacity, overlayOpacity]);

  const logoAnimStyle = {
    opacity: logoOpacity,
    transform: [{ scale: logoScale }],
  };

  const overlayAnimStyle = {
    opacity: overlayOpacity,
  };

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.overlay, overlayAnimStyle]}
      pointerEvents={ready ? "none" : "auto"}
    >
      <Animated.View style={[styles.center, logoAnimStyle]}>
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
