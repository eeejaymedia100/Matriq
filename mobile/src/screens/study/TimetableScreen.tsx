import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  Pressable,
  TextInput,
} from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { ThemedScreen } from "../../components/Surface";
import { Icon } from "../../components/icons";
import {
  getTimetable,
  addTimetableEntry,
  removeTimetableEntry,
  nextClass,
  DAY_LABELS,
  DAY_SHORT,
  minutesToLabel,
  labelToMinutes,
  type TimetableEntry,
} from "../../utils/timetable";
import { markTodoDone } from "../../utils/todos";
import { checkTodoBadge } from "../../utils/badges";

/** Weekly timetable (spec §9 #3) — stored on-device, offline-first. */
export function TimetableScreen() {
  const { theme } = useTheme();
  const colors = theme.colors;

  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [title, setTitle] = useState("");
  const [day, setDay] = useState(0);
  const [start, setStart] = useState("9:00 AM");
  const [end, setEnd] = useState("10:00 AM");
  const [location, setLocation] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    void getTimetable().then(setEntries);
  }, []);

  const submit = async () => {
    const s = labelToMinutes(start);
    const e = labelToMinutes(end);
    if (!title.trim()) {
      setFormError("Give the class a name (e.g. CHM 101).");
      return;
    }
    if (s === null || e === null || e <= s) {
      setFormError("Check the times — end must be after start.");
      return;
    }
    const next = await addTimetableEntry({
      title: title.trim(),
      day,
      startMin: s,
      endMin: e,
      location: location.trim() || undefined,
    });
    setEntries(next);
    setTitle("");
    setStart("9:00 AM");
    setEnd("10:00 AM");
    setLocation("");
    setFormError(null);
    await markTodoDone("timetable");
    await checkTodoBadge();
  };

  const remove = async (id: string) => {
    setEntries(await removeTimetableEntry(id));
  };

  const next = nextClass(entries);

  return (
    <ThemedScreen>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[theme.typography.display, { color: colors.textPrimary }]}>Timetable</Text>

          {next ? (
            <View
              style={{
                marginTop: 16,
                padding: 16,
                borderRadius: theme.radii.lg,
                backgroundColor: colors.surface,
                borderWidth: 1.5,
                borderColor: colors.accent + "66",
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 13,
                  backgroundColor: colors.surfaceAlt,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="clock" size={22} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[theme.typography.captionBold, { color: colors.textMuted }]}>NEXT CLASS</Text>
                <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>{next.title}</Text>
                <Text style={[theme.typography.caption, { color: colors.textSecondary }]}>
                  {DAY_LABELS[next.day]} · {minutesToLabel(next.startMin)}
                  {next.location ? ` · ${next.location}` : ""}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Add form */}
          <View
            style={{
              marginTop: 16,
              padding: 16,
              borderRadius: theme.radii.lg,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>Add a class</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. CHM 101 — Organic Chemistry"
              placeholderTextColor={colors.textMuted}
              style={field(colors, theme.radii)}
            />

            <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 12, marginBottom: 6 }]}>Day</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {DAY_SHORT.map((d, i) => (
                <Pressable
                  key={d}
                  onPress={() => setDay(i)}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 13,
                    borderRadius: theme.radii.pill,
                    backgroundColor: day === i ? colors.accent : colors.surfaceAlt,
                    borderWidth: 1,
                    borderColor: day === i ? "transparent" : colors.border,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "PlusJakartaSans_600SemiBold",
                      fontSize: 12,
                      color: day === i ? "#170B26" : colors.textPrimary,
                    }}
                  >
                    {d}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={[theme.typography.caption, { color: colors.textMuted, marginBottom: 4 }]}>Start</Text>
                <TextInput
                  value={start}
                  onChangeText={setStart}
                  placeholder="9:00 AM"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                  style={field(colors, theme.radii)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[theme.typography.caption, { color: colors.textMuted, marginBottom: 4 }]}>End</Text>
                <TextInput
                  value={end}
                  onChangeText={setEnd}
                  placeholder="10:00 AM"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                  style={field(colors, theme.radii)}
                />
              </View>
            </View>
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="Location (optional)"
              placeholderTextColor={colors.textMuted}
              style={[field(colors, theme.radii), { marginTop: 10 }]}
            />

            {formError ? (
              <Text style={[theme.typography.caption, { color: colors.error, marginTop: 8 }]}>{formError}</Text>
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
              <Text style={{ fontFamily: "PlusJakartaSans_700Bold", fontSize: 15, color: "#170B26" }}>Add to timetable</Text>
            </Pressable>
          </View>

          {/* Week grid */}
          {entries.length > 0 ? (
            <View style={{ marginTop: 22 }}>
              {DAY_LABELS.map((label, d) => {
                const dayEntries = entries.filter((e) => e.day === d).sort((a, b) => a.startMin - b.startMin);
                if (dayEntries.length === 0) return null;
                return (
                  <View key={label} style={{ marginBottom: 14 }}>
                    <Text style={[theme.typography.captionBold, { color: colors.textMuted, marginBottom: 8 }]}>
                      {label}
                    </Text>
                    <View style={{ gap: 8 }}>
                      {dayEntries.map((e) => (
                        <View
                          key={e.id}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 10,
                            padding: 13,
                            borderRadius: theme.radii.md,
                            backgroundColor: colors.surfaceAlt,
                            borderWidth: 1,
                            borderColor: colors.border,
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>{e.title}</Text>
                            <Text style={[theme.typography.caption, { color: colors.textSecondary }]}>
                              {minutesToLabel(e.startMin)} – {minutesToLabel(e.endMin)}
                              {e.location ? ` · ${e.location}` : ""}
                            </Text>
                          </View>
                          <Pressable onPress={() => void remove(e.id)} hitSlop={8}>
                            <Icon name="trash" size={17} color={colors.error} />
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}
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
    marginTop: 10,
  };
}
