import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  ViewToken,
  ActivityIndicator,
} from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { Icon, type IconName } from "./icons";
import {
  parseReflowBlocks,
  type ReflowBlock,
} from "../utils/reflow";
import {
  getHighlights,
  addHighlight,
  removeHighlight,
  savePosition,
  getPosition,
  getReaderFontScale,
  saveReaderFontScale,
  highlightsToNoteBody,
  FONT_SCALE_MIN,
  FONT_SCALE_MAX,
  FONT_SCALE_DEFAULT,
  type ReflowHighlight,
} from "../utils/reflowHighlights";
import { newNoteId, upsertNote } from "../utils/notes";

/**
 * ReflowReader — the "mobile view" for A4 documents.
 *
 * Extracted text is re-typeset into full-width block cards: heading /
 * paragraph / list / slide-break. One block per screen-card, vertical swipe
 * to advance (the gesture students already live in), big controllable type,
 * long-press to highlight, highlights convert to a cited note. Reading
 * position persists per document. Fully offline once text is extracted.
 *
 * The A4 (original) view stays one toggle away in the host screen — this
 * component owns only the Reflow presentation.
 */

export interface ReflowReaderHandle {
  /** Jump to a block (used by position restore). */
  scrollToBlock: (index: number) => void;
}

const HIGHLIGHT_COLORS: Record<ReflowHighlight["color"], { bg: string; label: string }> = {
  lime: { bg: "rgba(198,255,61,0.28)", label: "Lime" },
  brand: { bg: "rgba(123,75,196,0.22)", label: "Violet" },
  warning: { bg: "rgba(255,190,60,0.25)", label: "Amber" },
};

