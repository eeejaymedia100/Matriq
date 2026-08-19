import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useTheme } from "../../theme/ThemeContext";
import { ThemedScreen } from "../../components/Surface";
import { FactCard } from "../../components/FactCard";
import { RecommendedBadge } from "../../components/RecommendedBadge";
import { Icon, type IconName } from "../../components/icons";
import { useOfflineAi } from "../../offline/OfflineAiContext";
import { OFFLINE_MODELS, formatBytes, getModel } from "../../offline/models";
import { factForTick } from "../../utils/facts";
import { useDailyFacts } from "../../utils/dailyFacts";
import type { MainTabParamList } from "../../navigation/types";

type Props = BottomTabScreenProps<MainTabParamList, "Study">;

interface ExtraFeature {
  id: string;
  label: string;
  hint: string;
  icon: IconName;
  ready: boolean;
  target?: "FocusTimer" | "DeadlineTracker" | "Quiz";
}

const EXTRAS: ExtraFeature[] = [
  { id: "flashcards", label: "Flashcards", hint: "Spaced repetition", icon: "layers", ready: false },
  { id: "focus", label: "Focus timer", hint: "Pomodoro, offline", icon: "timer", ready: true, target: "FocusTimer" },
  { id: "deadlines", label: "Deadline tracker", hint: "Never miss a submission", icon: "target", ready: true, target: "DeadlineTracker" },
  // Round-2 QA §8: quiz generation is real and AI-powered now.
  { id: "quiz", label: "Quiz maker", hint: "From your uploaded materials", icon: "zap", ready: true, target: "Quiz" },
];

