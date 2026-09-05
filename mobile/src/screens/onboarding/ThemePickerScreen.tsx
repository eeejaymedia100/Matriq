import React, { useEffect, useRef } from "react";
import { View, Text, Pressable, StyleSheet, Animated, Easing } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../theme/ThemeContext";
import { TAGLINE, brand } from "../../theme/tokens";
import { MatriqMark } from "../../components/MatriqMark";

/**
 * The very first screen (spec §4) — before onboarding, before anything else.
 * The background is neutral: it commits to neither theme until the student
 * picks one. Each card is a living preview — the Glass card has a soft lime
 * blob breathing behind its frosted surface; the Pop card already shows the
 * clay shadow under a lime dot. Choosing transitions the whole UI into that
 * theme immediately (no flash of the wrong theme first).
 *
 * NOTE: this screen deliberately uses React Native's core `Animated` (JS
 * thread) instead of react-native-reanimated. It is the very first screen a
 * fresh install renders, and it runs an unbounded loop on mount — we keep the
 * riskiest animation off the native worklet runtime here so a native crash on
 * first open is impossible. Behavior and look are identical.
 */
export function ThemePickerScreen() {
  const { setMode } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="neutralBg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#1C1C1E" />
            <Stop offset="55%" stopColor="#0A0A0A" />
            <Stop offset="100%" stopColor="#2A2A2C" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#neutralBg)" />
      </Svg>

      <View style={[styles.content, { paddingTop: insets.top + 60 }]}>
        <View style={styles.wordmark}>
          <MatriqMark size={44} />
          <Text style={styles.name}>Matriq</Text>
        </View>

        <View style={styles.heading}>
          <Text style={styles.title}>Pick your vibe</Text>
          <Text style={styles.subtitle}>
            Same Matriq, two moods. You can switch anytime in Settings.
          </Text>
        </View>

        <GlassPreviewCard onChoose={() => void setMode("glass")} />
        <PopPreviewCard onChoose={() => void setMode("pop")} />
      </View>

      <Text style={[styles.tagline, { paddingBottom: insets.bottom + 40 }]}>{TAGLINE}</Text>
    </View>
  );
}

/* ── Glass preview ─────────────────────────────────────────── */

function GlassPreviewCard({ onChoose }: { onChoose: () => void }) {
  // Breathing blob — core Animated loop (JS thread), safe on first mount.
  const breathe = useRef(new Animated.Value(0.9)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1.15,
          duration: 1300,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0.9,
          duration: 1300,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathe]);

  const blobScale = breathe.interpolate({
    inputRange: [0.9, 1.15],
    outputRange: [0.95, 1.12],
  });
  const blobOpacity = breathe.interpolate({
    inputRange: [0.9, 1.15],
    outputRange: [0.5, 0.9],
  });

  // Press feedback — core Animated spring.
  const press = useRef(new Animated.Value(1)).current;

  return (
    <Pressable
      onPressIn={() =>
        Animated.spring(press, { toValue: 0.97, useNativeDriver: true, damping: 20, stiffness: 320 }).start()
      }
      onPressOut={() =>
        Animated.spring(press, { toValue: 1, useNativeDriver: true, damping: 14, stiffness: 220 }).start()
      }
      onPress={onChoose}
    >
      <Animated.View style={[styles.card, { transform: [{ scale: press }] }]}>
        <View style={[styles.preview, { backgroundColor: brand.void }]}>
          <Animated.View
            style={[
              {
                position: "absolute",
                width: 150,
                height: 150,
                borderRadius: 75,
                backgroundColor: brand.lime500,
                top: -30,
                right: -20,
              },
              { transform: [{ scale: blobScale }], opacity: blobOpacity },
            ]}
          />
          <View style={styles.glassSurface}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: brand.lime500 }} />
              <View style={{ width: 60, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.5)" }} />
            </View>
            <View style={{ width: 90, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.3)", marginTop: 8 }} />
          </View>
        </View>
        <View style={styles.cardMeta}>
          <View>
            <Text style={styles.cardTitle}>Glass</Text>
            <Text style={styles.cardSub}>Dark · frosted · fluid</Text>
          </View>
          <Text style={styles.cardCta}>Choose</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

/* ── Pop preview ───────────────────────────────────────────── */

function PopPreviewCard({ onChoose }: { onChoose: () => void }) {
  const press = useRef(new Animated.Value(1)).current;

  return (
    <Pressable
      onPressIn={() =>
        Animated.spring(press, { toValue: 0.97, useNativeDriver: true, damping: 20, stiffness: 320 }).start()
      }
      onPressOut={() =>
        Animated.spring(press, { toValue: 1, useNativeDriver: true, damping: 14, stiffness: 220 }).start()
      }
      onPress={onChoose}
    >
      <Animated.View
        style={[
          styles.card,
          { transform: [{ scale: press }], marginTop: 20 },
        ]}
      >
        <View
          style={[
            styles.preview,
            {
              backgroundColor: brand.paper,
              borderWidth: 2,
              borderColor: brand.ink,
              boxShadow: "4px 4px 0 #17181A",
              transform: [{ rotate: "-1.5deg" }],
            },
          ]}
        >
          <View style={styles.claySurface}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: brand.lime500, boxShadow: "0 2px 0 rgba(23,11,38,0.35)" }} />
              <View style={{ width: 60, height: 8, borderRadius: 4, backgroundColor: brand.ink, opacity: 0.75 }} />
            </View>
            <View style={{ width: 90, height: 6, borderRadius: 3, backgroundColor: brand.ink, opacity: 0.35, marginTop: 8 }} />
          </View>
        </View>
        <View style={styles.cardMeta}>
          <View>
            <Text style={styles.cardTitle}>Pop</Text>
            <Text style={styles.cardSub}>Light · clay · tactile</Text>
          </View>
          <Text style={styles.cardCta}>Choose</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 28, paddingTop: 72 },
  wordmark: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 44 },
  name: { color: "#F5F4F1", fontSize: 26, fontFamily: "Inter_800ExtraBold" },
  heading: { marginBottom: 28 },
  title: { color: "#F5F4F1", fontSize: 30, fontFamily: "Inter_700Bold" },
  subtitle: {
    color: "#C8C6C1",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    marginTop: 6,
    maxWidth: 300,
  },
  card: { borderRadius: 22, padding: 10, backgroundColor: "rgba(255,255,255,0.04)" },
  preview: { height: 132, borderRadius: 16, overflow: "hidden", padding: 14 },
  glassSurface: {
    marginTop: 30,
    height: 54,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.09)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    padding: 10,
    justifyContent: "center",
  },
  claySurface: {
    marginTop: 26,
    height: 54,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: brand.ink,
    padding: 10,
    justifyContent: "center",
    boxShadow: "2px 3px 0 rgba(23,11,38,0.14)",
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 6,
    paddingTop: 12,
    paddingBottom: 2,
  },
  cardTitle: { color: "#F5F4F1", fontSize: 19, fontFamily: "Inter_700Bold" },
  cardSub: { color: "#9B9995", fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  cardCta: {
    color: brand.lime500,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  tagline: {
    textAlign: "center",
    color: "#8E8C88",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    paddingBottom: 48,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
});
