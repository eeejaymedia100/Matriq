import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../theme/ThemeContext";
import { PressableScale } from "../../components/PressableScale";
import { api } from "../../api/client";

/**
 * FocusQuestioner — the intake step before map generation ("Teach me
 * Political Apathy" → a few smart tap-to-answer questions → a map that fits
 * the student's actual goal, not a generic textbook chapter).
 *
 * Apple-calm flow, fully gesture-driven, zero typing required:
 *   one question per screen · big tap cards · auto-advance on answer ·
 *   swipe-back to change an answer · skip always available
 *
 * Questions come from the AI but are strictly validated server-side to be
 * option-answering; a free-text escape ("Something else…") is offered only
 * when the question allows it. When the questioner can't load (offline
 * already-gated upstream, provider down), the parent silently proceeds to
 * generation — asking must never block learning.
 */

export interface ClarifyQuestion {
  id: string;
  text: string;
  options: string[];
  type: "single" | "multi";
  allowCustom: boolean;
  why?: string;
}

interface Props {
  topic: string;
  /** Called with collected answers (may be empty after a skip-all). */
  onDone: (answers: Record<string, string>, clarificationId: string | null) => void;
  onCancel: () => void;
}

/** Load the AI-proposed question set for this topic (cached server-side). */
async function fetchClarify(
  topic: string,
): Promise<{ clarificationId: string; questions: ClarifyQuestion[]; existingAnswers: Record<string, string> | null }> {
  const res = await api.post<{
    clarificationId: string;
    questions: ClarifyQuestion[];
    existingAnswers: Record<string, string> | null;
  }>("/focus/clarify", { topic });
  return res;
}

