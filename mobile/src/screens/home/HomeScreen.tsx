import React, { useCallback, useEffect, useState } from "react";
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
import { ProfileAvatar } from "../../components/ProfileAvatar";
import { Icon, type IconName } from "../../components/icons";
import { useAuth } from "../../contexts/AuthContext";
import { useNotifications } from "../../contexts/NotificationsContext";
import { useOfflineAi } from "../../offline/OfflineAiContext";
import { markTodoDone } from "../../utils/todos";
import { api } from "../../api/client";
import { getTodoState, type TodoState } from "../../utils/todos";
import { getStreak, type StreakState } from "../../utils/streak";
import { syncStreakReminder } from "../../utils/streakReminder";
import { getTimetable, nextClass, minutesToLabel, DAY_LABELS, type TimetableEntry } from "../../utils/timetable";
import { getDeadlines, deadlineStatus, type Deadline } from "../../utils/deadlines";
import { checkTodoBadge } from "../../utils/badges";
import { queueCelebrations } from "../../utils/celebrations";
import type { PendingCelebration } from "../../utils/badgeDesign";
import { HomeBannerStrip } from "../../components/HomeBanner";
import type { MainTabParamList } from "../../navigation/types";
import type { Announcement, Association } from "../../types/api";

type Props = BottomTabScreenProps<MainTabParamList, "Home">;

/** Payload for the device-local first_foundations trigger (to-do's done). */
function firstFoundationsCelebration(): PendingCelebration {
  return {
    id: "all_todos",
    title: "First Foundations",
    body: "You set up your timetable, offline AI, materials and profile — Matriq is officially yours.",
    rarity: "common",
    icon: "seed",
    earnedAt: new Date().toISOString(),
  };
}

