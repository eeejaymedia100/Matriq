import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeContext";
import { ThemedScreen } from "./Surface";

/**
 * Reusable keyboard-safe screen wrapper.
 *
 * Combines the three pieces every input screen needs so none of them have to
 * hand-roll it:
 *   - SafeAreaView (react-native-safe-area-context) for notch/home-bar insets
 *   - KeyboardAvoidingView — `padding` on both platforms. app.json sets
 *     `softwareKeyboardLayoutMode: "pan"` on Android (the OS never resizes the
 *     window), so the KAV pads the content by the measured keyboard height.
 *     This is deterministic across Android versions — including Android 15+
 *     edge-to-edge, where `adjustResize` stops resizing and the keyboard
 *     would otherwise cover inputs/composers.
 *   - ScrollView with `flexGrow: 1` + `keyboardShouldPersistTaps="handled"` so
 *     inputs scroll above the keyboard and taps on buttons dismiss it
 *
 * `themed={false}` renders the plain themed background (no ambient blobs) —
 * used by the auth screens, which are deliberately flat. `footer` pins content
 * below the scroll area and above the keyboard (the chat composer).
 */
interface KeyboardScreenProps {
  children: React.ReactNode;
  /** Wrap in ThemedScreen (bg + ambient blobs). false = flat themed bg (auth). */
  themed?: boolean;
  /** true = ScrollView; false = plain flex View (chat lists, centered layouts). */
  scroll?: boolean;
  /** Vertically center the content (login / passcode style). */
  center?: boolean;
  /** Content padding (default 24; pass 0 + contentContainerStyle for custom). */
  padding?: number;
  paddingTop?: number;
  paddingBottom?: number;
  /** Safe-area edges. Defaults to bottom/left/right (headers handle top). */
  edges?: Edge[];
  /** iOS-only: offset for headers/translucent bars above the keyboard. */
  keyboardVerticalOffset?: number;
  /** Rendered below the scroll area, above the keyboard (chat composer). */
  footer?: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  blobs?: boolean;
  showsVerticalScrollIndicator?: boolean;
  keyboardShouldPersistTaps?: boolean | "always" | "never" | "handled";
  keyboardDismissMode?: "none" | "interactive" | "on-drag";
}

export function KeyboardScreen({
  children,
  themed = true,
  scroll = true,
  center = false,
  padding = 24,
  paddingTop,
  paddingBottom,
  edges = ["bottom", "left", "right"],
  keyboardVerticalOffset = 0,
  footer,
  contentContainerStyle,
  style,
  blobs = true,
  showsVerticalScrollIndicator = false,
  keyboardShouldPersistTaps = "handled",
  keyboardDismissMode,
}: KeyboardScreenProps) {
  const { theme } = useTheme();

  const contentStyle: StyleProp<ViewStyle> = [
    scroll ? { flexGrow: 1 } : { flex: 1 },
    { padding },
    paddingTop != null && { paddingTop },
    paddingBottom != null && { paddingBottom },
    center && { justifyContent: "center" },
    contentContainerStyle,
  ];

  const body = (
    <SafeAreaView style={{ flex: 1 }} edges={edges}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        {scroll ? (
          <ScrollView
            contentContainerStyle={contentStyle}
            keyboardShouldPersistTaps={keyboardShouldPersistTaps}
            keyboardDismissMode={keyboardDismissMode}
            showsVerticalScrollIndicator={showsVerticalScrollIndicator}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={contentStyle}>{children}</View>
        )}
        {footer}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  if (!themed) {
    return (
      <View style={[{ flex: 1, backgroundColor: theme.colors.bg }, style]}>
        {body}
      </View>
    );
  }
  return (
    <ThemedScreen blobs={blobs} style={style}>
      {body}
    </ThemedScreen>
  );
}
