import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  Pressable,
} from "react-native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useTheme } from "../../theme/ThemeContext";
import { Surface, ThemedScreen } from "../../components/Surface";
import { Icon, type IconName } from "../../components/icons";
import { useAuth } from "../../contexts/AuthContext";
import { useOfflineAi } from "../../offline/OfflineAiContext";
import { factForTick } from "../../utils/facts";
import type { MainTabParamList } from "../../navigation/types";

type Props = BottomTabScreenProps<MainTabParamList, "Home">;

interface Todo {
  id: string;
  label: string;
  hint: string;
  icon: IconName;
  done: boolean;
  onPress: () => void;
}

function liveClock(): string {
  const now = new Date();
  return now.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function HomeScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const { user } = useAuth();
  const { downloaded } = useOfflineAi();

  const [now, setNow] = useState(liveClock());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const clock = setInterval(() => setNow(liveClock()), 30_000);
    const facts = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => {
      clearInterval(clock);
      clearInterval(facts);
    };
  }, []);

  const stackNav = navigation.getParent();
  const go = (screen: string) => {
    const parent = stackNav as { navigate: (s: string) => void } | undefined;
    parent?.navigate(screen);
  };
  const goTab = (tab: keyof MainTabParamList) => navigation.navigate(tab);

  const offlineAiDone = useMemo(() => Object.keys(downloaded).length > 0, [downloaded]);

  const todos: Todo[] = [
    {
      id: "timetable",
      label: "Set up your timetable",
      hint: "Your week, planned",
      icon: "calendar",
      done: false,
      onPress: () => goTab("Study"),
    },
    {
      id: "offline-ai",
      label: "Set up offline AI",
      hint: "Works with no internet",
      icon: "sparkle",
      done: offlineAiDone,
      onPress: () => go("OfflineModels"),
    },
    {
      id: "materials",
      label: "Upload study materials",
      hint: "Your own library",
      icon: "book",
      done: false,
      onPress: () => goTab("Vault"),
    },
    {
      id: "photo",
      label: "Add a profile photo",
      hint: "Make it yours",
      icon: "user",
      done: false,
      onPress: () => go("Profile"),
    },
  ];

  const allDone = todos.every((t) => t.done);
  const fact = factForTick(tick);
  const initial = (user?.fullName?.trim().charAt(0) ?? "S").toUpperCase();
  const firstName = user?.fullName?.split(" ")[0] ?? "there";
  const verified = !!user?.emailVerified;

  return (
    <ThemedScreen>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={{ paddingHorizontal: 24, paddingTop: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Pressable onPress={() => go("Profile")}>
                <View
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 999,
                    backgroundColor: colors.brand,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 2,
                    borderColor: colors.accent + "66",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "PlusJakartaSans_800ExtraBold",
                      fontSize: 19,
                      color: "#FFFFFF",
                    }}
                  >
                    {initial}
                  </Text>
                </View>
              </Pressable>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text
                  style={[
                    theme.typography.h3,
                    { color: colors.textPrimary },
                  ]}
                  numberOfLines={1}
                >
                  Hello, {firstName}
                </Text>
                <Text style={[theme.typography.caption, { color: colors.textMuted }]}>
                  {now}
                </Text>
              </View>
              <Pressable
                onPress={() => go(verified ? "VerificationStatus" : "VerificationUpload")}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  backgroundColor: verified ? colors.successBg : colors.warningBg,
                  borderWidth: 1,
                  borderColor: verified ? colors.success + "55" : colors.warning + "55",
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                }}
              >
                <Icon
                  name="shield"
                  size={13}
                  color={verified ? colors.success : colors.warning}
                />
                <Text
                  style={[
                    theme.typography.small,
                    {
                      color: verified ? colors.success : colors.warning,
                      fontWeight: "700",
                    },
                  ]}
                >
                  {verified ? "Verified" : "Verify"}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* My To-Do's */}
          {!allDone ? (
            <View style={{ marginTop: 24 }}>
              <Text
                style={[
                  theme.typography.h3,
                  { color: colors.textPrimary, paddingHorizontal: 24, marginBottom: 12 },
                ]}
              >
                My To-Do's
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 24, gap: 12 }}
              >
                {todos.map((todo) => (
                  <Pressable key={todo.id} onPress={todo.onPress} style={{ width: 150 }}>
                    <Surface style={{ padding: 14, width: 150, marginBottom: 0, opacity: todo.done ? 0.75 : 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 11,
                            backgroundColor: todo.done ? colors.accent : colors.surfaceAlt,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Icon
                            name={todo.done ? "check" : todo.icon}
                            size={17}
                            color={todo.done ? "#170B26" : colors.brand}
                          />
                        </View>
                        {todo.done ? (
                          <Text style={[theme.typography.small, { color: colors.success, fontWeight: "700" }]}>
                            Done
                          </Text>
                        ) : null}
                      </View>
                      <Text
                        style={[
                          theme.typography.captionBold,
                          { color: colors.textPrimary, marginTop: 10, lineHeight: 18 },
                        ]}
                      >
                        {todo.label}
                      </Text>
                      <Text style={[theme.typography.small, { color: colors.textMuted, marginTop: 2 }]}>
                        {todo.hint}
                      </Text>
                    </Surface>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* Hero — rotating fact, or nudge when no materials/AI */}
          <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
            <Surface variant="sticker" style={{ padding: 20 }}>
              {offlineAiDone ? (
                <>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <Icon name="sparkle" size={16} color={colors.accent} />
                    <Text
                      style={[
                        theme.typography.small,
                        {
                          color: colors.textMuted,
                          letterSpacing: 1,
                          textTransform: "uppercase",
                        },
                      ]}
                    >
                      {fact.tag} · just for you
                    </Text>
                  </View>
                  <Text style={[theme.typography.h3, { color: colors.textPrimary }]}>
                    {fact.title}
                  </Text>
                  <Text
                    style={[
                      theme.typography.body,
                      { color: colors.textSecondary, marginTop: 6, lineHeight: 24 },
                    ]}
                  >
                    {fact.body}
                  </Text>
                </>
              ) : (
                <>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <Icon name="sparkle" size={16} color={colors.accent} />
                    <Text
                      style={[
                        theme.typography.small,
                        {
                          color: colors.textMuted,
                          letterSpacing: 1,
                          textTransform: "uppercase",
                        },
                      ]}
                    >
                      Your daily edge
                    </Text>
                  </View>
                  <Text style={[theme.typography.h3, { color: colors.textPrimary }]}>
                    Facts tuned to your courses
                  </Text>
                  <Text
                    style={[
                      theme.typography.body,
                      { color: colors.textSecondary, marginTop: 6, lineHeight: 24 },
                    ]}
                  >
                    Upload your study materials or set up offline AI and this card fills with
                    facts and definitions from your own notes — no internet needed.
                  </Text>
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                    <Pressable
                      onPress={() => go("OfflineModels")}
                      style={{
                        flex: 1,
                        alignItems: "center",
                        paddingVertical: 10,
                        borderRadius: 12,
                        backgroundColor: colors.accent,
                      }}
                    >
                      <Text style={{ fontFamily: "PlusJakartaSans_600SemiBold", fontSize: 13, color: "#170B26" }}>
                        Set up offline AI
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => goTab("Vault")}
                      style={{
                        flex: 1,
                        alignItems: "center",
                        paddingVertical: 10,
                        borderRadius: 12,
                        borderWidth: 1.5,
                        borderColor: colors.borderStrong,
                      }}
                    >
                      <Text style={{ fontFamily: "PlusJakartaSans_600SemiBold", fontSize: 13, color: colors.textPrimary }}>
                        Upload materials
                      </Text>
                    </Pressable>
                  </View>
                </>
              )}
            </Surface>
          </View>

          {/* Vault + next class */}
          <View style={{ paddingHorizontal: 24, marginTop: 8 }}>
            <Pressable onPress={() => goTab("Vault")}>
              <Surface style={{ padding: 18, marginBottom: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
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
                    <Icon name="vault" size={21} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>
                      The Vault
                    </Text>
                    <Text style={[theme.typography.caption, { color: colors.textMuted }]}>
                      Past questions & materials from students like you
                    </Text>
                  </View>
                  <Icon name="chevronRight" size={18} color={colors.textMuted} />
                </View>
              </Surface>
            </Pressable>

            <Pressable onPress={() => goTab("Study")}>
              <Surface style={{ padding: 18, marginBottom: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
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
                    <Icon name="clock" size={21} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>
                      Today's next class
                    </Text>
                    <Text style={[theme.typography.caption, { color: colors.textMuted }]}>
                      Set up your timetable in Study to see it here
                    </Text>
                  </View>
                  <Icon name="chevronRight" size={18} color={colors.textMuted} />
                </View>
              </Surface>
            </Pressable>

            <Pressable onPress={() => go("Explore")}>
              <Surface style={{ padding: 18, marginBottom: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
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
                    <Icon name="megaphone" size={21} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>
                      What's new
                    </Text>
                    <Text style={[theme.typography.caption, { color: colors.textMuted }]}>
                      Announcements & events from your association
                    </Text>
                  </View>
                  <Icon name="chevronRight" size={18} color={colors.textMuted} />
                </View>
              </Surface>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedScreen>
  );
}
