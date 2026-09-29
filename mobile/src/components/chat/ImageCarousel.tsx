/**
 * ImageCarousel + fullscreen viewer — the one image strip shared by every
 * Premium AI chat surface (companion chat, reader agent, focus agent).
 *
 * Behaviour contract:
 *  - Thumb-first loading: each tile resolves through the disk cache
 *    (cachedImageUri) before it renders — no blind network hits, no
 *    flashing placeholder swap once loaded.
 *  - Per-image states: skeleton → loaded | error (retry re-runs the cache
 *    resolution). One broken tile never blocks the others.
 *  - Tap → fullscreen Modal viewer: swipe between images, pinch-free zoom
 *    kept simple (fit-screen), license/credit caption, works from both
 *    chat surfaces through this single component.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../theme/ThemeContext";
import { Icon } from "../icons";
import { cachedImageUri } from "./imageCache";
import type { ChatImage } from "./types";

const TILE = 132;
const RADIUS = 14;

type TileState =
  | { status: "loading" }
  | { status: "loaded"; uri: string }
  | { status: "error" };

/** Resolve one tile's display URI through the disk cache; retryable. */
function useTileUri(url: string | null | undefined): [TileState, () => void] {
  const [state, setState] = useState<TileState>(
    url ? { status: "loading" } : { status: "error" },
  );
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    if (!url) {
      setState({ status: "error" });
      return;
    }
    setState({ status: "loading" });
    cachedImageUri(url)
      .then((uri) => {
        if (alive) setState({ status: "loaded", uri });
      })
      .catch(() => {
        if (alive) setState({ status: "error" });
      });
    return () => {
      alive = false;
    };
  }, [url, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return [state, retry];
}

