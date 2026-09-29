import React from "react";
import {
  ScrollView,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
// Keyboard avoidance comes from react-native-keyboard-controller (see the
// comment at the KeyboardAvoidingView below). RN core's KeyboardAvoidingView
// cannot see the keyboard on edge-to-edge Android (SDK 35+ enforcement), so
// it silently applied zero padding — the root cause of "text fields stay
// static when the keyboard opens". The RNKC variant reads the real IME
// insets via the root KeyboardProvider and drives layout on the UI thread.
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView, useSafeAreaInsets, type Edge } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeContext";
import { ThemedScreen } from "./Surface";

/**
 * Reusable keyboard-safe screen wrapper — one keyboard strategy for the whole
 * app, on both platforms.
 *
 *   - SafeAreaView (react-native-safe-area-context) for notch/home-bar insets
 *   - KeyboardAvoidingView from react-native-keyboard-controller with
 *     `behavior="padding"` + `automaticOffset`. On both platforms the KAV
 *     pads the bottom of its content by exactly the keyboard overlap: on iOS
 *     the keyboard overlays the window; on Android the app is edge-to-edge
 *     (SDK 35+ enforces it), the window is NEVER resized, and the keyboard
 *     arrives as an animated IME inset that only react-native-keyboard-controller
 *     reports faithfully (RN core's KeyboardAvoidingView sees nothing — that
 *     was the app-wide bug). `automaticOffset` self-measures the screen's
 *     position (navigation header, modal stack) so header height math is no
 *     longer needed; `keyboardVerticalOffset` stays available for unusual
 *     floating bars. flex:1 children (chat lists, forms) re-layout into the
 *     remaining viewport and the `footer` (chat composer) stays in the normal
 *     layout flow, directly above the keyboard. Padding returns to zero when
 *     the keyboard hides.
 *   - ScrollView with flexGrow:1 + keyboardShouldPersistTaps="handled" so
 *     inputs scroll above the keyboard and taps on buttons dismiss it.
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
  /**
   * Extra offset added to the automatically-derived header height. Only needed
   * for unusual setups (e.g. a translucent bar that floats above the screen
   * content but below the navigator header).
   */
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
  const insets = useSafeAreaInsets();

  // The status-bar strip: opaque, exactly the theme background, sits only
  // over the inset area. Edge-to-edge Android draws content under a
  // translucent status bar, so scrolling text collided with the clock —
  // the "everything is transparent" complaint. Platforms solve it by never
  // letting content show through that zone; this does the same, quietly:
  // on Glass it's invisible against the dark bg, on Pop against the light.
  // pointerEvents="none" keeps it purely visual; web insets are 0 → no-op.
  const topStrip =
    insets.top > 0 && edges.includes("top") ? (
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: insets.top,
          backgroundColor: theme.colors.bg,
          zIndex: 1,
        }}
      />
    ) : null;

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
      {topStrip}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        automaticOffset
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
