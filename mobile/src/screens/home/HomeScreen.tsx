import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../../theme/ThemeContext";
import { Surface, ThemedScreen } from "../../components/Surface";
import { FactCard } from "../../components/FactCard";
import { Icon, type IconName } from "../../components/icons";
import { useAuth } from "../../contexts/AuthContext";
import { useNotifications } from "../../contexts/NotificationsContext";
import { useOfflineAi } from "../../offline/OfflineAiContext";
import { factForTick } from "../../utils/facts";
import { useDailyFacts } from "../../utils/dailyFacts";
import { api } from "../../api/client";
import { getTodoState, markTodoDone, type TodoState } from "../../utils/todos";
import { timeAgo } from "../../utils/relativeTime";
import { getTimetable, nextClass, minutesToLabel, DAY_LABELS, type TimetableEntry } from "../../utils/timetable";
import { checkTodoBadge, BADGES, type Badge } from "../../utils/badges";
import { CelebrationOverlay } from "../../components/CelebrationOverlay";
import type { MainTabParamList } from "../../navigation/types";
import type { Announcement, Association } from "../../types/api";

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
  const { unreadCount, refreshUnread } = useNotifications();
  const facts = useDailyFacts();

  const [now, setNow] = useState(liveClock());
  const [tick, setTick] = useState(0);
  const [todos, setTodos] = useState<TodoState>({
    timetable: false,
    offlineAi: false,
    materials: false,
    photo: false,
  });
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [nextClassEntry, setNextClassEntry] = useState<TimetableEntry | null>(null);
  const [celebration, setCelebration] = useState<Badge | null>(null);

  useEffect(() => {
    const clock = setInterval(() => setNow(liveClock()), 30_000);
    const facts = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => {
      clearInterval(clock);
      clearInterval(facts);
    };
  }, []);

  // Reload on-disk to-do state + next class + announcements whenever Home
  // comes into focus, so completing a task elsewhere updates this row.
  useFocusEffect(
    useCallback(() => {
      (async () => {
        setTodos(await getTodoState());
        setNextClassEntry(nextClass(await getTimetable()));
        void refreshUnread();

        try {
          const memberships = await api.get<{
            memberships: Array<{ association: Association }>;
          }>("/me/memberships");
          const assoc = memberships.memberships[0]?.association;
          if (assoc) {
            const data = await api.get<{ announcements: Announcement[] }>(
              `/associations/${assoc.id}/announcements`,
            );
            setAnnouncements(
              data.announcements
                .slice()
                .sort(
                  (a, b) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
                )
                .slice(0, 6),
            );
          }
        } catch {
          // Announcements are a nice-to-have on Home; fail silently.
        }
      })();
    }, []),
  );

  // When offline-AI models are installed, keep the persisted to-do in sync
  // (the to-do row and the badge both depend on it).
  useEffect(() => {
    const hasModels = Object.keys(downloaded).length > 0;
    if (hasModels) {
      void markTodoDone("offlineAi").then((state) => setTodos(state));
      void checkTodoBadge().then((id) => {
        if (id) setCelebration(BADGES.find((b) => b.id === id) ?? null);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.keys(downloaded).length]);

  // On every to-do refresh, check whether all four are done → first badge.
  useEffect(() => {
    const allDone =
      todos.timetable && todos.offlineAi && todos.materials && todos.photo;
    if (allDone) {
      void checkTodoBadge().then((id) => {
        if (id) setCelebration(BADGES.find((b) => b.id === id) ?? null);
      });
    }
  }, [todos]);

  const stackNav = navigation.getParent();
  const go = (screen: string) => {
    const parent = stackNav as { navigate: (s: string) => void } | undefined;
    parent?.navigate(screen);
  };
  const goTab = (tab: keyof MainTabParamList) => navigation.navigate(tab);
  // With a model downloaded, the offline-AI entry opens the chat directly;
  // otherwise it opens the model picker to download one first.
  const hasModels = Object.keys(downloaded).length > 0;
  const goOfflineAi = () => go(hasModels ? "AiChat" : "OfflineModels");

  const todosList: Todo[] = [
    {
      id: "timetable",
      label: "Set up your timetable",
      hint: "Your week, planned",
      icon: "calendar",
      done: todos.timetable,
      onPress: () => go("Timetable"),
    },
    {
      id: "offline-ai",
      label: "Set up offline AI",
      hint: "Works with no internet",
      icon: "sparkle",
      done: todos.offlineAi,
      onPress: goOfflineAi,
    },
    {
      id: "materials",
      label: "Upload study materials",
      hint: "Your own library",
      icon: "book",
      done: todos.materials,
      onPress: () => go("MyMaterials"),
    },
    {
      id: "photo",
      label: "Add a profile photo",
      hint: "Make it yours",
      icon: "user",
      done: todos.photo,
      onPress: () => go("Profile"),
    },
  ];

  // Round-2 QA §5: completed to-do's disappear entirely — no checked state.
  const remainingTodos = todosList.filter((t) => !t.done);
  const allDone = remainingTodos.length === 0;
  const fact = factForTick(tick, facts);
  const initial = (user?.fullName?.trim().charAt(0) ?? "S").toUpperCase();
  const firstName = user?.fullName?.split(" ")[0] ?? "there";
  const verified = !!user?.emailVerified;

  return (
    <ThemedScreen>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
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
                <Text style={[theme.typography.h3, { color: colors.textPrimary }]} numberOfLines={1}>
                  Hello, {firstName}
                </Text>
                <Text style={[theme.typography.caption, { color: colors.textMuted }]}>{now}</Text>
              </View>
              {/* Notification bell — replaces the old "Verified" pill
                  (round-2 QA §5). Verification status lives in Settings. */}
              <Pressable
                onPress={() => go("Notifications")}
                accessibilityRole="button"
                accessibilityLabel={`Notifications, ${unreadCount} unread`}
                hitSlop={8}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  backgroundColor: colors.surface,
                  borderWidth: 1.5,
                  borderColor: colors.borderStrong,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="bell" size={20} color={colors.textPrimary} />
                {unreadCount > 0 ? (
                  <View
                    style={{
                      position: "absolute",
                      top: -3,
                      right: -3,
                      minWidth: 19,
                      height: 19,
                      borderRadius: 10,
                      backgroundColor: colors.accent,
                      borderWidth: 2,
                      borderColor: colors.bg,
                      alignItems: "center",
                      justifyContent: "center",
                      paddingHorizontal: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "PlusJakartaSans_700Bold",
                        fontSize: 10,
                        color: "#170B26",
                      }}
                    >
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          </View>

          {/* My To-Do's — completed items disappear entirely (§5) */}
          {!allDone ? (
            <View style={{ marginTop: 24 }}>
              <Text style={[theme.typography.h3, { color: colors.textPrimary, paddingHorizontal: 24, marginBottom: 12 }]}>
                My To-Do's
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 24, gap: 12 }}
              >
                {remainingTodos.map((todo) => (
                  <Pressable key={todo.id} onPress={todo.onPress} style={{ width: 150 }}>
                    <Surface style={{ padding: 14, width: 150, marginBottom: 0 }}>
                      <View
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 11,
                          backgroundColor: colors.surfaceAlt,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Icon name={todo.icon} size={17} color={colors.brand} />
                      </View>
                      <Text style={[theme.typography.captionBold, { color: colors.textPrimary, marginTop: 10, lineHeight: 18 }]}>
                        {todo.label}
                      </Text>
                      <Text style={[theme.typography.small, { color: colors.textMuted, marginTop: 2 }]}>{todo.hint}</Text>
                    </Surface>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* Hero — rotating fact, or nudge when no materials/AI */}
          <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
            {todos.offlineAi ? (
              <FactCard fact={fact} label="just for you" />
            ) : (
              <Surface variant="sticker" style={{ padding: 20 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <Icon name="sparkle" size={16} color={colors.accent} />
                  <Text style={[theme.typography.small, { color: colors.textMuted, letterSpacing: 1, textTransform: "uppercase" }]}>
                    Your daily edge
                  </Text>
                </View>
                <Text style={[theme.typography.h3, { color: colors.textPrimary }]}>
                  Facts tuned to your courses
                </Text>
                <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 6, lineHeight: 24 }]}>
                  Upload your study materials or set up offline AI and this card fills with
                  facts and definitions from your own notes — no internet needed.
                </Text>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                  <Pressable
                    onPress={goOfflineAi}
                    style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 12, backgroundColor: colors.accent }}
                  >
                    <Text style={{ fontFamily: "PlusJakartaSans_600SemiBold", fontSize: 13, color: "#170B26" }}>
                      {hasModels ? "Chat with offline AI" : "Set up offline AI"}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => go("MyMaterials")}
                    style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderStrong }}
                  >
                    <Text style={{ fontFamily: "PlusJakartaSans_600SemiBold", fontSize: 13, color: colors.textPrimary }}>
                      Upload materials
                    </Text>
                  </Pressable>
                </View>
              </Surface>
            )}
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
                    <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>The Vault</Text>
                    <Text style={[theme.typography.caption, { color: colors.textMuted }]}>
                      Past questions & materials from students like you
                    </Text>
                  </View>
                  <Icon name="chevronRight" size={18} color={colors.textMuted} />
                </View>
              </Surface>
            </Pressable>

            <Pressable onPress={() => go("Timetable")}>
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
                      {nextClassEntry ? nextClassEntry.title : "Today's next class"}
                    </Text>
                    <Text style={[theme.typography.caption, { color: colors.textMuted }]}>
                      {nextClassEntry
                        ? `${DAY_LABELS[nextClassEntry.day]} · ${minutesToLabel(nextClassEntry.startMin)}`
                        : "Set up your timetable in Study to see it here"}
                    </Text>
                  </View>
                  <Icon name="chevronRight" size={18} color={colors.textMuted} />
                </View>
              </Surface>
            </Pressable>
          </View>

          {/* Announcements — confined-space cards (spec §6) */}
          {announcements.length > 0 ? (
            <View style={{ marginTop: 22 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: 24,
                  marginBottom: 12,
                }}
              >
                <Text style={[theme.typography.h3, { color: colors.textPrimary }]}>Announcements</Text>
                <Pressable onPress={() => go("Explore")}>
                  <Text style={[theme.typography.captionBold, { color: colors.brand }]}>See all</Text>
                </Pressable>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 24, gap: 12 }}
              >
                {announcements.map((a) => (
                  <Pressable key={a.id} onPress={() => go("Explore")} style={{ width: 220 }}>
                    <Surface style={{ padding: 16, width: 220, height: 132, justifyContent: "space-between" }}>
                      <View>
                        <Text style={[theme.typography.captionBold, { color: colors.textPrimary }]} numberOfLines={2}>
                          {a.title}
                        </Text>
                        <Text style={[theme.typography.small, { color: colors.textSecondary, marginTop: 6, lineHeight: 17 }]} numberOfLines={3}>
                          {a.body}
                        </Text>
                      </View>
                      <Text style={[theme.typography.small, { color: colors.textMuted }]}>
                        {a.author.name} · {timeAgo(a.createdAt)}
                      </Text>
                    </Surface>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>

      {celebration ? (
        <CelebrationOverlay
          visible={!!celebration}
          badge={celebration}
          onClose={() => setCelebration(null)}
        />
      ) : null}
    </ThemedScreen>
  );
}
