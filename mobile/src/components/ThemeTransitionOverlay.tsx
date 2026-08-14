import React, { useEffect, useRef, useState } from "react";
import { View, Text, Animated, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeMode } from "../theme/themes";

const PHRASES = [
  "Changing the Perspective",
  "Changing the Narrative",
  "Changing the Objective",
] as const;

const HOLD_MS = 720;
const FADE_IN = 220;
const FADE_OUT = 160;

/**
 * Spec §10.1 — switching themes triggers a brief themed loading sequence
 * rather than an instant flip: each phrase builds with its final word
 * (Perspective / Narrative / Objective) in a different accent color, and only
 * after the sequence completes does the new theme apply.
 */
export function ThemeTransitionOverlay({
  to,
  onComplete,
}: {
  to: ThemeMode;
  onComplete: () => void;
}) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const [phraseIdx, setPhraseIdx] = useState(0);
  const opacity = useRef(new Animated.Value(0)).current;
  const doneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    (async () => {
      for (let i = 0; i < PHRASES.length; i++) {
        if (cancelled) return;
        setPhraseIdx(i);
        Animated.timing(opacity, {
          toValue: 1,
          duration: FADE_IN,
          useNativeDriver: true,
        }).start();
        await sleep(HOLD_MS);
        if (cancelled) return;
        Animated.timing(opacity, {
          toValue: 0,
          duration: FADE_OUT,
          useNativeDriver: true,
        }).start();
        await sleep(FADE_OUT + 40);
      }
      if (!cancelled && !doneRef.current) {
        doneRef.current = true;
        onComplete();
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const phrase = PHRASES[phraseIdx];
  const lead = phrase.slice(0, phrase.lastIndexOf(" ") + 1);
  const finalWord = phrase.slice(phrase.lastIndexOf(" ") + 1);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Animated.View style={{ opacity, alignItems: "center", paddingHorizontal: 24 }}>
        <Text style={[theme.typography.display, { color: colors.textPrimary, textAlign: "center" }]}>
          {lead}
          <Text style={{ color: to === "glass" ? colors.accent : colors.brand }}>{finalWord}</Text>
        </Text>
        <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 12 }]}>
          Almost there…
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
});