function todayLabel(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/**
 * Home — "what should I do now?"
 *
 * Four cards, in order, each with one job (Apple inset-grouped rhythm):
 *   1. Get started   — setup checklist; vanishes when done (visible relief)
 *   2. This week     — next class + nearest deadline; real data or no card
 *   3. Quick actions — 4 tiles, one tap each
 *   4. Announcements — only when the association has posted something
 *
 * Nothing else. The streak is a heartbeat beside the date, not a trophy.
 * Every card earns its pixels with the Relief Test.
 */
export function HomeScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const { user } = useAuth();
  const { downloaded } = useOfflineAi();
  const { unreadCount, refreshUnread } = useNotifications();

  const [date, setDate] = useState(todayLabel());
  const [todos, setTodos] = useState<TodoState>({
    timetable: false,
    offlineAi: false,
    materials: false,
    photo: false,
  });
  const [streak, setStreak] = useState<StreakState>({
    current: 0,
    best: 0,
    lastActiveDay: "",
  });
  const [nextClassEntry, setNextClassEntry] = useState<TimetableEntry | null>(null);
  const [nextDeadline, setNextDeadline] = useState<Deadline | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  // Reload everything real whenever Home comes into focus.
  useFocusEffect(
    useCallback(() => {
      setDate(todayLabel());
      (async () => {
        setTodos(await getTodoState());
        setNextClassEntry(nextClass(await getTimetable()));
        const deadlines = await getDeadlines();
        setNextDeadline(
          deadlines.find((d) => !d.done && d.dueAt > Date.now() - 86_400_000) ?? null,
        );
        const streakState = await getStreak();
        setStreak(streakState);
        // Keep the evening streak nudge pointing at the next day that matters.
        void syncStreakReminder(streakState);
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
                .slice(0, 3),
            );
          }
        } catch {
          // Announcements are a nice-to-have on Home; fail silently.
        }
      })();
    }, []),
  );

  // When offline-AI models are installed, keep the persisted to-do in sync
  // (the Get started card and the badge both depend on it).
  useEffect(() => {
    const hasModels = Object.keys(downloaded).length > 0;
    if (hasModels) {
      void markTodoDone("offlineAi").then((state) => setTodos(state));
    }
  }, [downloaded]);

  // When all four to-do's are done → first badge (checked once per focus).
  useEffect(() => {
    const allDone =
      todos.timetable && todos.offlineAi && todos.materials && todos.photo;
    if (allDone) {
      void checkTodoBadge().then(async (id) => {
        if (!id) return;
        await queueCelebrations([firstFoundationsCelebration()]);
      });
    }
  }, [todos]);

  const stackNav = navigation.getParent();
  const go = (screen: string) => {
    const parent = stackNav as { navigate: (s: string) => void } | undefined;
    parent?.navigate(screen);
  };
  const goTab = (tab: keyof MainTabParamList) => navigation.navigate(tab);

  // With a model downloaded, the AI entry opens the chat directly;
  // otherwise it opens the model picker to download one first.
  const hasModels = Object.keys(downloaded).length > 0;
  const goAi = () => go(hasModels ? "AiChat" : "OfflineModels");

  const firstName = user?.fullName?.split(" ")[0] ?? "there";

  const todosList: Array<{
    id: keyof TodoState;
    label: string;
    icon: IconName;
    onPress: () => void;
  }> = [
    { id: "timetable", label: "Set up your timetable", icon: "calendar", onPress: () => go("Timetable") },
    { id: "offlineAi", label: "Download the offline AI", icon: "sparkle", onPress: goAi },
    { id: "materials", label: "Upload study materials", icon: "book", onPress: () => go("MyMaterials") },
    { id: "photo", label: "Add a profile photo", icon: "user", onPress: () => go("Profile") },
  ];
  const remainingTodos = todosList.filter((t) => !todos[t.id]);
  const deadlineStatusInfo = nextDeadline ? deadlineStatus(nextDeadline) : null;

  const quickActions: Array<{ label: string; icon: IconName; onPress: () => void }> = [
    { label: "AI", icon: "sparkle", onPress: goAi },
    { label: "Library", icon: "book", onPress: () => goTab("Vault") },
    { label: "Notes", icon: "pen", onPress: () => go("Notes") },
    { label: "CGPA", icon: "target", onPress: () => go("CgpaCalculator") },
  ];

  return (
    <ThemedScreen>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header — name, date, streak heartbeat, notifications */}
          <View style={{ paddingHorizontal: 24, paddingTop: 18 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Pressable onPress={() => go("Profile")}>
                <View
                  style={{
                    borderRadius: 999,
                    borderWidth: 2,
                    borderColor: colors.accent + "66",
                  }}
                >
                  <ProfileAvatar
                    url={user?.profilePhotoUrl ?? null}
                    name={user?.fullName}
                    size={46}
                  />
                </View>
              </Pressable>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[theme.typography.h3, { color: colors.textPrimary }]} numberOfLines={1}>
                  {firstName}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={[theme.typography.caption, { color: colors.textMuted }]}>{date}</Text>
                  {/* Streak heartbeat — only when it exists. A zero is noise. */}
                  {streak.current > 0 ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                      <Icon name="flame" size={13} color={colors.accent} />
                      <Text style={[theme.typography.captionBold, { color: colors.textSecondary }]}>
                        {streak.current}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
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
                        fontFamily: theme.typography.captionBold.fontFamily,
                        fontSize: 10,
                        color: colors.onAccent,
                      }}
                    >
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          </View>

          {/* Quiet broadcast strip — only when admins posted something */}
          <HomeBannerStrip />

          {/* 1 — Get started. Exists ONLY while setup remains; vanishes when done. */}
          {remainingTodos.length > 0 ? (
            <View style={{ paddingHorizontal: 24, marginTop: 20 }}>
              <Surface style={{ paddingVertical: 6 }}>
                <Text
                  style={[
                    theme.typography.captionBold,
                    {
                      color: colors.textMuted,
                      textTransform: "uppercase",
                      letterSpacing: 1,
                      fontSize: 11,
                      paddingHorizontal: 16,
                      paddingTop: 12,
                      paddingBottom: 4,
                    },
                  ]}
                >
                  Get started
                </Text>
                {remainingTodos.map((todo, i) => (
                  <Pressable
                    key={todo.id}
                    onPress={todo.onPress}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      opacity: pressed ? 0.6 : 1,
                      borderTopWidth: i === 0 ? 0 : 1,
                      borderTopColor: colors.border,
                    })}
                    accessibilityRole="button"
                    accessibilityLabel={todo.label}
                  >
                    <Icon name={todo.icon} size={19} color={colors.textSecondary} />
                    <Text style={[theme.typography.body, { color: colors.textPrimary, flex: 1, marginLeft: 12 }]}>
                      {todo.label}
                    </Text>
                    <Icon name="chevronRight" size={16} color={colors.textMuted} />
                  </Pressable>
                ))}
              </Surface>
            </View>
          ) : null}

          {/* 2 — This week. The agenda, nothing else. Real rows or no card. */}
          {nextClassEntry || deadlineStatusInfo ? (
            <View style={{ paddingHorizontal: 24, marginTop: 20 }}>
              <Surface style={{ paddingVertical: 6 }}>
                <Text
                  style={[
                    theme.typography.captionBold,
                    {
                      color: colors.textMuted,
                      textTransform: "uppercase",
                      letterSpacing: 1,
                      fontSize: 11,
                      paddingHorizontal: 16,
                      paddingTop: 12,
                      paddingBottom: 4,
                    },
                  ]}
                >
                  This week
                </Text>
                {nextClassEntry ? (
                  <Pressable
                    onPress={() => go("Timetable")}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      opacity: pressed ? 0.6 : 1,
                      borderTopWidth: 0,
                    })}
                    accessibilityRole="button"
                    accessibilityLabel="Next class"
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[theme.typography.body, { color: colors.textPrimary }]} numberOfLines={1}>
                        {nextClassEntry.title}
                      </Text>
                      <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 1 }]}>
                        Next class · {DAY_LABELS[nextClassEntry.day]} · {minutesToLabel(nextClassEntry.startMin)}
                      </Text>
                    </View>
                    <Icon name="chevronRight" size={16} color={colors.textMuted} />
                  </Pressable>
                ) : null}
                {deadlineStatusInfo && nextDeadline ? (
                  <Pressable
                    onPress={() => go("DeadlineTracker")}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      opacity: pressed ? 0.6 : 1,
                      borderTopWidth: nextClassEntry ? 1 : 0,
                      borderTopColor: colors.border,
                    })}
                    accessibilityRole="button"
                    accessibilityLabel="Deadline"
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[theme.typography.body, { color: colors.textPrimary }]} numberOfLines={1}>
                        {nextDeadline.title}
                      </Text>
                      <Text
                        style={[
                          theme.typography.caption,
                          {
                            color: deadlineStatusInfo.urgent ? colors.warning : colors.textMuted,
                            marginTop: 1,
                            fontWeight: deadlineStatusInfo.urgent ? "600" : "400",
                          },
                        ]}
                      >
                        {deadlineStatusInfo.label}
                      </Text>
                    </View>
                    <Icon name="chevronRight" size={16} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              </Surface>
            </View>
          ) : null}

          {/* 3 — Quick actions. Four tiles, one tap each. */}
          <View style={{ paddingHorizontal: 24, marginTop: 20 }}>
            <Surface style={{ padding: 12 }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {quickActions.map((action) => (
                  <Pressable
                    key={action.label}
                    onPress={action.onPress}
                    style={({ pressed }) => ({
                      width: "50%",
                      alignItems: "center",
                      paddingVertical: 16,
                      borderRadius: theme.radii.md,
                      opacity: pressed ? 0.6 : 1,
                    })}
                    accessibilityRole="button"
                    accessibilityLabel={action.label}
                  >
                    <View
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 13,
                        backgroundColor: colors.surfaceAlt,
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 8,
                      }}
                    >
                      <Icon name={action.icon} size={20} color={colors.textPrimary} />
                    </View>
                    <Text style={[theme.typography.captionBold, { color: colors.textPrimary }]}>
                      {action.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Surface>
          </View>

          {/* 4 — Announcements. Only when they exist; an empty Home is calm. */}
          {announcements.length > 0 ? (
            <View style={{ paddingHorizontal: 24, marginTop: 20 }}>
              <Surface style={{ paddingVertical: 6 }}>
                {announcements.map((a, i) => (
                  <Pressable
                    key={a.id}
                    onPress={() => go("Explore")}
                    style={({ pressed }) => ({
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      opacity: pressed ? 0.6 : 1,
                      borderTopWidth: i === 0 ? 0 : 1,
                      borderTopColor: colors.border,
                    })}
                    accessibilityRole="button"
                    accessibilityLabel={a.title}
                  >
                    <Text style={[theme.typography.bodyMedium, { color: colors.textPrimary }]} numberOfLines={1}>
                      {a.title}
                    </Text>
                    <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 2 }]} numberOfLines={2}>
                      {a.body}
                    </Text>
                  </Pressable>
                ))}
              </Surface>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedScreen>
  );
}
