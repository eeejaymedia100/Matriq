import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../theme/ThemeContext";
import { ThemedScreen } from "../../components/Surface";
import { Icon } from "../../components/icons";
import {
  calculateCgpa,
  cgpaClassification,
  predictGpaRequired,
  gradePoints,
  gradeLabel,
  addCgpaHistory,
  type CgpaHistoryRow,
  type CourseGrade,
  type PredictorInput,
} from "../../utils/cgpa";

/**
 * CGPA Calculator + Predictor (spec §8). Exact NUC 5-point scale and the
 * predictor's QP formula, straight from the spec — no improvising.
 */

interface CourseRow extends CourseGrade {
  id: string;
}

const DEFAULT_SCORE = "0";
const DEFAULT_UNITS = "3";

export function CgpaCalculatorScreen() {
  const { theme } = useTheme();
  const colors = theme.colors;

  const [rows, setRows] = useState<CourseRow[]>([]);
  const [name, setName] = useState("");
  const [units, setUnits] = useState(DEFAULT_UNITS);
  const [score, setScore] = useState(DEFAULT_SCORE);
  const [history, setHistory] = useState<CgpaHistoryRow[]>([]);

  // ── Predictor state ───────────────────────────────────────────
  const [currentCgpa, setCurrentCgpa] = useState("3.00");
  const [unitsCompleted, setUnitsCompleted] = useState("60");
  const [targetCgpa, setTargetCgpa] = useState("4.50");
  const [timeframe, setTimeframe] = useState<{ label: string; semesters: number }>({
    label: "Next semester",
    semesters: 1,
  });
  const [unitsPerSemester, setUnitsPerSemester] = useState("15");

  const addCourse = () => {
    const u = Number(units) || 0;
    const s = Number(score) || 0;
    if (u <= 0 || s < 0 || s > 100) return;
    setRows((r) => [
      ...r,
      {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        name: name.trim() || `Course ${r.length + 1}`,
        units: u,
        score: s,
      },
    ]);
    setName("");
  };

  const removeCourse = (id: string) =>
    setRows((r) => r.filter((c) => c.id !== id));

  const result = calculateCgpa(rows);

  const saveToHistory = async () => {
    if (rows.length === 0 || result.totalUnits === 0) return;
    const next = await addCgpaHistory({
      label: `Semester ${history.length + 1}`,
      cgpa: result.cgpa,
      totalUnits: result.totalUnits,
    });
    setHistory(next);
    setRows([]);
  };

  const predictorInput: PredictorInput = {
    currentCgpa: Number(currentCgpa) || 0,
    unitsCompleted: Number(unitsCompleted) || 0,
    targetCgpa: Number(targetCgpa) || 0,
    semesters: timeframe.semesters,
    unitsPerSemester: Number(unitsPerSemester) || 0,
  };
  const prediction =
    Number(unitsPerSemester) > 0 && predictorInput.unitsCompleted > 0
      ? predictGpaRequired(predictorInput)
      : null;

  const timeframeChoices = [
    { label: "Next semester", semesters: 1 },
    { label: "This academic year", semesters: 2 },
    { label: "By final year", semesters: 4 },
  ];

  return (
    <ThemedScreen>
      <SafeAreaView style={{ flex: 1 }} edges={["bottom", "left", "right"]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Calculator ─────────────────────────────────────── */}
          <Text style={[theme.typography.display, { color: colors.textPrimary }]}>CGPA</Text>
          <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 4 }]}>
            NUC 5-point scale: A=70+ · B=60 · C=50 · D=45 · E=40 · F&lt;40
          </Text>

          {/* Add course */}
          <View
            style={{
              marginTop: 20,
              padding: 16,
              borderRadius: theme.radii.lg,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>Add a course</Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Course name (optional)"
                placeholderTextColor={colors.textMuted}
                style={{
                  flex: 1,
                  backgroundColor: colors.surfaceAlt,
                  borderRadius: theme.radii.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                  color: colors.textPrimary,
                  fontFamily: theme.typography.body.fontFamily,
                  fontSize: 15,
                  paddingHorizontal: 12,
                  paddingVertical: 11,
                }}
              />
            </View>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[theme.typography.caption, { color: colors.textMuted, marginBottom: 4 }]}>Units</Text>
                <TextInput
                  value={units}
                  onChangeText={(t) => setUnits(t.replace(/[^0-9]/g, "").slice(0, 2))}
                  keyboardType="number-pad"
                  style={inputStyle(colors, theme.radii)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[theme.typography.caption, { color: colors.textMuted, marginBottom: 4 }]}>Score (0–100)</Text>
                <TextInput
                  value={score}
                  onChangeText={(t) => setScore(t.replace(/[^0-9]/g, "").slice(0, 3))}
                  keyboardType="number-pad"
                  style={inputStyle(colors, theme.radii)}
                />
              </View>
              <Pressable
                onPress={addCourse}
                style={{
                  alignSelf: "flex-end",
                  width: 46,
                  height: 44,
                  borderRadius: theme.radii.md,
                  backgroundColor: colors.accent,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: theme.mode === "pop" ? 2 : 0,
                  borderColor: colors.borderStrong,
                }}
              >
                <Icon name="plus" size={20} color="#170B26" />
              </Pressable>
            </View>
          </View>

          {/* Course list */}
          {rows.length > 0 ? (
            <View style={{ marginTop: 14, gap: 8 }}>
              {rows.map((r) => (
                <View
                  key={r.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    padding: 12,
                    borderRadius: theme.radii.md,
                    backgroundColor: colors.surfaceAlt,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>{r.name}</Text>
                    <Text style={[theme.typography.caption, { color: colors.textMuted }]}>
                      {r.units} units · grade {gradeLabel(r.score)} ({gradePoints(r.score)} pts)
                    </Text>
                  </View>
                  <Pressable onPress={() => removeCourse(r.id)} hitSlop={8}>
                    <Icon name="trash" size={17} color={colors.error} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {/* Live result */}
          {rows.length > 0 ? (
            <View
              style={{
                marginTop: 16,
                padding: 18,
                borderRadius: theme.radii.lg,
                backgroundColor: colors.surface,
                borderWidth: 1.5,
                borderColor: colors.accent + "66",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10 }}>
                <Text style={[theme.typography.display, { color: colors.textPrimary }]}>
                  {result.cgpa.toFixed(2)}
                </Text>
                {/* Lime is never text on a light surface (§3) — use brand. */}
                <Text style={[theme.typography.captionBold, { color: colors.brand, textTransform: "uppercase" }]}>
                  {cgpaClassification(result.cgpa)}
                </Text>
              </View>
              <Text style={[theme.typography.caption, { color: colors.textSecondary, marginTop: 4 }]}>
                {result.totalUnits} units · {result.totalQualityPoints} quality points
              </Text>
              <Pressable
                onPress={() => void saveToHistory()}
                style={{
                  marginTop: 12,
                  alignSelf: "flex-start",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: theme.radii.pill,
                  backgroundColor: colors.accent,
                }}
              >
                <Text style={{ fontFamily: "PlusJakartaSans_600SemiBold", fontSize: 13, color: "#170B26" }}>
                  Save to history
                </Text>
              </Pressable>
            </View>
          ) : null}

          {/* ── Predictor ──────────────────────────────────────── */}
          <Text style={[theme.typography.h2, { color: colors.textPrimary, marginTop: 30 }]}>CGPA Predictor</Text>
          <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 4, lineHeight: 22 }]}>
            What average do you need going forward to hit your target?
          </Text>

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
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[theme.typography.caption, { color: colors.textMuted, marginBottom: 4 }]}>Current CGPA</Text>
                <TextInput
                  value={currentCgpa}
                  onChangeText={(t) => setCurrentCgpa(t.replace(/[^0-9.]/g, "").slice(0, 4))}
                  keyboardType="decimal-pad"
                  style={inputStyle(colors, theme.radii)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[theme.typography.caption, { color: colors.textMuted, marginBottom: 4 }]}>Units completed</Text>
                <TextInput
                  value={unitsCompleted}
                  onChangeText={(t) => setUnitsCompleted(t.replace(/[^0-9]/g, "").slice(0, 4))}
                  keyboardType="number-pad"
                  style={inputStyle(colors, theme.radii)}
                />
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[theme.typography.caption, { color: colors.textMuted, marginBottom: 4 }]}>Target CGPA</Text>
                <TextInput
                  value={targetCgpa}
                  onChangeText={(t) => setTargetCgpa(t.replace(/[^0-9.]/g, "").slice(0, 4))}
                  keyboardType="decimal-pad"
                  style={inputStyle(colors, theme.radii)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[theme.typography.caption, { color: colors.textMuted, marginBottom: 4 }]}>Units / semester</Text>
                <TextInput
                  value={unitsPerSemester}
                  onChangeText={(t) => setUnitsPerSemester(t.replace(/[^0-9]/g, "").slice(0, 2))}
                  keyboardType="number-pad"
                  style={inputStyle(colors, theme.radii)}
                />
              </View>
            </View>

            {/* Timeframe chips */}
            <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 14, marginBottom: 8 }]}>
              Timeframe
            </Text>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {timeframeChoices.map((t) => (
                <Pressable
                  key={t.label}
                  onPress={() => setTimeframe(t)}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 14,
                    borderRadius: theme.radii.pill,
                    backgroundColor:
                      timeframe.label === t.label ? colors.accent : colors.surfaceAlt,
                    borderWidth: 1,
                    borderColor: timeframe.label === t.label ? "transparent" : colors.border,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "PlusJakartaSans_600SemiBold",
                      fontSize: 12,
                      color: timeframe.label === t.label ? "#170B26" : colors.textPrimary,
                    }}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {prediction ? (
            <View
              style={{
                marginTop: 16,
                padding: 18,
                borderRadius: theme.radii.lg,
                borderWidth: 1.5,
                borderColor: prediction.reachable ? colors.accent + "66" : colors.error + "55",
                backgroundColor: colors.surface,
              }}
            >
              {prediction.reachable ? (
                <>
                  <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>
                    You need an average of{" "}
                    <Text style={{ color: colors.brand }}>{prediction.gpRequired.toFixed(2)}</Text>{" "}
                    across {timeframe.semesters} semester{timeframe.semesters === 1 ? "" : "s"}
                  </Text>
                  <Text style={[theme.typography.caption, { color: colors.textSecondary, marginTop: 8, lineHeight: 20 }]}>
                    That's a {gradeLabel(Math.min(100, prediction.gpRequired * 20 + 10))}-grade average
                    on the NUC scale. Highest achievable from here (straight A's):{" "}
                    {prediction.maxAchievableCgpa.toFixed(2)}.
                  </Text>
                  <View style={{ marginTop: 12, gap: 6 }}>
                    {prediction.examples.map((ex) => (
                      <View
                        key={ex}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                          backgroundColor: colors.successBg,
                          borderRadius: 10,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                        }}
                      >
                        <Icon name="check" size={14} color={colors.success} />
                        <Text style={[theme.typography.caption, { color: colors.textSecondary, flex: 1 }]}>{ex}</Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Icon name="alert" size={16} color={colors.error} />
                    <Text style={[theme.typography.bodyBold, { color: colors.error }]}>
                      Not reachable in this timeframe
                    </Text>
                  </View>
                  <Text style={[theme.typography.caption, { color: colors.textSecondary, marginTop: 8, lineHeight: 20 }]}>
                    Reaching {targetCgpa} would need an average of {prediction.maxGpRequired.toFixed(2)} —
                    above the maximum of 5.0. With straight A's from here you'd finish at{" "}
                    <Text style={{ color: colors.textPrimary }}>{prediction.maxAchievableCgpa.toFixed(2)}</Text>.
                    Pick a longer timeframe to make it realistic.
                  </Text>
                </>
              )}
            </View>
          ) : null}
        </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedScreen>
  );
}

function inputStyle(colors: import("../../theme/themes").MatriqThemeColors, radii: { md: number }) {
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