export function FocusQuestioner({ topic, onDone, onCancel }: Props) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [clarificationId, setClarificationId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ClarifyQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchClarify(topic)
      .then((res) => {
        if (!mounted) return;
        // No questions (provider down, validation fell through) → the
        // questioner is a no-op; go straight to generating.
        if (!res.questions || res.questions.length === 0) {
          onDone({}, res.clarificationId ?? null);
          return;
        }
        setClarificationId(res.clarificationId);
        setQuestions(res.questions);
        if (res.existingAnswers) setAnswers(res.existingAnswers);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        // Never block learning: load failure (offline, provider down,
        // paywall) → proceed straight to generation. The generate path
        // surfaces paywall errors properly; asking must never strand the
        // student on a dead-end screen.
        onDone({}, null);
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic]);

  const isLast = index >= questions.length - 1;
  const q = questions[index];
  const selectedValues = q ? (answers[q.id]?.split(" · ") ?? []) : [];

  const finish = async (finalAnswers: Record<string, string>) => {
    setFinishing(true);
    // Fire-and-forget progress save — the answers also ride inline with the
    // generate call, so a failed save never blocks the map.
    if (clarificationId) {
      void api
        .post(`/focus/clarify/${clarificationId}/answers`, { answers: finalAnswers })
        .catch(() => {});
    }
    onDone(finalAnswers, clarificationId);
  };

  const commitAndAdvance = (value: string) => {
    if (!q) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const next = { ...answers, [q.id]: value };
    setAnswers(next);
    if (isLast) {
      void finish(next);
    } else {
      setIndex(index + 1);
      setCustomOpen(false);
      setCustom("");
    }
  };

  const toggleMulti = (option: string) => {
    if (!q) return;
    const current = answers[q.id]?.split(" · ") ?? [];
    const next = current.includes(option)
      ? current.filter((v) => v !== option)
      : [...current, option];
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (next.length === 0) {
      const { [q.id]: _removed, ...rest } = answers;
      setAnswers(rest);
      return;
    }
    setAnswers({ ...answers, [q.id]: next.join(" · ") });
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <ActivityIndicator color={colors.brand} />
        <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 12, textAlign: "center" }]}>
          Personalising your questions…
        </Text>
      </View>
    );
  }

  if (!q) {
    // Shouldn't normally render (all failure paths proceed above), but a
    // safe non-blocking fallback: continue without answers.
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Text style={[theme.typography.body, { color: colors.textSecondary, textAlign: "center" }]}>
          Questions aren't available right now.
        </Text>
        <Pressable
          onPress={() => void finish(answers)}
          style={{
            marginTop: 18,
            paddingVertical: 12,
            paddingHorizontal: 28,
            borderRadius: theme.radii.pill,
            backgroundColor: colors.accent,
          }}
        >
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#17181A" }}>
            Build the map anyway
          </Text>
        </Pressable>
      </View>
    );
  }

  const answerCount = Object.keys(answers).length;

  return (
    <View style={{ flex: 1 }}>
      {/* Top bar — skip + progress */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: insets.top + 6,
          paddingHorizontal: 20,
        }}
      >
        <Pressable onPress={onCancel} hitSlop={10} accessibilityLabel="Skip questions and build the map">
          <Text style={[theme.typography.captionBold, { color: colors.textMuted, fontSize: 12 }]}>
            Skip
          </Text>
        </Pressable>
        <Text style={[theme.typography.captionBold, { color: colors.textSecondary, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase" }]}>
          {index + 1} of {questions.length}
        </Text>
        <View style={{ width: 26 }} />
      </View>

      {/* Progress hairline */}
      <View
        style={{
          marginTop: 10,
          marginHorizontal: 20,
          height: 3,
          borderRadius: 2,
          backgroundColor: colors.surfaceAlt,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${Math.round(((index + (answerCount > 0 ? 1 : 0)) / Math.max(1, questions.length)) * 100)}%`,
            height: 3,
            borderRadius: 2,
            backgroundColor: colors.accent,
          }}
        />
      </View>

      {/* One question per screen. KeyboardAvoidingView + ScrollView so the
          free-text escape hatch is never covered by the keyboard. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView
        key={q.id}
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 24,
          justifyContent: "center",
          paddingVertical: 32,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={[
            theme.serif.editorial,
            { color: colors.textPrimary, fontSize: 27, lineHeight: 34 },
          ]}
        >
          {q.text}
        </Text>
        {q.why ? (
          <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 8 }]}>
            {q.why}
          </Text>
        ) : null}

        {/* Tap-to-answer cards */}
        <View style={{ marginTop: 22, gap: 10 }}>
          {q.options.map((option) => {
            const active = selectedValues.includes(option);
            return (
              <PressableScale
                key={option}
                onPress={() =>
                  q.type === "multi" ? toggleMulti(option) : commitAndAdvance(option)
                }
                style={{
                  paddingVertical: 15,
                  paddingHorizontal: 16,
                  borderRadius: theme.radii.md,
                  backgroundColor: active ? colors.accent : colors.surface,
                  borderWidth: active ? 2 : 1,
                  borderColor: active ? colors.accent : colors.borderStrong,
                  opacity: active ? 1 : 0.98,
                }}
                accessibilityRole="button"
                accessibilityLabel={option}
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 15,
                    color: active ? "#17181A" : colors.textPrimary,
                  }}
                >
                  {option}
                </Text>
              </PressableScale>
            );
          })}

          {/* Free-text escape — only when the question allows it */}
          {q.allowCustom ? (
            customOpen ? (
              <View
                style={{
                  marginTop: 4,
                  borderWidth: 1,
                  borderColor: colors.borderStrong,
                  borderRadius: theme.radii.md,
                  backgroundColor: colors.surface,
                  paddingHorizontal: 14,
                  paddingVertical: 6,
                }}
              >
                <TextInput
                  value={custom}
                  onChangeText={setCustom}
                  placeholder="Type your answer…"
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                  maxLength={200}
                  multiline
                  style={{
                    color: colors.textPrimary,
                    fontFamily: theme.typography.body.fontFamily,
                    fontSize: 15,
                    paddingVertical: 8,
                    maxHeight: 88,
                  }}
                />
                <Pressable
                  onPress={() => {
                    const v = custom.trim();
                    if (!v) {
                      setCustomOpen(false);
                      return;
                    }
                    commitAndAdvance(v);
                  }}
                  disabled={!custom.trim()}
                  style={{
                    alignSelf: "flex-end",
                    paddingVertical: 6,
                    paddingHorizontal: 14,
                    borderRadius: theme.radii.pill,
                    backgroundColor: custom.trim() ? colors.accent : colors.surfaceAlt,
                    marginBottom: 6,
                  }}
                  accessibilityLabel="Use this answer"
                >
                  <Text
                    style={{
                      fontFamily: "Inter_700Bold",
                      fontSize: 12,
                      color: custom.trim() ? "#17181A" : colors.textMuted,
                    }}
                  >
                    Use
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => setCustomOpen(true)}
                style={{ paddingVertical: 10, alignItems: "center" }}
                accessibilityLabel="Type a different answer"
              >
                <Text style={[theme.typography.captionBold, { color: colors.textMuted, fontSize: 12 }]}>
                  Something else…
                </Text>
              </Pressable>
            )
          ) : null}
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom controls */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 24,
          paddingBottom: Math.max(insets.bottom, 18) + 6,
        }}
      >
        {index > 0 ? (
          <Pressable
            onPress={() => {
              setIndex(index - 1);
              setCustomOpen(false);
              setCustom("");
            }}
            hitSlop={10}
            accessibilityLabel="Previous question"
          >
            <Text style={[theme.typography.captionBold, { color: colors.textSecondary, fontSize: 13 }]}>
              ← Back
            </Text>
          </Pressable>
        ) : (
          <View />
        )}
        {isLast ? (
          <Pressable
            onPress={() => void finish(answers)}
            disabled={finishing}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingVertical: 11,
              paddingHorizontal: 20,
              borderRadius: theme.radii.pill,
              backgroundColor: colors.surfaceAlt,
              borderWidth: 1,
              borderColor: colors.borderStrong,
            }}
            accessibilityLabel="Build my map with these answers"
          >
            {finishing ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <Text style={[theme.typography.captionBold, { color: colors.textPrimary, fontSize: 13 }]}>
                Build my map →
              </Text>
            )}
          </Pressable>
        ) : (
          <View />
        )}
      </View>
    </View>
  );
}