function Tile({
  image,
  onPress,
}: {
  image: ChatImage;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const styles = makeStyles(theme);
  const [state, retry] = useTileUri(image.thumbUrl || image.url);

  return (
    <Pressable
      onPress={onPress}
      style={[styles.tile, { borderColor: colors.border }]}
      accessibilityRole="imagebutton"
      accessibilityLabel={image.title ?? "Related image"}
    >
      {state.status === "loaded" ? (
        <Image
          source={{ uri: state.uri }}
          style={styles.tileImage}
          resizeMode="cover"
        />
      ) : state.status === "loading" ? (
        <View style={[styles.tileCenter, { backgroundColor: colors.surfaceAlt }]}>
          <ActivityIndicator size="small" color={colors.brand} />
        </View>
      ) : (
        <Pressable
          style={[styles.tileCenter, { backgroundColor: colors.surfaceAlt }]}
          onPress={retry}
          accessibilityRole="button"
          accessibilityLabel="Retry loading image"
        >
          <Icon name="alert" size={18} color={colors.error} />
          <Text style={[styles.tileRetry, { color: colors.textMuted }]}>
            Tap to retry
          </Text>
        </Pressable>
      )}
    </Pressable>
  );
}

function ViewerSlide({ image }: { image: ChatImage }) {
  const [state, retry] = useTileUri(image.url);
  const { theme } = useTheme();
  const colors = theme.colors;
  if (state.status === "loaded") {
    return (
      <Image
        source={{ uri: state.uri }}
        style={styles_get().viewerImage}
        resizeMode="contain"
      />
    );
  }
  if (state.status === "loading") {
    return <ActivityIndicator size="large" color={colors.brand} />;
  }
  return (
    <Pressable onPress={retry} style={styles_get().viewerError}>
      <Icon name="alert" size={22} color={colors.error} />
      <Text style={[styles_get().viewerErrorText, { color: colors.textSecondary }]}>
        Couldn&apos;t load this image — tap to retry
      </Text>
    </Pressable>
  );
}

/**
 * The carousel. Renders nothing when `images` is empty — text-only answers
 * stay text-only. License/credit lives in the fullscreen viewer (tap ⋃ the
 * strip stays compact in chat).
 */
export function ImageCarousel({ images }: { images: ChatImage[] }) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const styles = makeStyles(theme);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!images || images.length === 0) return null;

  return (
    <View>
      <FlatList
        horizontal
        data={images}
        keyExtractor={(item, i) => `${i}-${item.url}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
        renderItem={({ item, index }) => (
          <Tile image={item} onPress={() => setOpenIndex(index)} />
        )}
      />
      <FullscreenViewer
        images={images}
        initialIndex={openIndex}
        onClose={() => setOpenIndex(null)}
      />
    </View>
  );
}

function FullscreenViewer({
  images,
  initialIndex,
  onClose,
}: {
  images: ChatImage[];
  initialIndex: number | null;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const insets = useSafeAreaInsets();
  const vStyles = styles_get();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (initialIndex !== null) setIndex(initialIndex);
  }, [initialIndex]);

  const current = images[index];
  const attribution =
    current?.credit || current?.license
      ? [current.credit, current.license].filter(Boolean).join(" · ")
      : null;

  return (
    <Modal
      visible={initialIndex !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[vStyles.viewerRoot, { backgroundColor: colors.overlay }]}>
        <Pressable
          style={[
            vStyles.viewerClose,
            { top: insets.top + 8 },
          ]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close image viewer"
        >
          <Icon name="x" size={18} color={colors.textPrimary} />
        </Pressable>
        <FlatList
          horizontal
          pagingEnabled
          data={images}
          keyExtractor={(item, i) => `${i}-${item.url}`}
          initialScrollIndex={index}
          getItemLayout={(_, i) => ({
            length: Dimensions.get("window").width,
            offset: Dimensions.get("window").width * i,
            index: i,
          })}
          onMomentumScrollEnd={(e) => {
            const w = Dimensions.get("window").width;
            setIndex(Math.round(e.nativeEvent.contentOffset.x / w));
          }}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => <ViewerSlide image={item} />}
        />
        <View
          style={[
            vStyles.viewerCaption,
            { paddingBottom: insets.bottom + 14 },
          ]}
          pointerEvents="none"
        >
          {current?.title ? (
            <Text
              style={[vStyles.viewerTitle, { color: colors.textPrimary }]}
              numberOfLines={1}
            >
              {current.title}
            </Text>
          ) : null}
          {attribution ? (
            <Text
              style={[vStyles.viewerAttribution, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {attribution}
            </Text>
          ) : null}
          <Text style={[vStyles.viewerCount, { color: colors.textMuted }]}>
            {index + 1} / {images.length}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (theme: ReturnType<typeof useTheme>["theme"]) => {
  const colors = theme.colors;
  return StyleSheet.create({
    tile: {
      width: TILE,
      height: TILE,
      borderRadius: RADIUS,
      borderWidth: 1,
      overflow: "hidden",
      backgroundColor: colors.surfaceAlt,
    },
    tileImage: { width: "100%", height: "100%" },
    tileCenter: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      padding: 8,
    },
    tileRetry: {
      fontSize: 11,
      fontFamily: theme.typography.caption.fontFamily,
      textAlign: "center",
    },
    strip: { gap: 10, paddingVertical: 6 },
  });
};

/** Viewer styles are static (safe-area handled by insets at call time). */
let viewerStyles: ReturnType<typeof makeViewerStyles> | null = null;
function styles_get() {
  if (!viewerStyles) viewerStyles = makeViewerStyles();
  return viewerStyles;
}
function makeViewerStyles() {
  const { width } = Dimensions.get("window");
  const { height } = Dimensions.get("window");
  return StyleSheet.create({
    viewerRoot: {
      flex: 1,
      justifyContent: "center",
    },
    viewerClose: {
      position: "absolute",
      right: 12,
      zIndex: 10,
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
    },
    viewerImage: { width, height: height * 0.72 },
    viewerError: { alignItems: "center", gap: 8, paddingHorizontal: 32 },
    viewerErrorText: { fontSize: 13, textAlign: "center", lineHeight: 19 },
    viewerCaption: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 20,
      paddingBottom: 18,
      alignItems: "center",
      gap: 3,
    },
    viewerTitle: {
      fontSize: 13,
      fontWeight: "600",
      textAlign: "center",
    },
    viewerAttribution: { fontSize: 11, textAlign: "center" },
    viewerCount: { fontSize: 11, marginTop: 4 },
  });
}
