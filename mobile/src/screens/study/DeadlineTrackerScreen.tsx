import React, { useEffect, useState } from "react";
import { View, Text, SafeAreaView, ScrollView, Pressable, TextInput } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { ThemedScreen } from "../../components/Surface";
import { Icon } from "../../components/icons";
import {
  getDeadlines,
  addDeadline,
  toggleDeadline,
  removeDeadline,
  deadlineStatus,
  type Deadline,
} from "../../utils/deadlines";

/** Deadline tracker (spec §9 extras) — offline-first, with quick due chips. */
const QUICK_DUE = [
  { label: "Today", days: 0 },
  { label: "Tomorrow", days: 1 },
  { label: "In 3 days", days: 3 },
  { label: "In a week", days: 7 },
  { label: "In 2 weeks", days: 14 },
];

export function DeadlineTrackerScreen() {
  const { theme } = useTheme();
  const colors = theme.colors;

  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState("");
  const [dueDays, setDueDays] = useState(3);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getDeadlines().then(setDeadlines);
  }, []);

  const submit = async () => {
    if (!title.trim()) {
      setError("Give the deadline a name (e.g. CHM 101 assignment).");
      return;
    }
    const next = await addDeadline({
      title: title.trim(),
      course: course.trim() || undefined,
      dueAt: Date.now() + dueDays * 86_400_000,
    });
    setDeadlines(next);
    setTitle("");
    setCourse("");
    setError(null);
  };

  return (
    <ThemedScreen>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[theme.typography.display, { color: colors.textPrimary }]}>Deadlines</Text>
          <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 4 }]}>
            Never miss a submission.
          </Text>

          {/* Add */}
          <View
            style={{
              marginTop: 18,
              padding: 16,
              borderRadius: theme.radii.lg,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="What's due?"
              placeholderTextColor={colors.textMuted}
              style={field(colors, theme.radii)}
            />
            <TextInput
              value={course}
              onChangeText={setCourse}
              placeholder="Course (optional)"
              placeholderTextColor={colors.textMuted}
              style={[field(colors, theme.radii), { marginTop: 10 }]}
            />
            <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 12, marginBottom: 8 }]}>
              Due
            </Text>
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              {QUICK_DUE.map((q) => (
                <Pressable
                  key={q.label}
                  onPress={() => setDueDays(q.days)}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: theme.radii.pill,
                    backgroundColor: dueDays === q.days ? colors.accent : colors.surfaceAlt,
                    borderWidth: 1,
                    borderColor: dueDays === q.days ? "transparent" : colors.border,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "PlusJakartaSans_600SemiBold",
                      fontSize: 12,
                      color: dueDays === q.days ? "#170B26" : colors.textPrimary,
                    }}
                  >
                    {q.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {error ? (
              <Text style={[theme.typography.caption, { color: colors.error, marginTop: 8 }]}>{error}</Text>
            ) : null}
            <Pressable
              onPress={() => void submit()}
              style={{
                marginTop: 14,
                alignItems: "center",
                paddingVertical: 13,
                borderRadius: theme.radii.md,
                backgroundColor: colors.accent,
                borderWidth: theme.mode === "pop" ? 2 : 0,
                borderColor: colors.borderStrong,
              }}
            >
              <Text style={{ fontFamily: "PlusJakartaSans_700Bold", fontSize: 15, color: "#170B26" }}>Add deadline</Text>
            </Pressable>
          </View>

          {/* List */}
          {deadlines.length > 0 ? (
            <View style={{ marginTop: 20, gap: 10 }}>
              {deadlines.map((d) => {
                const status = deadlineStatus(d);
                return (
                  <View
                    key={d.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      padding: 14,
                      borderRadius: theme.radii.md,
                      backgroundColor: colors.surfaceAlt,
                      borderWidth: 1,
                      borderColor: status.urgent ? colors.error + "44" : colors.border,
                    }}
                  >
                    <Pressable
                      onPress={() => void toggleDeadline(d.id).then(setDeadlines)}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 9,
                        backgroundColor: d.done ? colors.success : colors.surface,
                        borderWidth: 1.5,
                        borderColor: d.done ? colors.success : colors.borderStrong,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {d.done ? <Icon name="check" size={14} color="#170B26" /> : null}
                    </Pressable>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          theme.typography.bodyBold,
                          { color: d.done ? colors.textMuted : colors.textPrimary, textDecorationLine: d.done ? "line-through" : "none" },
                        ]}
                      >
                        {d.title}
                      </Text>
                      {d.course ? (
                        <Text style={[theme.typography.caption, { color: colors.textMuted }]}>{d.course}</Text>
                      ) : null}
                    </View>
                    <Text
                      style={[
                        theme.typography.captionBold,
                        { color: d.done ? colors.textMuted : status.urgent ? colors.error : colors.textSecondary },
                      ]}
                    >
                      {status.label}
                    </Text>
                    <Pressable onPress={() => void removeDeadline(d.id).then(setDeadlines)} hitSlop={8}>
                      <Icon name="trash" size={16} color={colors.textMuted} />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={{ marginTop: 28, alignItems: "center" }}>
              <Icon name="calendar" size={34} color={colors.textMuted} />
              <Text style={[theme.typography.body, { color: colors.textMuted, marginTop: 12, textAlign: "center", maxWidth: 260 }]}>
                No deadlines yet. Add your first assignment above.
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedScreen>
  );
}

function field(colors: import("../../theme/themes").MatriqThemeColors, radii: { md: number }) {
  return {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    fontFamily: "PlusJakartaSans_400Regular",
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 11,
  };
}