export function StudyScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const { downloaded, activeModelId } = useOfflineAi();
  const [tick, setTick] = useState(0);
  const facts = useDailyFacts();

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const isWeb = Platform.OS === "web";
  const fact = factForTick(tick, facts);
  const activeModel = activeModelId ? getModel(activeModelId) : undefined;
  const hasModel = Object.keys(downloaded).length > 0;

  const stackNav = navigation.getParent() as { navigate: (s: string) => void } | undefined;
  // Once a model is downloaded, the Offline AI card becomes the chat screen;
  // the model picker stays reachable via the hamburger inside the chat.
  const openModels = () => stackNav?.navigate("OfflineModels");
  const openChat = () => stackNav?.navigate("AiChat");

  return (
    <ThemedScreen>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[theme.typography.display, { color: colors.textPrimary }]}>Study</Text>
          <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 4 }]}>
            Your corner for learning — on or off the network.
          </Text>

          {/* 1 — Rotating fact card (shared with Home) */}
          <View style={{ marginTop: 20 }}>
            <FactCard fact={fact} label="did you know" />
          </View>

          {/* 2 — Offline AI setup */}
          <Text style={[theme.typography.h3, { color: colors.textPrimary, marginTop: 24, marginBottom: 12 }]}>
            Offline AI
          </Text>

          {isWeb ? (
            <View
              style={{
                padding: 20,
                borderRadius: theme.radii.lg,
                backgroundColor: colors.surfaceAlt,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View style={{ flexDirection: "row", gap: 12 }}>
                <Icon name="cloudOff" size={22} color={colors.textMuted} />
                <Text style={[theme.typography.caption, { color: colors.textSecondary, flex: 1, lineHeight: 20 }]}>
                  Offline AI isn't available on web yet — it's coming with the Android
                  app. Everything else here works on any device.
                </Text>
              </View>
            </View>
          ) : hasModel && activeModel ? (
            <Pressable onPress={openChat}>
              <View
                style={{
                  padding: 20,
                  borderRadius: theme.radii.lg,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.accent + "66",
                  marginBottom: 12,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Icon name="sparkle" size={18} color={colors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>
                      {activeModel.name} ready
                    </Text>
                    <Text style={[theme.typography.caption, { color: colors.textMuted }]}>
                      Answers work with no internet. Tap to chat.
                    </Text>
                  </View>
                  <Icon name="chevronRight" size={18} color={colors.textMuted} />
                </View>
              </View>
            </Pressable>
          ) : (
            <>
              <Pressable onPress={openModels}>
                <View
                  style={{
                    padding: 20,
                    borderRadius: theme.radii.lg,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                    marginBottom: 12,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <Icon name="sparkle" size={18} color={colors.accent} />
                    <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>
                      Download a model once, use it forever
                    </Text>
                  </View>
                  <Text style={[theme.typography.caption, { color: colors.textSecondary, lineHeight: 19 }]}>
                    Pick the model that fits your phone and data. The engine ships
                    with the app — only the model itself is downloaded, over Wi-Fi.
                  </Text>
                </View>
              </Pressable>

              {/* Model options — download size + provisional RAM */}
              <View style={{ gap: 10, marginBottom: 8 }}>
                {OFFLINE_MODELS.map((m) => (
                  <Pressable key={m.id} onPress={openModels}>
                    <View
                      style={{
                        padding: 16,
                        borderRadius: theme.radii.md,
                        backgroundColor: colors.surfaceAlt,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <View
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 11,
                            backgroundColor: colors.surface,
                            borderWidth: 1,
                            borderColor: colors.border,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Icon name={m.tier === "Medium" ? "layers" : m.tier === "Small" ? "zap" : "dot"} size={17} color={colors.brand} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>
                              {m.name}
                            </Text>
                            {m.recommended ? <RecommendedBadge /> : null}
                          </View>
                          <Text style={[theme.typography.caption, { color: colors.textMuted }]}>
                            {m.speedNote} · {formatBytes(m.sizeBytes)} download
                          </Text>
                        </View>
                      </View>
                      <Text style={[theme.typography.caption, { color: colors.textSecondary, marginTop: 8, lineHeight: 18 }]}>
                        {m.description}
                      </Text>
                      <Text style={[theme.typography.small, { color: colors.textMuted, marginTop: 6 }]}>
                        {m.ramNote} (validating on real devices)
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
              <Text style={[theme.typography.small, { color: colors.textMuted, marginBottom: 4 }]}>
                Sizes are exact; RAM figures are being confirmed on low-end phones.
              </Text>
            </>
          )}

          {/* 3 — Timetable */}
          <Pressable onPress={() => stackNav?.navigate("Timetable")}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 18,
                borderRadius: theme.radii.lg,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                marginTop: 20,
              }}
            >
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 13,
                  backgroundColor: colors.surfaceAlt,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="calendar" size={21} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>
                  Timetable
                </Text>
                <Text style={[theme.typography.caption, { color: colors.textMuted }]}>
                  Your week, planned — with next-class alerts
                </Text>
              </View>
              <Icon name="chevronRight" size={18} color={colors.textMuted} />
            </View>
          </Pressable>

          {/* 4 — My materials */}
          <Pressable onPress={() => stackNav?.navigate("MyMaterials")}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 18,
                borderRadius: theme.radii.lg,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                marginTop: 10,
              }}
            >
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 13,
                  backgroundColor: colors.surfaceAlt,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="book" size={21} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>
                  My materials
                </Text>
                <Text style={[theme.typography.caption, { color: colors.textMuted }]}>
                  Your own uploaded books & notes
                </Text>
              </View>
              <Icon name="chevronRight" size={18} color={colors.textMuted} />
            </View>
          </Pressable>

          {/* 5 — Extra study features */}
          <Text style={[theme.typography.h3, { color: colors.textPrimary, marginTop: 24, marginBottom: 12 }]}>
            Study extras
          </Text>
          {EXTRAS.map((f) => (
            <Pressable
              key={f.id}
              style={{ opacity: f.ready ? 1 : 0.55 }}
              disabled={!f.ready}
              onPress={() => f.target && stackNav?.navigate(f.target)}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  padding: 14,
                  borderRadius: theme.radii.md,
                  backgroundColor: colors.surfaceAlt,
                  borderWidth: 1,
                  borderColor: colors.border,
                  marginBottom: 8,
                }}
              >
                <Icon name={f.icon} size={18} color={f.ready ? colors.brand : colors.textMuted} />
                <Text style={[theme.typography.bodyMedium, { color: colors.textPrimary, flex: 1 }]}>
                  {f.label}
                </Text>
                {f.ready ? (
                  <Icon name="chevronRight" size={16} color={colors.textMuted} />
                ) : (
                  <Text style={[theme.typography.small, { color: colors.textMuted }]}>{f.hint}</Text>
                )}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    </ThemedScreen>
  );
}
