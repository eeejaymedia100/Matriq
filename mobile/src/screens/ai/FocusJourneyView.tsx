import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { Surface } from "../../components/Surface";
import { Icon } from "../../components/icons";
import { api, ApiError } from "../../api/client";
import { KIND_META, type FocusMap, type FocusNode } from "../../offline/focus";
import {
  checkpointQuestionFor,
  currentStageIndex,
  emptyJourneyProgress,
  getJourneyProgress,
  isJourneyComplete,
  journeyStagesOf,
  saveJourneyProgress,
  type JourneyProgress,
} from "../../utils/focusJourney";

/**
 * The Focus Mode learning journey (UI direction §Focus Mode).
 *
 * A map is walked as an ordered journey of stages instead of a static wall of
 * nodes: each stage shows its concepts as concise rows that reveal a simple
 * explanation first and expand into deeper detail on interaction. When every
 * concept in the current stage has been opened, a mastery checkpoint asks a
 * question — the backend judges the answer (bypass attempts are rejected
 * server-side). Passing a stage unlocks the next one. Progress is saved per
 * map, so the student can leave and resume.
 */
export function FocusJourneyView({
  map,
  sessionId,
  onExit,
  onShowMap,
  onUpdateMap,
}: {
  map: FocusMap;
  sessionId: string | null;
  onExit: () => void;
  onShowMap: () => void;
  onUpdateMap: (next: FocusMap) => void;
}) {
  const { theme } = useTheme();
  const colors = theme.colors;

  const stages = useMemo(() => journeyStagesOf(map), [map]);
  const [progress, setProgress] = useState<JourneyProgress>(emptyJourneyProgress());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [busyConcept, setBusyConcept] = useState<string | null>(null);
  const [checkpoint, setCheckpoint] = useState<{
    stageId: string;
    conceptId: string;
  } | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    void getJourneyProgress(map.id).then(setProgress);
  }, [map.id]);

  const applyProgress = useCallback(
    (next: JourneyProgress) => {
      setProgress(next);
      void saveJourneyProgress(map.id, next);
    },
    [map.id],
  );

  const currentIdx = currentStageIndex(stages, progress);
  const complete = isJourneyComplete(stages, progress);

  const stageConcept = useCallback(
    (conceptId: string): FocusNode | undefined =>
      map.nodes.find((n) => n.id === conceptId),
    [map.nodes],
  );

  /** Reveal a concept's simple explanation + mark it as opened. */
  const openConcept = useCallback(
    (conceptId: string) => {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.add(conceptId);
        return next;
      });
      if (!progress.openedConceptIds.includes(conceptId)) {
        applyProgress({
          ...progress,
          openedConceptIds: [...progress.openedConceptIds, conceptId],
        });
      }
    },
    [progress, applyProgress],
  );

  const expandWithAi = useCallback(
    async (concept: FocusNode, mode: "lost" | "more") => {
      if (!sessionId) {
        setLocalError(
          "This map can't be expanded with AI — generate a fresh cloud map to use AI explanations.",
        );
        return;
      }
      setBusyConcept(concept.id);
      setLocalError(null);
      try {
        const res = await api.post<{
          concept: {
            detail: string;
            importance?: string;
            examples?: string[];
          };
        }>(`/focus/maps/${sessionId}/expand`, { conceptId: concept.id });
        const c = res.concept;
        const parts =
          mode === "lost"
            ? [
                c.importance?.trim()
                  ? `Why it matters: ${c.importance.trim()}`
                  : "",
                c.detail?.trim(),
                (c.examples?.length ?? 0) > 0
                  ? `Examples:\n• ${c.examples!.join("\n• ")}`
                  : "",
              ].filter(Boolean)
            : [
                c.detail?.trim(),
                c.importance?.trim()
                  ? `Why it matters: ${c.importance.trim()}`
                  : "",
                (c.examples?.length ?? 0) > 0
                  ? `Examples:\n• ${c.examples!.join("\n• ")}`
                  : "",
              ].filter(Boolean);
        const text = parts.length ? parts.join("\n\n") : c.detail;
        if (text && map) {
          const next: FocusMap = {
            ...map,
            nodes: map.nodes.map((n) =>
              n.id === concept.id ? { ...n, detail: text } : n,
            ),
          };
          onUpdateMap(next);
        }
      } catch (err) {
        if (err instanceof ApiError && err.code === "MAGIC_PLUS_REQUIRED") {
          setLocalError(
            "Expanding concepts uses cloud AI, which is part of Magic Plus. You've used your free allowance — upgrade to keep going.",
          );
        } else {
          setLocalError(
            "The AI couldn't expand this right now. Check your connection and try again in a moment.",
          );
        }
      } finally {
        setBusyConcept(null);
      }
    },
    [sessionId, map, onUpdateMap],
  );

  /** Which concept a stage's checkpoint quizzes (deterministic). */
  const checkpointConceptOf = useCallback(
    (stage: (typeof stages)[number]): string => {
      const ids = [...stage.conceptIds].reverse();
      const picked =
        ids.find((id) => {
          const n = stageConcept(id);
          return n && n.kind !== "topic" && n.kind !== "example";
        }) ?? ids[0];
      return picked;
    },
    [stageConcept, stages],
  );

  const stageUnlocked = (index: number) => {
    if (index === 0) return true;
    return stages
      .slice(0, index)
      .every((s) => progress.passedStageIds.includes(s.id));
  };

  const passStage = useCallback(
    (stageId: string) => {
      if (progress.passedStageIds.includes(stageId)) return;
      applyProgress({
        ...progress,
        passedStageIds: [...progress.passedStageIds, stageId],
      });
    },
    [progress, applyProgress],
  );

  const allCurrentOpened = (stageId: string): boolean => {
    const stage = stages.find((s) => s.id === stageId);
    if (!stage) return false;
    return stage.conceptIds.every((id) =>
      progress.openedConceptIds.includes(id),
    );
  };

  const readyForCheckpoint = allCurrentOpened(stages[currentIdx]?.id ?? "");

  // ── Render ─────────────────────────────────────────────────

  const renderHeader = () => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <Pressable onPress={onExit} hitSlop={8} style={{ padding: 4 }}>
        <Icon name="chevronLeft" size={20} color={colors.textSecondary} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={[theme.typography.bodyBold, { color: colors.textPrimary }]}
        >
          {map.topic}
        </Text>
        <Text style={[theme.typography.small, { color: colors.textMuted }]}>
          {complete
            ? "Journey complete"
            : `Step ${currentIdx + 1} of ${stages.length}`}
        </Text>
      </View>
      {/* Journey / Map toggle */}
      <View
        style={{
          flexDirection: "row",
          padding: 3,
          borderRadius: theme.radii.pill,
          backgroundColor: colors.surfaceAlt,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <View
          style={{
            paddingVertical: 6,
            paddingHorizontal: 12,
            borderRadius: theme.radii.pill - 2,
            backgroundColor: colors.accent,
          }}
        >
          <Text
            style={{
              fontFamily: "Inter_700Bold",
              fontSize: 11,
              color: "#17181A",
            }}
          >
            Journey
          </Text>
        </View>
        <Pressable
          onPress={onShowMap}
          style={{ paddingVertical: 6, paddingHorizontal: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Open the full map"
        >
          <Text style={[theme.typography.small, { color: colors.textSecondary }]}>
            Map
          </Text>
        </Pressable>
      </View>
    </View>
  );

  const renderConceptRow = (conceptId: string, index: number) => {
    const concept = stageConcept(conceptId);
    if (!concept) return null;
    const meta = KIND_META[concept.kind];
    const opened = progress.openedConceptIds.includes(concept.id);
    const expanded = expandedIds.has(concept.id);
    const busy = busyConcept === concept.id;
    return (
      <View key={concept.id} style={{ marginBottom: 10 }}>
        <Pressable
          onPress={() => openConcept(concept.id)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            padding: 12,
            borderRadius: theme.radii.md,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: expanded ? meta.color + "88" : colors.border,
          }}
        >
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: meta.color + "22",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Inter_700Bold",
                fontSize: 11,
                color: meta.color,
              }}
            >
              {index + 1}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={1}
              style={[theme.typography.bodyBold, { color: colors.textPrimary }]}
            >
              {concept.label}
            </Text>
            <Text
              numberOfLines={1}
              style={[theme.typography.small, { color: colors.textMuted, marginTop: 1 }]}
            >
              {opened ? (expanded ? "Open" : "Read ✓ · tap to reread") : concept.summary}
            </Text>
          </View>
          {opened ? (
            <Icon name="check" size={15} color={colors.success} />
          ) : null}
          <Icon
            name={expanded ? "chevronDown" : "chevronRight"}
            size={16}
            color={colors.textMuted}
          />
        </Pressable>

        {expanded ? (
          <Surface style={{ padding: 14, marginTop: 6, marginBottom: 0 }}>
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: meta.color, letterSpacing: 0.9, textTransform: "uppercase" }}>
              {meta.label}
            </Text>
            <Text
              selectable
              style={[
                theme.typography.caption,
                { color: colors.textSecondary, lineHeight: 20, marginTop: 6 },
              ]}
            >
              {concept.detail ||
                concept.summary ||
                "No detail available for this card yet."}
            </Text>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <Pressable
                onPress={() => void expandWithAi(concept, "lost")}
                disabled={busy}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 9,
                  borderRadius: theme.radii.sm + 2,
                  backgroundColor: colors.surfaceAlt,
                  borderWidth: 1,
                  borderColor: colors.borderStrong,
                }}
              >
                <Text style={[theme.typography.small, { color: colors.textPrimary }]}>
                  In simpler terms
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void expandWithAi(concept, "more")}
                disabled={busy}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 9,
                  borderRadius: theme.radii.sm + 2,
                  backgroundColor: colors.surfaceAlt,
                  borderWidth: 1,
                  borderColor: colors.borderStrong,
                }}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : (
                  <Text style={[theme.typography.small, { color: colors.textPrimary }]}>
                    Go deeper
                  </Text>
                )}
              </Pressable>
            </View>
          </Surface>
        ) : null}
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {renderHeader()}
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {localError ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              padding: 12,
              borderRadius: theme.radii.md,
              backgroundColor: colors.errorBg,
              borderWidth: 1,
              borderColor: colors.error + "44",
              marginBottom: 14,
            }}
          >
            <Icon name="alert" size={15} color={colors.error} />
            <Text style={[theme.typography.caption, { color: colors.error, flex: 1 }]}>
              {localError}
            </Text>
          </View>
        ) : null}

        {/* Overview */}
        <Text style={[theme.typography.caption, { color: colors.textSecondary, lineHeight: 20 }]}>
          {map.nodes.find((n) => n.kind === "topic")?.detail ||
            map.nodes[0]?.detail ||
            "A guided walk through this topic — learn it step by step."}
        </Text>

        {complete ? (
          <Surface
            variant="sticker"
            style={{
              padding: 18,
              marginTop: 18,
              alignItems: "center",
              borderColor: colors.accent + "66",
            }}
          >
            <Text style={[theme.typography.h3, { color: colors.textPrimary }]}>
              Journey complete 🎉
            </Text>
            <Text
              style={[
                theme.typography.caption,
                { color: colors.textSecondary, textAlign: "center", marginTop: 6, lineHeight: 19 },
              ]}
            >
              You walked every stage and passed every checkpoint — that's
              mastery, not just reading. Open the map to review it any time.
            </Text>
            <Pressable
              onPress={onShowMap}
              style={{
                marginTop: 12,
                alignItems: "center",
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: theme.radii.md,
                backgroundColor: colors.accent,
              }}
            >
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#17181A" }}>
                Review the map
              </Text>
            </Pressable>
          </Surface>
        ) : null}

        {/* Stages */}
        {stages.map((stage, i) => {
          const passed = progress.passedStageIds.includes(stage.id);
          const isCurrent = i === currentIdx && !complete;
          const unlocked = stageUnlocked(i);
          return (
            <View key={stage.id} style={{ marginTop: 22, opacity: unlocked || passed ? 1 : 0.55 }}>
              {/* Stage header */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: passed
                      ? colors.success + "22"
                      : isCurrent
                        ? colors.accent
                        : colors.surfaceAlt,
                    borderWidth: isCurrent && theme.mode === "pop" ? 2 : 0,
                    borderColor: colors.borderStrong,
                  }}
                >
                  {passed ? (
                    <Icon name="check" size={17} color={colors.success} />
                  ) : (
                    <Text
                      style={{
                        fontFamily: "Inter_700Bold",
                        fontSize: 13,
                        color: isCurrent ? "#17181A" : colors.textMuted,
                      }}
                    >
                      {i + 1}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>
                    {stage.title}
                  </Text>
                  <Text
                    style={[
                      theme.typography.small,
                      { color: colors.textMuted, marginTop: 1, lineHeight: 15 },
                    ]}
                  >
                    {isCurrent
                      ? stage.objective
                      : passed
                        ? "Checkpoint passed"
                        : `Finish “${stages[i - 1]?.title ?? "the last stage"}” to unlock`}
                  </Text>
                </View>
                {passed ? (
                  <Text style={[theme.typography.small, { color: colors.success }]}>
                    Passed
                  </Text>
                ) : null}
              </View>

              {/* Concepts of the current stage only (past stages are done) */}
              {isCurrent ? (
                <View style={{ marginTop: 12 }}>
                  {stage.conceptIds.map((id, ci) => renderConceptRow(id, ci))}

                  {/* Mastery checkpoint */}
                  <Surface
                    style={{
                      padding: 16,
                      marginTop: 6,
                      marginBottom: 0,
                      borderWidth: 1.5,
                      borderColor: readyForCheckpoint
                        ? colors.accent + "AA"
                        : colors.border,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Icon name="target" size={17} color={readyForCheckpoint ? colors.accent : colors.textMuted} />
                      <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>
                        Mastery check
                      </Text>
                    </View>
                    <Text style={[theme.typography.caption, { color: colors.textSecondary, marginTop: 6, lineHeight: 19 }]}>
                      {readyForCheckpoint
                        ? "You've read every idea in this step. Answer one short question to lock it in and move on."
                        : "Open and read every idea in this step first — then one short question proves you've got it."}
                    </Text>
                    <Pressable
                      onPress={() => {
                        const conceptId = checkpointConceptOf(stage);
                        setCheckpoint({ stageId: stage.id, conceptId });
                      }}
                      disabled={!readyForCheckpoint}
                      style={{
                        marginTop: 12,
                        alignItems: "center",
                        paddingVertical: 12,
                        borderRadius: theme.radii.md,
                        backgroundColor: readyForCheckpoint
                          ? colors.accent
                          : colors.surfaceAlt,
                        borderWidth: theme.mode === "pop" && readyForCheckpoint ? 2 : 0,
                        borderColor: colors.borderStrong,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Inter_700Bold",
                          fontSize: 13,
                          color: readyForCheckpoint ? "#17181A" : colors.textMuted,
                        }}
                      >
                        {readyForCheckpoint ? "Take the check" : "Locked until you read all ideas"}
                      </Text>
                    </Pressable>
                  </Surface>
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      <CheckpointModal
        visible={!!checkpoint}
        map={map}
        sessionId={sessionId}
        stageId={checkpoint?.stageId ?? ""}
        conceptId={checkpoint?.conceptId ?? ""}
        onPass={(stageId) => {
          passStage(stageId);
          setCheckpoint(null);
        }}
        onClose={() => setCheckpoint(null)}
        onSimplify={(concept) => {
          void expandWithAi(concept, "lost");
        }}
      />
    </View>
  );
}

function CheckpointModal({
  visible,
  map,
  sessionId,
  stageId,
  conceptId,
  onPass,
  onClose,
  onSimplify,
}: {
  visible: boolean;
  map: FocusMap;
  sessionId: string | null;
  stageId: string;
  conceptId: string;
  onPass: (stageId: string) => void;
  onClose: () => void;
  onSimplify: (concept: FocusNode) => void;
}) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const concept = map.nodes.find((n) => n.id === conceptId);
  const [answer, setAnswer] = useState("");
  const [evaluating, setEvaluating] = useState(false);
  const [verdict, setVerdict] = useState<{
    passed: boolean;
    feedback: string;
    misconception?: string;
    suggestion?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setAnswer("");
      setVerdict(null);
      setError(null);
      setEvaluating(false);
    }
  }, [visible, conceptId]);

  if (!visible || !concept) return null;
  const question = checkpointQuestionFor(concept.label, map.topic);

  const submit = async () => {
    if (!sessionId) return;
    if (!answer.trim()) return;
    setEvaluating(true);
    setError(null);
    try {
      const res = await api.post<{
        verdict: { passed: boolean; feedback: string; misconception?: string; suggestion?: string };
      }>(`/focus/maps/${sessionId}/checkpoint`, {
        conceptId: concept.id,
        answer: answer.trim(),
      });
      setVerdict(res.verdict);
    } catch (err) {
      if (err instanceof ApiError && err.code === "MAGIC_PLUS_REQUIRED") {
        setError(
          "Mastery checks use cloud AI, which is part of Magic Plus. You've used your free allowance — upgrade to keep going.",
        );
      } else {
        setError(
          "The AI couldn't check your answer right now. Try again in a moment.",
        );
      }
    } finally {
      setEvaluating(false);
    }
  };

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
        {/* KeyboardAvoidingView so the answer field is never covered by the
            keyboard while typing. */}
        <KeyboardAvoidingView behavior="padding">
        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            borderWidth: 1,
            borderColor: colors.border,
            borderBottomWidth: 0,
            padding: 20,
            paddingBottom: 34,
          }}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: KIND_META[concept.kind].color,
                }}
              />
              <Text style={[theme.typography.small, { color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 1 }]}>
                Mastery check
              </Text>
            </View>
            <Text style={[theme.typography.h3, { color: colors.textPrimary, marginTop: 8, lineHeight: 26 }]}>
              {question}
            </Text>

            {!verdict ? (
              <>
                <TextInput
                  value={answer}
                  onChangeText={setAnswer}
                  placeholder="Answer in your own words — even one correct idea counts."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  style={{
                    marginTop: 14,
                    minHeight: 110,
                    backgroundColor: colors.surfaceAlt,
                    borderRadius: theme.radii.md,
                    borderWidth: 1,
                    borderColor: colors.borderStrong,
                    color: colors.textPrimary,
                    fontFamily: theme.typography.body.fontFamily,
                    fontSize: 15,
                    lineHeight: 22,
                    padding: 12,
                    textAlignVertical: "top",
                  }}
                />
                {error ? (
                  <Text style={[theme.typography.caption, { color: colors.error, marginTop: 10 }]}>
                    {error}
                  </Text>
                ) : null}
                <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                  <Pressable
                    onPress={() => {
                      onSimplify(concept);
                      onClose();
                    }}
                    style={{
                      flex: 1,
                      alignItems: "center",
                      paddingVertical: 13,
                      borderRadius: theme.radii.md,
                      backgroundColor: colors.surfaceAlt,
                      borderWidth: 1,
                      borderColor: colors.borderStrong,
                    }}
                  >
                    <Text style={[theme.typography.captionBold, { color: colors.textPrimary }]}>
                      I don't understand
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void submit()}
                    disabled={evaluating || !answer.trim() || !sessionId}
                    style={{
                      flex: 1,
                      alignItems: "center",
                      paddingVertical: 13,
                      borderRadius: theme.radii.md,
                      backgroundColor:
                        answer.trim() && sessionId ? colors.accent : colors.surfaceAlt,
                      borderWidth: theme.mode === "pop" && answer.trim() && sessionId ? 2 : 0,
                      borderColor: colors.borderStrong,
                    }}
                  >
                    {evaluating ? (
                      <ActivityIndicator size="small" color={colors.onAccent} />
                    ) : (
                      <Text
                        style={{
                          fontFamily: theme.typography.captionBold.fontFamily,
                          fontSize: 13,
                          color: answer.trim() && sessionId ? colors.onAccent : colors.textMuted,
                        }}
                      >
                        Check my answer
                      </Text>
                    )}
                  </Pressable>
                </View>
                {!sessionId ? (
                  <Text style={[theme.typography.small, { color: colors.textMuted, marginTop: 10, textAlign: "center" }]}>
                    Mastery checks need a cloud map — generate a fresh one to use them.
                  </Text>
                ) : null}
              </>
            ) : (
              <>
                {/* Verdict */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    marginTop: 16,
                    padding: 14,
                    borderRadius: theme.radii.md,
                    backgroundColor: verdict.passed ? colors.successBg : colors.warningBg,
                    borderWidth: 1,
                    borderColor: verdict.passed ? colors.success + "55" : colors.warning + "55",
                  }}
                >
                  <Icon
                    name={verdict.passed ? "check" : "refresh"}
                    size={18}
                    color={verdict.passed ? colors.success : colors.warning}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        theme.typography.bodyBold,
                        { color: verdict.passed ? colors.success : colors.warning, fontSize: 14 },
                      ]}
                    >
                      {verdict.passed ? "Nice — you've got it." : "Not quite — that's okay."}
                    </Text>
                    <Text
                      style={[
                        theme.typography.caption,
                        {
                          color: verdict.passed ? colors.success : colors.textSecondary,
                          marginTop: 3,
                          lineHeight: 19,
                        },
                      ]}
                    >
                      {verdict.feedback}
                    </Text>
                  </View>
                </View>
                {!verdict.passed && verdict.misconception ? (
                  <Text style={[theme.typography.caption, { color: colors.textSecondary, marginTop: 12, lineHeight: 19 }]}>
                    <Text style={[theme.typography.captionBold, { color: colors.error }]}>Missing: </Text>
                    {verdict.misconception}
                  </Text>
                ) : null}
                {!verdict.passed && verdict.suggestion ? (
                  <Text style={[theme.typography.caption, { color: colors.textSecondary, marginTop: 6, lineHeight: 19 }]}>
                    <Text style={[theme.typography.captionBold, { color: colors.error }]}>Review: </Text>
                    {verdict.suggestion}
                  </Text>
                ) : null}

                <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                  {verdict.passed ? (
                    <Pressable
                      onPress={() => onPass(stageId)}
                      style={{
                        flex: 1,
                        alignItems: "center",
                        paddingVertical: 13,
                        borderRadius: theme.radii.md,
                        backgroundColor: colors.accent,
                        borderWidth: theme.mode === "pop" ? 2 : 0,
                        borderColor: colors.borderStrong,
                      }}
                    >
                      <Text style={[theme.typography.captionBold, { fontSize: 13, color: colors.onAccent }]}>
                        Continue the journey
                      </Text>
                    </Pressable>
                  ) : (
                    <>
                      <Pressable
                        onPress={() => {
                          setAnswer("");
                          setVerdict(null);
                        }}
                        style={{
                          flex: 1,
                          alignItems: "center",
                          paddingVertical: 13,
                          borderRadius: theme.radii.md,
                          backgroundColor: colors.accent,
                          borderWidth: theme.mode === "pop" ? 2 : 0,
                          borderColor: colors.borderStrong,
                        }}
                      >
                        <Text style={[theme.typography.captionBold, { fontSize: 13, color: colors.onAccent }]}>
                          Try again
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          onSimplify(concept);
                          onClose();
                        }}
                        style={{
                          flex: 1,
                          alignItems: "center",
                          paddingVertical: 13,
                          borderRadius: theme.radii.md,
                          backgroundColor: colors.surfaceAlt,
                          borderWidth: 1,
                          borderColor: colors.borderStrong,
                        }}
                      >
                        <Text style={[theme.typography.captionBold, { color: colors.textPrimary }]}>
                          Simplify for me
                        </Text>
                      </Pressable>
                    </>
                  )}
                </View>
              </>
            )}
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}