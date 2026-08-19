import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../theme/ThemeContext";
import { ThemedScreen } from "../../components/Surface";
import { Icon } from "../../components/icons";
import { api } from "../../api/client";
import { formatApiError } from "../../utils/errors";

interface QuizQuestion {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

interface QuizResponse {
  questions: QuizQuestion[];
  source: "gemini" | "seed";
  courseCode: string | null;
}

type Phase = "setup" | "loading" | "answering" | "done";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/**
 * Quiz maker (round-2 QA §8). Questions come from the backend — Gemini turns
 * the student's own approved uploaded materials into MCQs, with a seed
 * fallback when there are no materials yet. Everything works on web too.
 */
export function QuizScreen() {
  const { theme } = useTheme();
  const colors = theme.colors;

  const [phase, setPhase] = useState<Phase>("setup");
  const [courseCode, setCourseCode] = useState("");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [course, setCourse] = useState<string | null>(null);
  const [source, setSource] = useState<"gemini" | "seed">("seed");
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [error, setError] = useState<{
    title: string;
    message: string;
    action: string;
  } | null>(null);

  const start = async () => {
    setPhase("loading");
    setError(null);
    try {
      const data = await api.post<QuizResponse>("/ai/quiz", {
        courseCode: courseCode.trim() || undefined,
        count: 5,
      });
      if (data.questions.length === 0) {
        throw new Error("No questions returned");
      }
      setQuestions(data.questions);
      setCourse(data.courseCode);
      setSource(data.source);
      setIndex(0);
      setPicked(null);
      setScore(0);
      setPhase("answering");
    } catch (err) {
      setError(formatApiError(err));
      setPhase("setup");
    }
  };

  const pick = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    if (i === questions[index].answerIndex) {
      setScore((s) => s + 1);
    }
  };

  const next = () => {
    if (index + 1 >= questions.length) {
      setPhase("done");
    } else {
      setIndex((i) => i + 1);
      setPicked(null);
    }
  };

