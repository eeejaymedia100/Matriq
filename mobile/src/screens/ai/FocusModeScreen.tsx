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
import Svg, { Line } from "react-native-svg";
import { useRoute, type RouteProp } from "@react-navigation/native";
import type { MainStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardScreen } from "../../components/KeyboardScreen";
import { Icon } from "../../components/icons";
import { api, ApiError } from "../../api/client";
import { useEntitlement } from "../../hooks/useEntitlement";
import {
  KIND_META,
  layoutFocusMap,
  NODE_W,
  NODE_H,
  backendFocusMapToClient,
  type BackendFocusMap,
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

/** Whether a stored map is a cloud (server-synced) map. */
function serverSessionIdOf(map: FocusMap | null): string | null {
  if (!map) return null;
  const m = /^remote-(.+)$/.exec(map.id);
  return m ? m[1] : null;
}

export function FocusModeScreen() {
  const { theme } = useTheme();
  const colors = theme.colors;
  const route = useRoute<RouteProp<MainStackParamList, "AiFocus">>();
  const { width: winW, height: winH } = useWindowDimensions();
  const { status: ent, loading: entLoading, refresh: refreshEnt } = useEntitlement();

  const [phase, setPhase] = useState<Phase>("entry");
  const [topicInput, setTopicInput] = useState(route.params?.topic ?? "");
  const [savedMaps, setSavedMaps] = useState<FocusMap[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [map, setMap] = useState<FocusMap | null>(null);
  const [selected, setSelected] = useState<FocusNode | null>(null);
  const [help, setHelp] = useState<{ mode: "lost" | "more"; text: string } | null>(null);
  const [helping, setHelping] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

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
      setTimeout(() => fitToView(m), 60);
    });
    return () => {
      mounted = false;
    };
  }, [route.params?.mapId]);

  // Refresh the saved list + entitlement on entry.
  useEffect(() => {
    if (phase === "entry") {
      void loadSaved();
      void refreshEnt();
    }
  }, [phase, loadSaved, refreshEnt]);

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
   * Cloud Focus Mode — DeepSeek powers the map through the BACKEND. The app
   * only ever talks to Matriq; the API key never leaves the server. Free
   * users get a starter allowance before Magic Plus is required.
   */
  const generate = useCallback(
    async (topic: string) => {
      const t = topic.trim();
      if (!t) return;
      setPhase("generating");
      setError(null);
      try {
        const res = await api.post<{
          map: BackendFocusMap;
          sessionId: string;
          cached: boolean;
        }>("/focus/generate", { topic: t });
        const m = backendFocusMapToClient(res.map);
        // Tag with the server session id so expansion can reach the same map.
        m.id = `remote-${res.sessionId}`;
        setMap(m);
        await saveFocusMap(m);
        setPhase("ready");
        void refreshEnt();
        setTimeout(() => fitToView(m), 60);
      } catch (err) {
        setPhase("entry");
        if (err instanceof ApiError) {
          if (err.code === "MAGIC_PLUS_REQUIRED") {
            setError(
              "You've used your free Focus Mode generations. Focus Mode is a Magic Plus feature — get Magic Plus to keep mapping complex topics with cloud AI.",
            );
            return;
          }
          if (err.code === "FOCUS_RATE_LIMITED") {
            setError(err.message);
            return;
          }
          if (err.status === 429) {
            setError("You're moving too fast — please wait a moment and try again.");
            return;
          }
        }
        setError(
          "Focus Mode couldn't build a map right now. Check your connection and try again in a moment.",
        );
      }
    },
    [fitToView, refreshEnt],
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

  // ── Node actions (staged cloud detail) ─────────────────────────

  /**
   * Expand a concept into a fuller explanation. This is stage 2 of the staged
   * architecture: detailed explanations are only generated when the student
   * opens a concept, not up front for every map. Goes through the backend
   * (payload = just the one concept id — no history/documents sent up).
   */
  const expandConcept = useCallback(
    async (mode: "lost" | "more") => {
      if (!selected || !map || helping) return;
      const sessionId = serverSessionIdOf(map);
      if (!sessionId) {
        setHelp({
          mode,
          text: "This older local map can't be expanded — generate a new cloud map to use AI explanations.",
        });
        return;
      }
      setHelping(true);
      setHelp({ mode, text: "" });
      try {
        const res = await api.post<{
          concept: {
            detail: string;
            importance?: string;
            examples?: string[];
          };
        }>(`/focus/maps/${sessionId}/expand`, { conceptId: selected.id });
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

        setHelp({ mode, text: parts.length ? parts.join("\n\n") : c.detail });

        // Persist the expanded detail into the node so reopening shows it.
        if (map && c.detail?.trim()) {
          const next: FocusMap = {
            ...map,
            nodes: map.nodes.map((n) =>
              n.id === selected.id
                ? { ...n, detail: c.detail! }
                : n,
            ),
          };
          setExpandedIds((s) => new Set(s).add(selected.id));
          persistCurrent(next);
        }
      } catch (err) {
        if (err instanceof ApiError && err.code === "MAGIC_PLUS_REQUIRED") {
          setHelp({
            mode,
            text: "Expanding concepts uses cloud AI, which is part of Magic Plus. You've used your free allowance — upgrade to keep going.",
          });
        } else if (err instanceof ApiError && err.code === "FOCUS_RATE_LIMITED") {
          setHelp({ mode, text: err.message });
        } else {
          setHelp({
            mode,
            text: "The AI couldn't expand this right now. Check your connection and try again in a moment.",
          });
        }
      } finally {
        setHelping(false);
      }
    },
    [selected, map, helping, persistCurrent],
  );

  /** Pin the expanded text into the map as a new card linked to the node. */
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

  const renderEntitlementNote = () => {
    if (ent == null) return null;
    if (ent.isPremium) {
      return (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginTop: 14,
            backgroundColor: colors.brand + "1A",
            borderRadius: 12,
            padding: 10,
          }}
        >
          <Icon name="sparkle" size={15} color={colors.brand} />
          <Text style={[theme.typography.caption, { color: colors.textPrimary, flex: 1 }]}>
            You have Magic Plus — unlimited cloud Focus Mode.
          </Text>
        </View>
      );
    }
    if (ent.freeRemaining != null) {
      return (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginTop: 14,
            backgroundColor: colors.surfaceAlt,
            borderRadius: 12,
            padding: 10,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Icon name="sparkle" size={15} color={colors.accent} />
          <Text style={[theme.typography.caption, { color: colors.textSecondary, flex: 1 }]}>
            Feature powered by cloud AI. You have{" "}
            <Text style={{ fontFamily: "PlusJakartaSans_700Bold", color: colors.textPrimary }}>
              {ent.freeRemaining}
            </Text>{" "}
            free{" "}
            {ent.freeRemaining === 1 ? "map" : "maps"} left — then it becomes a Magic Plus
            feature.
          </Text>
        </View>
      );
    }
    return null;
  };

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
        and examples as connected cards you can zoom and explore. Powered by cloud
        AI (a Magic Plus feature).
      </Text>

      {/* Premium / free-allowance messaging */}
      {entLoading ? null : renderEntitlementNote()}

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
          { color: colors.textMuted, marginTop: 6, textAlign: "center", maxWidth: 280 },
        ]}
      >
        Cloud AI is working out the structure — definitions, parts, processes
        and examples. Just a few seconds.
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
            style={[theme.typography.bodyBold, { color: colors.textPrimary, flex: 1 }]}
          >
            {map.topic}
          </Text>
          <Text style={[theme.typography.small, { color: colors.textMuted }]}>
            {percent}%
          </Text>
        </View>

        {/* Canvas */}
        <View style={{ flex: 1, overflow: "hidden" }} {...panResponder.panHandlers}>
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
            style={{ position: "absolute", right: 14, bottom: 18, alignItems: "center", gap: 8 }}
          >
            <ZoomBtn label="+" onPress={() => zoomBy(1.25)} />
            <ZoomBtn label="−" onPress={() => zoomBy(0.8)} />
            <ZoomBtn label="⟳" onPress={resetView} />
          </View>

          {/* Hint */}
          <View pointerEvents="none" style={{ position: "absolute", left: 14, bottom: 18 }}>
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
                    {expandedIds.has(selected.id) ? (
                      <Text
                        style={[
                          theme.typography.caption,
                          { color: colors.textMuted, marginTop: 8 },
                        ]}
                      >
                        Expanded with AI ✓
                      </Text>
                    ) : null}
                  </ScrollView>

                  {/* Actions */}
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                    <Pressable
                      onPress={() => void expandConcept("lost")}
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
                        In simpler terms
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void expandConcept("more")}
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
                              ? "Simplifying…"
                              : "Going deeper with AI…"}
                          </Text>
                        </View>
                      ) : null}
                      {help ? (
                        <>
                          <Text
                            selectable
                            style={[
                              theme.typography.caption,
                              {
                                color: colors.textSecondary,
                                lineHeight: 20,
                                marginTop: helping ? 10 : 0,
                              },
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