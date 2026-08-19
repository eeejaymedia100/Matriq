import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../theme/ThemeContext";
import { ThemedScreen } from "../../components/Surface";
import { Icon } from "../../components/icons";

/**
 * Focus timer (spec §9 extras — Study). Simple Pomodoro, fully offline:
 * 25-minute focus blocks with a 5-minute break between them.
 */
const FOCUS_MIN = 25;
const BREAK_MIN = 5;

export function FocusTimerScreen() {
  const { theme } = useTheme();
  const colors = theme.colors;

  const [remaining, setRemaining] = useState(FOCUS_MIN * 60);
  const [running, setRunning] = useState(false);
  const [onBreak, setOnBreak] = useState(false);
  const [cycles, setCycles] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const start = () => {
    setRunning(true);
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          // Block finished — flip to break / next focus.
          if (onBreak) {
            setOnBreak(false);
            setCycles((c) => c + 1);
            return FOCUS_MIN * 60;
          }
          setOnBreak(true);
          return BREAK_MIN * 60;
        }
        return r - 1;
      });
    }, 1000);
  };

  const pause = () => {
    setRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const reset = () => {
    pause();
    setOnBreak(false);
    setRemaining(FOCUS_MIN * 60);
    setCycles(0);
  };

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const progress = onBreak
    ? 1 - remaining / (BREAK_MIN * 60)
    : 1 - remaining / (FOCUS_MIN * 60);

  return (
    <ThemedScreen>
      <SafeAreaView style={{ flex: 1 }} edges={["bottom", "left", "right"]}>
        <View style={{ flex: 1, padding: 24, alignItems: "center", justifyContent: "center" }}>
          <Text style={[theme.typography.captionBold, { color: colors.textMuted, letterSpacing: 2, textTransform: "uppercase" }]}>
            {onBreak ? "Break — stretch & hydrate" : "Focus block"}
          </Text>

          <View style={{ marginTop: 28, alignItems: "center" }}>
            <Text style={{ fontFamily: "PlusJakartaSans_800ExtraBold", fontSize: 76, color: colors.textPrimary, fontVariant: ["tabular-nums"] }}>
              {mins}:{secs.toString().padStart(2, "0")}
            </Text>
            <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 4 }]}>
              {cycles} block{cycles === 1 ? "" : "s"} completed
            </Text>
          </View>

          {/* Progress track */}
          <View
            style={{
              marginTop: 32,
              width: "100%",
              height: 10,
              borderRadius: 5,
              backgroundColor: colors.surfaceAlt,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${Math.max(3, Math.round(progress * 100))}%`,
                height: "100%",
                borderRadius: 5,
                backgroundColor: onBreak ? colors.success : colors.accent,
              }}
            />
          </View>

          <View style={{ flexDirection: "row", gap: 14, marginTop: 36 }}>
            <Pressable
              onPress={running ? pause : start}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingVertical: 15,
                paddingHorizontal: 34,
                borderRadius: theme.radii.pill,
                backgroundColor: colors.accent,
                borderWidth: theme.mode === "pop" ? 2 : 0,
                borderColor: colors.borderStrong,
              }}
            >
              <Icon name={running ? "x" : "zap"} size={18} color="#170B26" />
              <Text style={{ fontFamily: "PlusJakartaSans_700Bold", fontSize: 15, color: "#170B26" }}>
                {running ? "Pause" : "Start"}
              </Text>
            </Pressable>
            <Pressable
              onPress={reset}
              style={{
                alignItems: "center",
                justifyContent: "center",
                width: 52,
                height: 52,
                borderRadius: theme.radii.pill,
                backgroundColor: colors.surfaceAlt,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Icon name="refresh" size={20} color={colors.textPrimary} />
            </Pressable>
          </View>

          <Text style={[theme.typography.caption, { color: colors.textMuted, textAlign: "center", marginTop: 28, maxWidth: 280, lineHeight: 19 }]}>
            {onBreak ? "Take the full break — it's part of the method." : "25 minutes of focus, 5 minutes of rest. No internet required."}
          </Text>
        </View>
      </SafeAreaView>
    </ThemedScreen>
  );
}
