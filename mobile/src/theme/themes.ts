import { Easing, type ViewStyle, type TextStyle } from "react-native";
import { brand, motionTokens } from "./tokens";

/**
 * The two Matriq themes — Glass (dark, frosted, fluid) and Pop (light, warm
 * paper, tactile). Every new screen styles exclusively from `useTheme()`;
 * nothing hard-codes a hex value. The brand is black + lime: dark surfaces
 * are void blacks, light surfaces warm neutral paper, lime the only accent.
 */

export type ThemeMode = "glass" | "pop";

const FONT = {
  400: "Inter_400Regular",
  500: "Inter_500Medium",
  600: "Inter_600SemiBold",
  700: "Inter_700Bold",
  800: "Inter_800ExtraBold",
} as const;

/**
 * Playfair Display — the serif voice. Display moments only: display / h1 /
 * h2 and big numerals (streak count, CGPA result, focus-timer readout).
 * Exactly one serif moment per screen; everything beneath it stays sans and
 * quiet. Never body, buttons, labels or anything below ~18pt-sized text.
 */
export const SERIF = {
  400: "PlayfairDisplay_400Regular",
  500: "PlayfairDisplay_500Medium",
  600: "PlayfairDisplay_600SemiBold",
  700: "PlayfairDisplay_700Bold",
} as const;

export interface MatriqThemeColors {
  /** Screen background. */
  bg: string;
  /** Deeper background shade (behind ambient glows). */
  bgDeep: string;
  /** Card surface. Glass: translucent; Pop: warm paper. */
  surface: string;
  /** Elevated/sunken surface. */
  surfaceAlt: string;
  /** Hairline borders. */
  border: string;
  /** Strong/ink borders (Pop tactile). */
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  /** Lime accent — "this is alive, look here". */
  accent: string;
  accentBright: string;
  /** Color for text/icons sitting on the lime accent. */
  onAccent: string;
  /** Secondary brand hue (chrome, chips, selection). */
  brand: string;
  brandDeep: string;
  error: string;
  errorBg: string;
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  info: string;
  infoBg: string;
  overlay: string;
  tabBarBg: string;
}

export interface MatriqTheme {
  mode: ThemeMode;
  colors: MatriqThemeColors;
  typography: Record<string, TextStyle>;
  /** Playfair serif moments — one per screen, display contexts only. */
  serif: {
    editorial: TextStyle;
    numeral: TextStyle;
    accent: TextStyle;
  };
  radii: { sm: number; md: number; lg: number; xl: number; pill: number };
  spacing: { xs: number; sm: number; md: number; lg: number; xl: number; xxl: number };
  motion: {
    durationFast: number;
    duration: number;
    durationSlow: number;
    easing: (value: number) => number;
  };
  /** Shadows are theme-specific: Glass = soft float, Pop = tactile offset. */
  shadows: {
    card: ViewStyle;
    cardPressed: ViewStyle;
    sticker: ViewStyle;
    stickerPressed: ViewStyle;
  };
}

const radii = { sm: 8, md: 14, lg: 20, xl: 28, pill: 999 };
const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };

const type = (font: keyof typeof FONT, size: number, lineHeight: number, weight?: number): TextStyle => ({
  fontFamily: FONT[font],
  fontSize: size,
  lineHeight,
  ...(weight ? { fontWeight: weight as TextStyle["fontWeight"] } : {}),
});

const serifType = (
  font: keyof typeof SERIF,
  size: number,
  lineHeight: number,
): TextStyle => ({
  fontFamily: SERIF[font],
  fontSize: size,
  lineHeight,
});

const typographyBase = {
  // Scale floors locked in round-4: display 30 / h1 26 (was 34/28 — less
  // shout, more presence). Serif owns these two + h2 as the display voice;
  // h3 and below stay sans.
  display: serifType(600, 30, 38),
  h1: serifType(600, 26, 34),
  h2: serifType(600, 22, 30),
  h3: type(700, 18, 24),
  body: type(400, 16, 24),
  bodyMedium: type(500, 16, 24),
  bodyBold: type(600, 16, 24),
  caption: type(400, 13, 18),
  captionBold: type(600, 13, 18),
  small: type(500, 11, 16),
};

/**
 * Explicit serif tokens for screens that want a serif moment without a full
 * display headline (facts, achievements, learning moments). These sit outside
 * the numbered scale so their usage stays intentional.
 */
export const serifTypography = {
  /** Serif learning/editorial title — facts, achievement names. */
  editorial: serifType(600, 20, 27),
  /** Big numeral — streak count, CGPA result, focus-timer readout. */
  numeral: serifType(700, 40, 44),
  /** Small serif accent for premium/achievement metadata. */
  accent: serifType(500, 14, 20),
} as const;

