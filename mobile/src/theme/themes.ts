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
  /** Lime accent — "this is alive, look here" (fills/treatments). */
  accent: string;
  accentBright: string;
  /** Accent as TEXT on the current background — darkened olive on Pop's
   *  light paper (lime text on white fails contrast and is banned), raw
   *  lime on Glass's void. Every accent-colored TEXT uses this. */
  accentText: string;
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

// Restraint pass (2026-09): the scale tightened one notch — big containers
// no longer out-round their content. Hairline + quiet shadow does the work
// a fat radius used to fake.
const radii = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };
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
    // Lime on void passes contrast; accentText == accent on the dark theme.
    accentText: brand.lime500,
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
    // Restraint pass: Glass cards float quietly — a whisper of depth, not a
    // spotlight. The frosted pane + hairline carries the surface; the shadow
    // only separates it from the background.
    card: {
      shadowColor: "#000000",
      shadowOpacity: 0.28,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    cardPressed: {
      shadowColor: "#000000",
      shadowOpacity: 0.2,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 2,
    },
    sticker: {
      shadowColor: "#000000",
      shadowOpacity: 0.3,
      shadowRadius: 0,
      shadowOffset: { width: 3, height: 3 },
      elevation: 3,
    },
    stickerPressed: {
      shadowColor: "#000000",
      shadowOpacity: 0.2,
      shadowRadius: 0,
      shadowOffset: { width: 1, height: 1 },
      elevation: 1,
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
    // Accent roles: lime stays the accent for FILLS/treatments (always with
    // ink-on-lime labels). As a TEXT color on light paper, lime fails contrast
    // (user rule: no lime text on white) — accentText is a darkened olive
    // with the same hue family, readable on paper.
    accent: brand.lime500,
    accentBright: "#D9F97D",
    accentText: "#4A6212",
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
    // Restraint pass: Pop cards sit on paper with a single soft shadow —
    // separation without the hard sticker outline everywhere. The sticker
    // language stays reserved for hero moments (variant="sticker") only.
    card: {
      boxShadow: "0 1px 2px rgba(23,24,26,0.04), 0 6px 16px rgba(23,24,26,0.06)",
    },
    cardPressed: {
      boxShadow: "0 1px 2px rgba(23,24,26,0.04), 0 3px 8px rgba(23,24,26,0.05)",
    },
    // Sticker (hero surfaces only): ink border + offset shadow, softened
    // one step so it reads intentional rather than cartoonish.
    sticker: {
      borderWidth: 1.5,
      borderColor: brand.ink,
      boxShadow: "3px 3px 0 #17181A",
    },
    stickerPressed: {
      borderWidth: 1.5,
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
