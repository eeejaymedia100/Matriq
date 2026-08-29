import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Modal,
  ScrollView,
  PanResponder,
  useWindowDimensions,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Line, Circle } from "react-native-svg";
import { useRoute, type RouteProp } from "@react-navigation/native";
import type { MainStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardScreen } from "../../components/KeyboardScreen";
import { Icon } from "../../components/icons";
import { useOfflineAi } from "../../offline/OfflineAiContext";
import { api } from "../../api/client";
import {
  KIND_META,
  layoutFocusMap,
  NODE_W,
  NODE_H,
  parseFocusMap,
  fallbackFocusMap,
  type FocusMap,
  type FocusNode,
  type FocusNodeKind,
} from "../../offline/focus";
import {
  listFocusMaps,
  getFocusMap,
  saveFocusMap,
  deleteFocusMap,
} from "../../utils/focusHistory";

type Phase = "entry" | "generating" | "ready";

const MIN_SCALE = 0.3;
const MAX_SCALE = 2.5;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function FocusModeScreen() {
  const { theme } = useTheme();
  const colors = theme.colors;
  const route = useRoute<RouteProp<MainStackParamList, "AiFocus">>();
  const { buildFocusMap, ask } = useOfflineAi();
  const { width: winW, height: winH } = useWindowDimensions();

  const [phase, setPhase] = useState<Phase>("entry");
  const [topicInput, setTopicInput] = useState(route.params?.topic ?? "");
  const [savedMaps, setSavedMaps] = useState<FocusMap[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [map, setMap] = useState<FocusMap | null>(null);
  const [selected, setSelected] = useState<FocusNode | null>(null);
  const [help, setHelp] = useState<{ mode: "lost" | "more"; text: string } | null>(null);
  const [helping, setHelping] = useState(false);

  // Pan / zoom state.
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const [zoomPct, setZoomPct] = useState(100);

  const layout = useMemo(() => (map ? layoutFocusMap(map) : null), [map]);

  const loadSaved = useCallback(async () => {
    setSavedMaps(await listFocusMaps());
  }, []);

  // Opening with a mapId (from history) → straight to the workspace.
  useEffect(() => {
    const id = route.params?.mapId;
    if (!id) return;
    let mounted = true;
    void getFocusMap(id).then((m) => {
      if (!mounted || !m) return;
      setMap(m);
      setPhase("ready");
    });
    return () => {
      mounted = false;
    };
  }, [route.params?.mapId]);

  // Refresh the saved list on entry.
  useEffect(() => {
    if (phase === "entry") void loadSaved();
  }, [phase, loadSaved]);

  const fitToView = useCallback(
    (m: FocusMap) => {
      const l = layoutFocusMap(m);
      const fit = clamp(
        Math.min((winW - 32) / l.canvasWidth, (winH - 140) / l.canvasHeight, 1),
        MIN_SCALE,
        1,
      );
      scale.value = fit;
      setZoomPct(Math.round(fit * 100));
      tx.value = withTiming((winW - l.canvasWidth * fit) / 2, { duration: 220 });
      ty.value = withTiming((winH - 140 - l.canvasHeight * fit) / 2 + 20, {
        duration: 220,
      });
    },
    [winW, winH, scale, tx, ty],
  );

  /**
   * Server-side Focus Map builder (online fallback). Asks the cloud AI for a
   * strict JSON concept map and rescues imperfect output with the same
   * tolerant parser the offline path uses, so the workspace never stays empty.
   */
  const buildFocusMapOnline = useCallback(async (topic: string): Promise<FocusMap> => {
    const prompt =
      `Produce a concept map of this academic topic as ONE JSON object and nothing else (no markdown). ` +
      `Schema: {"nodes":[{"id":"n1","label":"short name","kind":"definition|type|component|process|example|application|importance|note","summary":"one short sentence","detail":"3-6 sentence explanation"}],"links":[{"from":"n1","to":"n2","label":"relationship"}]}. ` +
      `Include the topic itself with kind "topic"; use 6-12 nodes; unique ids n1..nN; links reference existing ids. Topic: ${topic}`;
    const data = await api.post<{ response: string }>("/ai/query", {
      query: prompt,
    });
    const parsed = parseFocusMap(data.response, topic);
    return parsed ?? fallbackFocusMap(data.response, topic);
  }, []);

  const generate = useCallback(
    async (topic: string) => {
      const t = topic.trim();
      if (!t) return;
      setPhase("generating");
      setError(null);
      try {
        // Offline-first: use the model on this phone. If it isn't downloaded /
        // ready (buildFocusMap throws), fall back to a server build so Focus
        // Mode still works with an internet connection.
        let m: FocusMap;
        try {
          m = await buildFocusMap(t);
        } catch {
          m = await buildFocusMapOnline(t);
        }
        setMap(m);
        await saveFocusMap(m);
        setPhase("ready");
        // Fit after the layout is measured (next frame).
        setTimeout(() => fitToView(m), 60);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "The model couldn't build this map — try again in a moment.",
        );
        setPhase("entry");
      }
    },
    [buildFocusMap, buildFocusMapOnline, fitToView],
  );

  const openSaved = useCallback(
    (m: FocusMap) => {
      setMap(m);
      setPhase("ready");
      setTimeout(() => fitToView(m), 60);
    },
    [fitToView],
  );

  const persistCurrent = useCallback(
    (next: FocusMap) => {
      setMap(next);
      void saveFocusMap(next);
    },
    [],
  );

  // ── Pan / pinch ───────────────────────────────────────────────

  const lastTouch = useRef({ x: 0, y: 0 });
  const gesture = useRef({
    mode: "none" as "none" | "pan" | "pinch",
    startX: 0,
    startY: 0,
    startTx: 0,
    startTy: 0,
    startDist: 0,
    startScale: 1,
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => {
        lastTouch.current = {
          x: evt.nativeEvent.pageX,
          y: evt.nativeEvent.pageY,
        };
        // False so taps reach the node cards; drags claim the gesture below.
        return false;
      },
      onMoveShouldSetPanResponder: (evt) => {
        if (evt.nativeEvent.touches.length >= 2) return true;
        const dx = evt.nativeEvent.pageX - lastTouch.current.x;
        const dy = evt.nativeEvent.pageY - lastTouch.current.y;
        return Math.hypot(dx, dy) > 8;
      },
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length >= 2) {
          gesture.current.mode = "pinch";
          const dx = touches[0].pageX - touches[1].pageX;
          const dy = touches[0].pageY - touches[1].pageY;
          gesture.current.startDist = Math.hypot(dx, dy) || 1;
          gesture.current.startScale = scale.value;
        } else {
          gesture.current.mode = "pan";
          gesture.current.startX = evt.nativeEvent.pageX;
          gesture.current.startY = evt.nativeEvent.pageY;
          gesture.current.startTx = tx.value;
          gesture.current.startTy = ty.value;
        }
      },
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches;
        const g = gesture.current;
        if (touches.length >= 2 && g.mode === "pinch") {
          const dx = touches[0].pageX - touches[1].pageX;
          const dy = touches[0].pageY - touches[1].pageY;
          const dist = Math.hypot(dx, dy);
          if (g.startDist > 0) {
            scale.value = clamp(
              g.startScale * (dist / g.startDist),
              MIN_SCALE,
              MAX_SCALE,
            );
            const pct = Math.round(scale.value * 100);
            setZoomPct((cur) => (Math.abs(cur - pct) >= 2 ? pct : cur));
          }
        } else if (g.mode === "pan") {
          tx.value = g.startTx + (evt.nativeEvent.pageX - g.startX);
          ty.value = g.startTy + (evt.nativeEvent.pageY - g.startY);
        }
      },
      onPanResponderRelease: () => {
        gesture.current.mode = "none";
      },
      onPanResponderTerminate: () => {
        gesture.current.mode = "none";
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  const canvasStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  /** Zoom by a factor around the viewport centre. */
  const zoomBy = useCallback(
    (factor: number) => {
      const cx = winW / 2;
      const cy = (winH - 80) / 2;
      const s = scale.value;
      const s2 = clamp(s * factor, MIN_SCALE, MAX_SCALE);
      tx.value = cx - ((cx - tx.value) / s) * s2;
      ty.value = cy - ((cy - ty.value) / s) * s2;
      scale.value = s2;
      setZoomPct(Math.round(s2 * 100));
    },
    [winW, winH, scale, tx, ty],
  );

  const resetView = useCallback(() => {
    if (map) fitToView(map);
  }, [map, fitToView]);

  // ── Node actions ──────────────────────────────────────────────

  const runHelp = useCallback(
    async (mode: "lost" | "more") => {
      if (!selected || !map || helping) return;
      setHelping(true);
      setHelp({ mode, text: "" });
      const prompt =
        mode === "lost"
          ? `I'm lost. Simplify the concept "${selected.label}" from the topic "${map.topic}". Break it into smaller parts, give a simple analogy, and explain any prerequisite concept I need first. Keep it clear and friendly.`
          : `Explore the concept "${selected.label}" from the topic "${map.topic}" further. Go deeper: explain how it works in detail, with a concrete example and how it connects to the rest of the topic.`;
      try {
        const answer = await ask(
          [{ role: "user", content: prompt }],
          (chunk) => setHelp((h) => (h ? { ...h, text: h.text + chunk } : h)),
        );
        setHelp({ mode, text: answer });
      } catch (err) {
        setHelp({
          mode,
          text: "The model couldn't answer right now — check that the offline model is ready, then try again.",
        });
      } finally {
        setHelping(false);
      }
    },
    [selected, map, ask, helping],
  );

  /** Pin the generated help text into the map as a new card linked to the node. */
  const pinToMap = useCallback(() => {
    if (!selected || !map || !help?.text) return;
    const label =
      help.mode === "lost"
        ? `${selected.label} — in simpler terms`
        : `${selected.label} — deeper`;
    const body = help.text.trim();
    if (!body) return;
    const newNode: FocusNode = {
      id: `n-${Date.now()}`,
      label,
      kind: "note" as FocusNodeKind,
      summary: body.slice(0, 110),
      detail: body,
    };
    const next: FocusMap = {
      ...map,
      nodes: [...map.nodes, newNode],
      links: [...map.links, { from: selected.id, to: newNode.id }],
    };
    persistCurrent(next);
    setSelected(null);
    setHelp(null);
  }, [selected, map, help, persistCurrent]);

  const percent = zoomPct;

  // ── Render ────────────────────────────────────────────────────

  const renderEntry = () => (
    <KeyboardScreen paddingBottom={40}>
      <Text style={[theme.typography.display, { color: colors.textPrimary }]}>
        Focus Mode
      </Text>
      <Text
        style={[
          theme.typography.body,
          { color: colors.textSecondary, marginTop: 4, lineHeight: 23 },
        ]}
      >
        Turn a complex topic into a visual map — definitions, parts, processes
        and examples as connected cards you can zoom and explore. Fully offline.
      </Text>

      <TextInput
        value={topicInput}
        onChangeText={setTopicInput}
        placeholder="e.g. The water cycle, Photosynthesis, Market structures…"
        placeholderTextColor={colors.textMuted}
        onSubmitEditing={() => void generate(topicInput)}
        returnKeyType="go"
        style={{
          marginTop: 18,
          backgroundColor: colors.surface,
          borderRadius: theme.radii.md,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          color: colors.textPrimary,
          fontFamily: theme.typography.body.fontFamily,
          fontSize: 15,
          paddingHorizontal: 14,
          paddingVertical: 13,
        }}
      />
      <Pressable
        onPress={() => void generate(topicInput)}
        disabled={!topicInput.trim()}
        style={{
          marginTop: 12,
          alignItems: "center",
          paddingVertical: 14,
          borderRadius: theme.radii.md,
          backgroundColor: topicInput.trim() ? colors.accent : colors.surfaceAlt,
          borderWidth: theme.mode === "pop" && topicInput.trim() ? 2 : 0,
          borderColor: colors.borderStrong,
        }}
      >
        <Text
          style={{
            fontFamily: "PlusJakartaSans_700Bold",
            fontSize: 14,
            color: topicInput.trim() ? "#170B26" : colors.textMuted,
          }}
        >
          Build my concept map
        </Text>
      </Pressable>

      {error ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginTop: 14,
            backgroundColor: colors.errorBg,
            borderRadius: 12,
            padding: 12,
            borderWidth: 1,
            borderColor: colors.error + "44",
          }}
        >
          <Icon name="alert" size={16} color={colors.error} />
          <Text style={[theme.typography.caption, { color: colors.error, flex: 1 }]}>
            {error}
          </Text>
        </View>
      ) : null}

      {savedMaps.length > 0 ? (
        <View style={{ marginTop: 24 }}>
          <Text
            style={[
              theme.typography.captionBold,
              { color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1 },
            ]}
          >
            Your maps
          </Text>
          <View style={{ gap: 8, marginTop: 10 }}>
            {savedMaps.map((m) => (
              <View
                key={m.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  padding: 12,
                  borderRadius: theme.radii.md,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Icon name="sparkle" size={16} color={colors.brand} />
                <Pressable
                  onPress={() => openSaved(m)}
                  style={{ flex: 1 }}
                  hitSlop={6}
                >
                  <Text
                    numberOfLines={1}
                    style={[theme.typography.bodyBold, { color: colors.textPrimary }]}
                  >
                    {m.topic}
                  </Text>
                  <Text style={[theme.typography.caption, { color: colors.textMuted }]}>
                    {m.nodes.length} cards ·{" "}
                    {new Date(m.createdAt).toLocaleDateString()}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    void deleteFocusMap(m.id).then((next) => {
                      setSavedMaps(next);
                      if (map?.id === m.id) setMap(null);
                    })
                  }
                  hitSlop={8}
                >
                  <Icon name="trash" size={15} color={colors.textMuted} />
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </KeyboardScreen>
  );

  const renderGenerating = () => (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
      <ActivityIndicator size="large" color={colors.brand} />
      <Text style={[theme.typography.bodyBold, { color: colors.textPrimary, marginTop: 20 }]}>
        Building your concept map…
      </Text>
      <Text
        style={[
          theme.typography.caption,
          { color: colors.textMuted, marginTop: 6, textAlign: "center", maxWidth: 260 },
        ]}
      >
        The model on your phone is working out the structure — definitions,
        parts, processes and examples. It can take a minute.
      </Text>
    </View>
  );

  const renderWorkspace = () => {
    if (!map || !layout) return null;
    return (
      <View style={{ flex: 1 }}>
        {/* Toolbar */}
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
          <Pressable
            onPress={() => setPhase("entry")}
            hitSlop={8}
            style={{ padding: 4 }}
          >
            <Icon name="chevronLeft" size={20} color={colors.textSecondary} />
          </Pressable>
          <Text
            numberOfLines={1}
            style={[
              theme.typography.bodyBold,
              { color: colors.textPrimary, flex: 1 },
            ]}
          >
            {map.topic}
          </Text>
          <Text style={[theme.typography.small, { color: colors.textMuted }]}>
            {percent}%
          </Text>
        </View>

        {/* Canvas */}
        <View
          style={{ flex: 1, overflow: "hidden" }}
          {...panResponder.panHandlers}
        >
          <Animated.View
            style={[
              {
                position: "absolute",
                left: 0,
                top: 0,
                width: layout.canvasWidth,
                height: layout.canvasHeight,
              },
              canvasStyle,
            ]}
          >
            {/* Connection lines */}
            <Svg
              width={layout.canvasWidth}
              height={layout.canvasHeight}
              style={{ position: "absolute", left: 0, top: 0 }}
            >
              {map.links.map((l, i) => {
                const a = layout.positions[l.from];
                const b = layout.positions[l.to];
                if (!a || !b) return null;
                const x1 = a.x + NODE_W / 2;
                const y1 = a.y + NODE_H / 2;
                const x2 = b.x + NODE_W / 2;
                const y2 = b.y + NODE_H / 2;
                return (
                  <Line
                    key={`${l.from}-${l.to}-${i}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={colors.borderStrong}
                    strokeWidth={1.5}
                    strokeDasharray={l.label ? undefined : "5 4"}
                  />
                );
              })}
            </Svg>

            {/* Node cards */}
            {map.nodes.map((n) => {
              const pos = layout.positions[n.id];
              if (!pos) return null;
              const meta = KIND_META[n.kind];
              return (
                <Pressable
                  key={n.id}
                  onPress={() => {
                    setSelected(n);
                    setHelp(null);
                  }}
                  style={{
                    position: "absolute",
                    left: pos.x,
                    top: pos.y,
                    width: NODE_W,
                    minHeight: NODE_H,
                    backgroundColor: colors.surface,
                    borderRadius: 14,
                    borderWidth: 1.5,
                    borderColor: meta.color + (theme.mode === "glass" ? "99" : "66"),
                    padding: 12,
                    shadowColor: "#000",
                    shadowOpacity: 0.25,
                    shadowRadius: 10,
                    shadowOffset: { width: 0, height: 4 },
                    elevation: 4,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: meta.color,
                      }}
                    />
                    <Text
                      numberOfLines={1}
                      style={[
                        theme.typography.small,
                        {
                          color: meta.color,
                          textTransform: "uppercase",
                          letterSpacing: 0.8,
                        },
                      ]}
                    >
                      {meta.label}
                    </Text>
                  </View>
                  <Text
                    numberOfLines={2}
                    style={[
                      theme.typography.captionBold,
                      { color: colors.textPrimary, marginTop: 6, lineHeight: 18 },
                    ]}
                  >
                    {n.label}
                  </Text>
                  <Text
                    numberOfLines={2}
                    style={[
                      theme.typography.small,
                      { color: colors.textSecondary, marginTop: 4, lineHeight: 15 },
                    ]}
                  >
                    {n.summary}
                  </Text>
                </Pressable>
              );
            })}
          </Animated.View>

          {/* Zoom controls */}
          <View
            style={{
              position: "absolute",
              right: 14,
              bottom: 18,
              alignItems: "center",
              gap: 8,
            }}
          >
            <ZoomBtn label="+" onPress={() => zoomBy(1.25)} />
            <ZoomBtn label="−" onPress={() => zoomBy(0.8)} />
            <ZoomBtn label="⟳" onPress={resetView} />
          </View>

          {/* Hint */}
          <View
            pointerEvents="none"
            style={{ position: "absolute", left: 14, bottom: 18 }}
          >
            <Text style={[theme.typography.small, { color: colors.textMuted }]}>
              Drag to pan · pinch or buttons to zoom · tap a card to open it
            </Text>
          </View>
        </View>

        {/* Node detail sheet */}
        <Modal
          visible={!!selected}
          transparent
          animationType="slide"
          onRequestClose={() => {
            setSelected(null);
            setHelp(null);
          }}
          statusBarTranslucent
          navigationBarTranslucent
        >
          <Pressable
            style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}
            onPress={() => {
              setSelected(null);
              setHelp(null);
            }}
          >
            <Pressable
              onPress={() => {}}
              style={{
                backgroundColor: colors.surface,
                borderTopLeftRadius: 26,
                borderTopRightRadius: 26,
                borderWidth: 1,
                borderColor: colors.border,
                borderBottomWidth: 0,
                padding: 20,
                paddingBottom: 36,
                maxHeight: "80%",
              }}
            >
              {selected ? (
                <View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: KIND_META[selected.kind].color,
                      }}
                    />
                    <Text
                      style={[
                        theme.typography.small,
                        {
                          color: KIND_META[selected.kind].color,
                          textTransform: "uppercase",
                          letterSpacing: 1,
                        },
                      ]}
                    >
                      {KIND_META[selected.kind].label}
                    </Text>
                  </View>
                  <Text style={[theme.typography.h2, { color: colors.textPrimary, marginTop: 8 }]}>
                    {selected.label}
                  </Text>
                  <ScrollView
                    style={{ maxHeight: 240, marginTop: 10 }}
                    showsVerticalScrollIndicator={false}
                  >
                    <Text
                      style={[
                        theme.typography.body,
                        { color: colors.textSecondary, lineHeight: 24 },
                      ]}
                    >
                      {selected.detail ||
                        selected.summary ||
                        "No detail available for this card yet."}
                    </Text>
                  </ScrollView>

                  {/* Actions */}
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                    <Pressable
                      onPress={() => void runHelp("lost")}
                      disabled={helping}
                      style={{
                        flex: 1,
                        alignItems: "center",
                        paddingVertical: 12,
                        borderRadius: theme.radii.md,
                        backgroundColor: colors.surfaceAlt,
                        borderWidth: 1,
                        borderColor: colors.borderStrong,
                      }}
                    >
                      <Text style={[theme.typography.captionBold, { color: colors.textPrimary }]}>
                        I'm lost
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void runHelp("more")}
                      disabled={helping}
                      style={{
                        flex: 1,
                        alignItems: "center",
                        paddingVertical: 12,
                        borderRadius: theme.radii.md,
                        backgroundColor: colors.surfaceAlt,
                        borderWidth: 1,
                        borderColor: colors.borderStrong,
                      }}
                    >
                      <Text style={[theme.typography.captionBold, { color: colors.textPrimary }]}>
                        Explore more
                      </Text>
                    </Pressable>
                  </View>

                  {helping || help ? (
                    <View
                      style={{
                        marginTop: 14,
                        padding: 14,
                        borderRadius: theme.radii.md,
                        backgroundColor: colors.surfaceAlt,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      {helping ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                          <ActivityIndicator size="small" color={colors.brand} />
                          <Text style={[theme.typography.caption, { color: colors.textMuted }]}>
                            {help?.mode === "lost"
                              ? "Simplifying on your phone…"
                              : "Going deeper…"}
                          </Text>
                        </View>
                      ) : null}
                      {help ? (
                        <>
                          <Text
                            selectable
                            style={[
                              theme.typography.caption,
                              { color: colors.textSecondary, lineHeight: 20, marginTop: helping ? 10 : 0 },
                            ]}
                          >
                            {help.text}
                          </Text>
                          {!helping && help.text ? (
                            <Pressable
                              onPress={pinToMap}
                              style={{
                                alignSelf: "flex-start",
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                                marginTop: 12,
                                paddingVertical: 8,
                                paddingHorizontal: 12,
                                borderRadius: theme.radii.pill,
                                backgroundColor: colors.accent,
                              }}
                            >
                              <Icon name="plus" size={13} color="#170B26" />
                              <Text
                                style={{
                                  fontFamily: "PlusJakartaSans_700Bold",
                                  fontSize: 12,
                                  color: "#170B26",
                                }}
                              >
                                Pin to map
                              </Text>
                            </Pressable>
                          ) : null}
                        </>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    );
  };

  if (phase === "entry") return renderEntry();
  if (phase === "generating") return renderGenerating();
  return renderWorkspace();
}

function ZoomBtn({ label, onPress }: { label: string; onPress: () => void }) {
  const { theme } = useTheme();
  const colors = theme.colors;
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 5,
      }}
    >
      <Text style={{ fontSize: 18, color: colors.textPrimary, fontFamily: "PlusJakartaSans_700Bold" }}>
        {label}
      </Text>
    </Pressable>
  );
}