export function ReflowReader({
  text,
  docId,
  sourceLabel,
  firstLineIsTitle,
}: {
  text: string;
  docId: string;
  sourceLabel: string;
  /** Deck provenance: the document's first line is a slide title. */
  firstLineIsTitle?: boolean;
}) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const styles = makeStyles(colors);

  const blocks = useMemo<ReflowBlock[]>(
    () => parseReflowBlocks(text, { firstLineIsTitle }),
    [text, firstLineIsTitle],
  );

  const [fontScale, setFontScale] = useState(FONT_SCALE_DEFAULT);
  const [highlights, setHighlights] = useState<ReflowHighlight[]>([]);
  const [activeBlock, setActiveBlock] = useState(0);
  const [savedNote, setSavedNote] = useState(false);
  const [ready, setReady] = useState(false);
  const listRef = useRef<FlatList<ReflowBlock> | null>(null);
  const fontScaleLoaded = useRef(false);

  // Load persisted settings + highlights + position.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [scale, hls, pos] = await Promise.all([
        getReaderFontScale(),
        getHighlights(docId),
        getPosition(docId),
      ]);
      if (!alive) return;
      setFontScale(scale);
      setHighlights(hls);
      fontScaleLoaded.current = true;
      if (pos && pos.blockIndex > 0 && pos.blockIndex < blocks.length) {
        requestAnimationFrame(() => {
          listRef.current?.scrollToIndex({
            index: pos.blockIndex,
            viewPosition: 0,
            animated: false,
          });
        });
      }
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [docId, blocks.length]);

  // Persist font scale after the initial load applied it.
  useEffect(() => {
    if (fontScaleLoaded.current) {
      void saveReaderFontScale(fontScale);
    }
  }, [fontScale]);

  // Viewability: current block for progress + position persistence.
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
        const idx = viewableItems[0].index ?? 0;
        setActiveBlock(idx);
        void savePosition(docId, idx);
      }
    },
  ).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const highlightsByBlock = useMemo(() => {
    const map = new Map<number, ReflowHighlight[]>();
    for (const h of highlights) {
      const list = map.get(h.blockIndex) ?? [];
      list.push(h);
      map.set(h.blockIndex, list);
    }
    return map;
  }, [highlights]);

  const toggleHighlight = useCallback(
    async (blockIndex: number, quote: string) => {
      const existing = highlights.find(
        (h) => h.blockIndex === blockIndex && h.quote === quote,
      );
      if (existing) {
        await removeHighlight(existing.id);
        setHighlights((prev) => prev.filter((h) => h.id !== existing.id));
        return;
      }
      const created = await addHighlight({
        docId,
        blockIndex,
        quote,
        blockTextStart: 0,
        color: "lime",
      });
      setHighlights((prev) => [...prev, created]);
    },
    [docId, highlights],
  );

  const highlightsAsNote = useCallback(async () => {
    const mine = highlights;
    if (!mine.length) return;
    const now = Date.now();
    const id = newNoteId();
    await upsertNote({
      id,
      title: `Highlights — ${sourceLabel}`.slice(0, 80),
      body: highlightsToNoteBody(mine, sourceLabel),
      createdAt: now,
      updatedAt: now,
      meta: { source: "ocr", label: sourceLabel },
    });
    setSavedNote(true);
    setTimeout(() => setSavedNote(false), 2200);
  }, [highlights, sourceLabel]);

  const renderItem = useCallback(
    ({ item, index }: { item: ReflowBlock; index: number }) => {
      if (item.type === "slide_break") {
        return (
          <View style={styles.slideBreak}>
            <View style={styles.slideBreakLine} />
            <Text style={styles.slideBreakText}>{item.text}</Text>
            <View style={styles.slideBreakLine} />
          </View>
        );
      }

      const blockHighlights = highlightsByBlock.get(index) ?? [];
      const isHighlighted = blockHighlights.length > 0;
      const bodyFontSize =
        item.type === "heading" ? fontScale * 1.3 : fontScale;
      const isLast = index === blocks.length - 1;

      return (
        <View style={styles.card}>
          <Pressable
            onLongPress={() =>
              void toggleHighlight(index, item.text.slice(0, 240))
            }
            delayLongPress={380}
            accessibilityLabel={
              isHighlighted ? "Highlighted. Long-press to remove." : "Long-press to highlight"
            }
          >
            {isHighlighted ? (
              <View
                style={[
                  styles.highlightLayer,
                  { backgroundColor: HIGHLIGHT_COLORS[blockHighlights[0].color].bg },
                ]}
              />
            ) : null}
            <Text
              selectable
              style={
                item.type === "heading"
                  ? [styles.headingText, { fontSize: bodyFontSize }]
                  : [styles.bodyText, { fontSize: bodyFontSize }]
              }
            >
              {item.text}
            </Text>
          </Pressable>
          {isLast ? (
            <Text style={styles.endMark}>— end —</Text>
          ) : null}
        </View>
      );
    },
    [styles, fontScale, highlightsByBlock, toggleHighlight, blocks.length],
  );

  if (blocks.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>Nothing readable here yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {/* Progress hairline */}
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${Math.round(((activeBlock + 1) / blocks.length) * 100)}%`,
              backgroundColor: colors.accent,
            },
          ]}
        />
      </View>

      <FlatList
        ref={listRef}
        data={blocks}
        keyExtractor={(_, i) => `block-${i}`}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        pagingEnabled
        nestedScrollEnabled
        removeClippedSubviews
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={5}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onScrollToIndexFailed={(info) => {
          // FlatList needs a moment for off-screen indices; retry after layout.
          setTimeout(
            () =>
              listRef.current?.scrollToIndex({
                index: info.index,
                viewPosition: 0,
                animated: false,
              }),
            60,
          );
        }}
      />

      {/* Controls: font size, progress, highlights → note */}
      <View style={styles.controls}>
        <View style={styles.fontControls}>
          <Pressable
            onPress={() => setFontScale((s) => Math.max(FONT_SCALE_MIN, s - 1))}
            style={styles.fontButton}
            accessibilityLabel="Decrease text size"
          >
            <Text style={styles.fontButtonText}>A−</Text>
          </Pressable>
          <Text style={styles.progressText}>
            {activeBlock + 1}/{blocks.length}
          </Text>
          <Pressable
            onPress={() => setFontScale((s) => Math.min(FONT_SCALE_MAX, s + 1))}
            style={styles.fontButton}
            accessibilityLabel="Increase text size"
          >
            <Text style={styles.fontButtonText}>A+</Text>
          </Pressable>
        </View>
        {highlights.length > 0 ? (
          <Pressable
            onPress={() => void highlightsAsNote()}
            style={[styles.noteButton, savedNote && styles.noteButtonDone]}
          >
            <Icon name={savedNote ? "check" : "pen"} size={14} color="#170B26" />
            <Text style={styles.noteButtonText}>
              {savedNote ? "Saved" : `${highlights.length} → note`}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const makeStyles = (colors: any) =>
  StyleSheet.create({
    wrap: { flex: 1, backgroundColor: colors.bg },
    progressTrack: {
      height: 3,
      backgroundColor: colors.surfaceAlt,
      overflow: "hidden",
    },
    progressFill: { height: 3 },
    card: {
      flex: 1,
      paddingHorizontal: 24,
      justifyContent: "center",
      backgroundColor: colors.bg,
    },
    highlightLayer: {
      position: "absolute",
      left: 18,
      right: 18,
      top: 8,
      bottom: 8,
      borderRadius: 10,
    },
    headingText: {
      color: colors.textPrimary,
      fontFamily: "Fraunces_700Bold",
      fontWeight: "700",
      lineHeight: 34,
    },
    bodyText: {
      color: colors.textPrimary,
      lineHeight: 26,
    },
    slideBreak: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      backgroundColor: colors.bg,
    },
    slideBreakLine: { height: 1, width: 42, backgroundColor: colors.border },
    slideBreakText: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1,
    },
    endMark: {
      color: colors.textMuted,
      fontSize: 12,
      textAlign: "center",
      marginTop: 18,
    },
    controls: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
    fontControls: { flexDirection: "row", alignItems: "center", gap: 12 },
    fontButton: {
      width: 40,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceAlt,
    },
    fontButtonText: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
    progressText: { color: colors.textMuted, fontSize: 12, fontWeight: "600", minWidth: 48, textAlign: "center" },
    noteButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: colors.accent,
    },
    noteButtonDone: { backgroundColor: colors.success },
    noteButtonText: { color: "#170B26", fontSize: 12, fontWeight: "700" },
    emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
    emptyText: { color: colors.textMuted, fontSize: 14 },
  });