  return (
    <ThemedScreen>
      <SafeAreaView style={{ flex: 1 }} edges={["bottom", "left", "right"]}>
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[theme.typography.display, { color: colors.textPrimary }]}>Quiz maker</Text>
          <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 4 }]}>
            Questions built from your uploaded materials — not generic.
          </Text>

          {phase === "setup" ? (
            <>
              <View
                style={{
                  marginTop: 20,
                  padding: 16,
                  borderRadius: theme.radii.lg,
                  backgroundColor: colors.infoBg,
                  borderWidth: 1,
                  borderColor: colors.info + "44",
                }}
              >
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Icon name="info" size={17} color={colors.info} />
                  <Text style={[theme.typography.caption, { color: colors.textSecondary, flex: 1, lineHeight: 19 }]}>
                    Add a course code to quiz yourself on that course. Without
                    one, we'll pull from your uploaded materials — or use a
                    study-skills starter set if you haven't uploaded anything yet.
                  </Text>
                </View>
              </View>

              <Text style={[theme.typography.captionBold, { color: colors.textSecondary, marginTop: 18, marginBottom: 6 }]}>
                Course code (optional)
              </Text>
              <TextInput
                value={courseCode}
                onChangeText={(t) => setCourseCode(t.toUpperCase().slice(0, 12))}
                placeholder="e.g. CHM 101"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                autoCorrect={false}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: theme.radii.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                  color: colors.textPrimary,
                  fontFamily: theme.typography.body.fontFamily,
                  fontSize: 15,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                }}
              />

              {error ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 8,
                    marginTop: 16,
                    backgroundColor: colors.errorBg,
                    borderRadius: 12,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: colors.error + "44",
                  }}
                >
                  <Icon name="alert" size={16} color={colors.error} />
                  <View style={{ flex: 1 }}>
                    <Text style={[theme.typography.captionBold, { color: colors.error }]}>{error.title}</Text>
                    <Text style={[theme.typography.caption, { color: colors.textSecondary, marginTop: 2, lineHeight: 17 }]}>
                      {error.message} {error.action}
                    </Text>
                  </View>
                </View>
              ) : null}

              <Pressable
                onPress={() => void start()}
                style={{
                  marginTop: 22,
                  alignItems: "center",
                  paddingVertical: 15,
                  borderRadius: theme.radii.md,
                  backgroundColor: colors.accent,
                  borderWidth: theme.mode === "pop" ? 2 : 0,
                  borderColor: colors.borderStrong,
                }}
              >
                <Text style={{ fontFamily: "PlusJakartaSans_700Bold", fontSize: 15, color: "#170B26" }}>
                  Start quiz (5 questions)
                </Text>
              </Pressable>
            </>
          ) : null}

          {phase === "loading" ? (
            <View style={{ alignItems: "center", paddingVertical: 56 }}>
              <ActivityIndicator color={colors.brand} />
              <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 12 }]}>
                Building your quiz…
              </Text>
            </View>
          ) : null}

          {phase === "answering" && questions.length > 0 ? (
            <>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 20,
                  marginBottom: 12,
                }}
              >
                <Text style={[theme.typography.captionBold, { color: colors.textMuted }]}>
                  Question {index + 1} of {questions.length}
                </Text>
                <Text style={[theme.typography.captionBold, { color: colors.brand }]}>
                  {score} correct
                </Text>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden", marginBottom: 20 }}>
                <View
                  style={{
                    height: "100%",
                    width: `${((index + 1) / questions.length) * 100}%`,
                    backgroundColor: colors.accent,
                  }}
                />
              </View>

              {course ? (
                <View
                  style={{
                    alignSelf: "flex-start",
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 4,
                    backgroundColor: colors.surfaceAlt,
                    borderWidth: 1,
                    borderColor: colors.border,
                    marginBottom: 12,
                  }}
                >
                  <Text style={[theme.typography.small, { color: colors.textPrimary, fontWeight: "700" }]}>
                    {course}
                  </Text>
                </View>
              ) : null}

              <Text style={[theme.typography.h3, { color: colors.textPrimary, lineHeight: 28, marginBottom: 18 }]}>
                {questions[index].question}
              </Text>

              <View style={{ gap: 10 }}>
                {questions[index].options.map((opt, i) => {
                  const isAnswer = i === questions[index].answerIndex;
                  const isPicked = picked === i;
                  let bg = colors.surface;
                  let border = colors.border;
                  if (picked !== null) {
                    if (isAnswer) {
                      bg = colors.successBg;
                      border = colors.success;
                    } else if (isPicked) {
                      bg = colors.errorBg;
                      border = colors.error;
                    }
                  }
                  return (
                    <Pressable
                      key={i}
                      onPress={() => pick(i)}
                      disabled={picked !== null}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        padding: 14,
                        borderRadius: theme.radii.md,
                        backgroundColor: bg,
                        borderWidth: 1.5,
                        borderColor: border,
                      }}
                    >
                      <View
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 9,
                          backgroundColor: isPicked || (picked !== null && isAnswer) ? colors.accent : colors.surfaceAlt,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ fontFamily: "PlusJakartaSans_700Bold", fontSize: 13, color: "#170B26" }}>
                          {LETTERS[i]}
                        </Text>
                      </View>
                      <Text style={[theme.typography.bodyMedium, { color: colors.textPrimary, flex: 1 }]}>
                        {opt}
                      </Text>
                      {picked !== null && isAnswer ? <Icon name="check" size={16} color={colors.success} /> : null}
                      {picked !== null && isPicked && !isAnswer ? <Icon name="x" size={16} color={colors.error} /> : null}
                    </Pressable>
                  );
                })}
              </View>

              {picked !== null ? (
                <View
                  style={{
                    marginTop: 16,
                    padding: 14,
                    borderRadius: theme.radii.md,
                    backgroundColor: colors.surfaceAlt,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text style={[theme.typography.captionBold, { color: colors.textPrimary }]}>
                    {picked === questions[index].answerIndex ? "Correct!" : "Not quite."}
                  </Text>
                  <Text style={[theme.typography.caption, { color: colors.textSecondary, marginTop: 4, lineHeight: 19 }]}>
                    {questions[index].explanation}
                  </Text>
                </View>
              ) : null}

              {picked !== null ? (
                <Pressable
                  onPress={next}
                  style={{
                    marginTop: 20,
                    alignItems: "center",
                    paddingVertical: 14,
                    borderRadius: theme.radii.md,
                    backgroundColor: colors.accent,
                    borderWidth: theme.mode === "pop" ? 2 : 0,
                    borderColor: colors.borderStrong,
                  }}
                >
                  <Text style={{ fontFamily: "PlusJakartaSans_700Bold", fontSize: 14, color: "#170B26" }}>
                    {index + 1 >= questions.length ? "See results" : "Next question"}
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : null}

          {phase === "done" ? (
            <View style={{ alignItems: "center", paddingVertical: 40 }}>
              <View
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: 999,
                  backgroundColor: colors.surfaceAlt,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 18,
                }}
              >
                <Icon name="trophy" size={40} color={colors.accent} />
              </View>
              <Text style={[theme.typography.h2, { color: colors.textPrimary }]}>
                {score} / {questions.length}
              </Text>
              <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 8, textAlign: "center", maxWidth: 300, lineHeight: 24 }]}>
                {score === questions.length
                  ? "Perfect score — you've got this course covered."
                  : score >= questions.length / 2
                    ? "Solid work. Review the ones you missed and try again."
                    : "Good start — re-upload your notes and quiz again."}
              </Text>
              {source === "seed" ? (
                <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 12, textAlign: "center", maxWidth: 300 }]}>
                  These were study-skills questions — upload your own materials
                  to get quizzes on your actual courses.
                </Text>
              ) : null}
              <Pressable
                onPress={() => {
                  setPhase("setup");
                  setQuestions([]);
                }}
                style={{
                  marginTop: 24,
                  alignItems: "center",
                  paddingVertical: 14,
                  paddingHorizontal: 28,
                  borderRadius: theme.radii.md,
                  backgroundColor: colors.accent,
                  borderWidth: theme.mode === "pop" ? 2 : 0,
                  borderColor: colors.borderStrong,
                }}
              >
                <Text style={{ fontFamily: "PlusJakartaSans_700Bold", fontSize: 14, color: "#170B26" }}>
                  New quiz
                </Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedScreen>
  );
}
