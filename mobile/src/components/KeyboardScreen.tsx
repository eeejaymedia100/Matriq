import React, { useContext } from "react";
import {
  KeyboardAvoidingView,
  ScrollView,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { HeaderHeightContext } from "@react-navigation/elements";
import { useTheme } from "../theme/ThemeContext";
import { ThemedScreen } from "./Surface";

/**
 * Reusable keyboard-safe screen wrapper — one keyboard strategy for the whole
 * app, on both platforms.
 *
 *   - SafeAreaView (react-native-safe-area-context) for notch/home-bar insets
 *   - KeyboardAvoidingView with `behavior="padding"`. On iOS the keyboard
 *     overlays the window, so the KAV pads the bottom of its content by the
 *     keyboard height. On Android the app is edge-to-edge (Expo SDK 53+,
 *     gradle `edgeToEdgeEnabled=true`, manifest `adjustResize` via
 *     android.softwareKeyboardLayoutMode), so the OS never resizes the
 *     window — the IME is delivered as an inset and React Native reports it
 *     through the keyboard events. The KAV measures the exact overlap against
 *     its own frame, so the padding it applies is exactly the space the
 *     keyboard covers: flex:1 children (chat lists, forms) re-layout into the
 *     remaining viewport and the `footer` (chat composer) stays in the normal
 *     layout flow, directly above the keyboard. When the keyboard hides the
 *     padding returns to zero, so the screen snaps back to full height.
 *   - keyboardVerticalOffset = the native header height (from
 *     react-navigation's HeaderHeightContext). The header sits above the KAV's
 *     frame but inside the window, so without this offset the computed padding
 *     would be short by exactly the header height on both platforms. Screens
 *     without a header get 0 automatically.
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

  // Height of the navigator's native header (incl. status bar). 0 when the
  // screen has no header (headerShown: false, or a screen rendered outside a
  // navigator, e.g. the passcode gates). The header is above the KAV's frame,
  // so it must be subtracted from the keyboard frame to compute the overlap.
  const headerHeight = useContext(HeaderHeightContext) ?? 0;

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
        keyboardVerticalOffset={headerHeight + keyboardVerticalOffset}
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