export const glassTheme: MatriqTheme = {
  mode: "glass",
  colors: {
    bg: brand.void,
    bgDeep: brand.voidDeep,
    // Frosted glass, but readable: the surface is a translucent near-black
    // pane (≈93% opaque) rather than a faint white wash. At 6% white, cards,
    // menus, the chat composer and the tab bar let the content beneath them
    // bleed straight through (round-3 QA: dark-mode layering). The residual
    // translucency still lets the ambient glow drift faintly through, keeping
    // the glass feel — without text ghosting behind foreground components.
    surface: "rgba(22,22,24,0.93)",
    // Lighter chips/inputs sitting ON TOP of a surface — white highlight over
    // the now-opaque pane reads as frosted glass, not as bleed-through.
    surfaceAlt: "rgba(255,255,255,0.08)",
    border: "rgba(255,255,255,0.14)",
    borderStrong: "rgba(255,255,255,0.32)",
    textPrimary: "#F5F4F1",
    textSecondary: "#C8C6C1",
    textMuted: "#8E8C88",
    accent: brand.lime500,
    accentBright: brand.lime400,
    onAccent: brand.onAccent,
    // Secondary hue on dark: pure white chrome (was purple). Chips, selection
    // states and "brand" moments are now monochrome + lime only.
    brand: "#F5F4F1",
    brandDeep: "#B9B7B2",
    error: "#FF7A7A",
    errorBg: "rgba(255,122,122,0.12)",
    success: "#8EF0AC",
    successBg: "rgba(142,240,172,0.12)",
    warning: "#FFD166",
    warningBg: "rgba(255,209,102,0.14)",
    info: "#8FBCFF",
    infoBg: "rgba(143,188,255,0.12)",
    overlay: "rgba(0,0,0,0.74)",
    tabBarBg: "rgba(10,10,10,0.94)",
  },
  typography: typographyBase,
  serif: serifTypography,
  radii,
  spacing,
  motion: {
    durationFast: motionTokens.glass.durationFast,
    duration: motionTokens.glass.duration,
    durationSlow: motionTokens.glass.durationSlow,
    easing: Easing.bezier(
      motionTokens.glass.bezier[0],
      motionTokens.glass.bezier[1],
      motionTokens.glass.bezier[2],
      motionTokens.glass.bezier[3],
    ),
  },
  shadows: {
    card: {
      shadowColor: "#000000",
      shadowOpacity: 0.4,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      elevation: 8,
    },
    cardPressed: {
      shadowColor: "#000000",
      shadowOpacity: 0.25,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    sticker: {
      shadowColor: "#000000",
      shadowOpacity: 0.45,
      shadowRadius: 0,
      shadowOffset: { width: 4, height: 4 },
      elevation: 6,
    },
    stickerPressed: {
      shadowColor: "#000000",
      shadowOpacity: 0.25,
      shadowRadius: 0,
      shadowOffset: { width: 1, height: 1 },
      elevation: 2,
    },
  },
};

export const popTheme: MatriqTheme = {
  mode: "pop",
  colors: {
    bg: brand.paper,
    bgDeep: brand.paperDeep,
    // Warm paper surfaces, tinted only by ink at low alpha — zero purple.
    surface: "#FFFFFF",
    surfaceAlt: "#F0EEE9",
    border: "#E3E1DC",
    borderStrong: brand.ink,
    textPrimary: brand.ink,
    textSecondary: "#56585A",
    textMuted: "#8C8E90",
    accent: brand.lime500,
    accentBright: "#D9F97D",
    onAccent: brand.onAccent,
    // Secondary hue on light: ink (was purple). Sticker borders, chips and
    // secondary buttons are ink — monochrome + lime only.
    brand: brand.ink,
    brandDeep: "#000000",
    error: "#D13438",
    errorBg: "#FDEBEC",
    success: "#1F7A33",
    successBg: "#E6F6EA",
    warning: "#B36B00",
    warningBg: "#FDF3E3",
    info: "#2563EB",
    infoBg: "#E8F0FE",
    overlay: "rgba(23,24,26,0.45)",
    tabBarBg: "rgba(250,249,246,0.97)",
  },
  typography: typographyBase,
  serif: serifTypography,
  radii,
  spacing,
  motion: {
    durationFast: motionTokens.pop.durationFast,
    duration: motionTokens.pop.duration,
    durationSlow: motionTokens.pop.durationSlow,
    easing: Easing.bezier(
      motionTokens.pop.bezier[0],
      motionTokens.pop.bezier[1],
      motionTokens.pop.bezier[2],
      motionTokens.pop.bezier[3],
    ),
  },
  shadows: {
    // Tactile: gentle dual shadow — looks faintly raised, pressable with a thumb.
    card: {
      boxShadow: "0 1px 2px rgba(23,24,26,0.05), 0 10px 24px rgba(23,24,26,0.08)",
    },
    cardPressed: {
      boxShadow: "0 1px 2px rgba(23,24,26,0.04), 0 4px 10px rgba(23,24,26,0.06)",
    },
    // Sticker: thick ink border + hard offset shadow, no blur.
    sticker: {
      borderWidth: 2,
      borderColor: brand.ink,
      boxShadow: "5px 5px 0 #17181A",
    },
    stickerPressed: {
      borderWidth: 2,
      borderColor: brand.ink,
      boxShadow: "1px 1px 0 #17181A",
    },
  },
};

export const themes: Record<ThemeMode, MatriqTheme> = {
  glass: glassTheme,
  pop: popTheme,
};

export { typographyBase };
