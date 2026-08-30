import React, { useEffect, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  type KeyboardEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeContext";
import { ThemedScreen } from "./Surface";

/**
 * Reusable keyboard-safe screen wrapper.
 *
 * Combines the pieces every input screen needs so none of them have to
 * hand-roll it:
 *   - SafeAreaView (react-native-safe-area-context) for notch/home-bar insets
 *   - KeyboardAvoidingView — `padding` on iOS (reliable there). On Android we
 *     use Expo's edge-to-edge layout (app.json softwareKeyboardLayoutMode:
 *     "pan"), where the window is NEVER natively resized or panned, so the
 *     keyboard would simply cover the footer/composer. Instead we track the
 *     real keyboard height from the `Keyboard` events and pad the content by
 *     that exact amount (`useKeyboardHeight`) — deterministic across all
 *     Android versions including 15+ / edge-to-edge.
 *   - ScrollView with `flexGrow: 1` + `keyboardShouldPersistTaps="handled"` so
 *     inputs scroll above the keyboard and taps on buttons dismiss it
 *
 * `themed={false}` renders the plain themed background (no ambient blobs) —
 * used by the auth screens, which are deliberately flat. `footer` pins content
 * below the scroll area and above the keyboard (the chat composer).
 *
 * Because the composer/footer is lifted by exactly the keyboard height, the
 * field you're typing in always stays visible right above the keyboard.
 */

/** Measured on-screen keyboard height. Non-zero only while visible (Android). */
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const show = (e: KeyboardEvent) => setHeight(e.endCoordinates?.height ?? 0);
    const hide = () => setHeight(0);

    const subs = [
      // iOS is handled by the KAV; we only measure on Android.
      Platform.OS === "android" &&
        Keyboard.addListener("keyboardDidShow", show),
      Platform.OS === "android" && Keyboard.addListener("keyboardDidHide", hide),
      // Smooth updates while the keyboard animates up/down (Android API 30+);
      // on hide it reports 0, which clears the pad.
      Platform.OS === "android" &&
        Keyboard.addListener("keyboardDidChangeFrame", show),
    ].filter(Boolean) as { remove: () => void }[];

    return () => subs.forEach((s) => s.remove());
  }, []);

  return Platform.OS === "android" ? height : 0;
}

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
  const androidKbHeight = useKeyboardHeight();

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
        style={[
          { flex: 1 },
          Platform.OS === "android" && { paddingBottom: androidKbHeight },
        ]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
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