import { Easing, type ViewStyle, type TextStyle } from "react-native";
import { brand, motionTokens } from "./tokens";

/**
 * The two Matriq themes — Glass (dark, frosted, fluid) and Pop (light, clay,
 * tactile). Every new screen styles exclusively from `useTheme()`; nothing
 * hard-codes a hex value (spec §2).
 */

export type ThemeMode = "glass" | "pop";

const FONT = {
  400: "PlusJakartaSans_400Regular",
  500: "PlusJakartaSans_500Medium",
  600: "PlusJakartaSans_600SemiBold",
  700: "PlusJakartaSans_700Bold",
  800: "PlusJakartaSans_800ExtraBold",
} as const;

export interface MatriqThemeColors {
  /** Screen background. */
  bg: string;
  /** Deeper background shade (behind ambient blobs). */
  bgDeep: string;
  /** Card surface. Glass: translucent; Pop: clay white. */
  surface: string;
  /** Elevated/sunken surface. */
  surfaceAlt: string;
  /** Hairline borders. */
  border: string;
  /** Strong/ink borders (Pop brutalist). */
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  /** Lime accent — "this is alive, look here". */
  accent: string;
  accentBright: string;
  /** Purple brand accent. */
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
  radii: { sm: number; md: number; lg: number; xl: number; pill: number };
  spacing: { xs: number; sm: number; md: number; lg: number; xl: number; xxl: number };
  motion: {
    durationFast: number;
    duration: number;
    durationSlow: number;
    easing: (value: number) => number;
  };
  /** Shadows are theme-specific: Glass = soft float, Pop = clay dual / brutalist sticker. */
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

const typographyBase = {
  display: type(800, 34, 42),
  h1: type(700, 28, 36),
  h2: type(700, 22, 30),
  h3: type(700, 18, 24),
  body: type(400, 16, 24),
  bodyMedium: type(500, 16, 24),
  bodyBold: type(600, 16, 24),
  caption: type(400, 13, 18),
  captionBold: type(600, 13, 18),
  small: type(500, 11, 16),
};

export const glassTheme: MatriqTheme = {
  mode: "glass",
  colors: {
    bg: brand.purple950,
    bgDeep: "#0C0316",
    surface: "rgba(255,255,255,0.06)",
    surfaceAlt: "rgba(255,255,255,0.10)",
    border: "rgba(255,255,255,0.13)",
    borderStrong: "rgba(255,255,255,0.26)",
    textPrimary: "#F7F3FF",
    textSecondary: "#C9BCE6",
    textMuted: "#8F80B5",
    accent: brand.lime500,
    accentBright: brand.lime400,
    brand: brand.purple500,
    brandDeep: brand.purple600,
    error: "#FF7A7A",
    errorBg: "rgba(255,122,122,0.12)",
    success: "#8EF0AC",
    successBg: "rgba(142,240,172,0.12)",
    warning: "#FFD166",
    warningBg: "rgba(255,209,102,0.14)",
    info: "#8FBCFF",
    infoBg: "rgba(143,188,255,0.12)",
    overlay: "rgba(10,4,20,0.62)",
    tabBarBg: "rgba(20,6,31,0.78)",
  },
  typography: typographyBase,
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
      shadowOpacity: 0.3,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      elevation: 8,
    },
    cardPressed: {
      shadowColor: "#000000",
      shadowOpacity: 0.2,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    sticker: {
      shadowColor: "#000000",
      shadowOpacity: 0.35,
      shadowRadius: 0,
      shadowOffset: { width: 4, height: 4 },
      elevation: 6,
    },
    stickerPressed: {
      shadowColor: "#000000",
      shadowOpacity: 0.2,
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
    bgDeep: "#EFE8F9",
    surface: "#FFFFFF",
    surfaceAlt: "#F0EAF8",
    border: "#E4DBF1",
    borderStrong: brand.ink,
    textPrimary: brand.ink,
    textSecondary: "#5A4D73",
    textMuted: "#8F83A8",
    accent: brand.lime500,
    accentBright: "#D9F97D",
    brand: brand.purple600,
    brandDeep: "#3E1D6E",
    error: "#D13438",
    errorBg: "#FDEBEC",
    success: "#1F7A33",
    successBg: "#E6F6EA",
    warning: "#B36B00",
    warningBg: "#FDF3E3",
    info: "#2563EB",
    infoBg: "#E8F0FE",
    overlay: "rgba(23,11,38,0.45)",
    tabBarBg: "rgba(250,248,253,0.96)",
  },
  typography: typographyBase,
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
    // Clay: gentle dual shadow — looks faintly raised, pressable with a thumb.
    card: {
      boxShadow: "0 1px 2px rgba(23,11,38,0.05), 0 10px 24px rgba(23,11,38,0.08)",
    },
    cardPressed: {
      boxShadow: "0 1px 2px rgba(23,11,38,0.04), 0 4px 10px rgba(23,11,38,0.06)",
    },
    // Sticker: thick ink border + hard offset shadow, no blur.
    sticker: {
      borderWidth: 2,
      borderColor: brand.ink,
      boxShadow: "5px 5px 0 #170B26",
    },
    stickerPressed: {
      borderWidth: 2,
      borderColor: brand.ink,
      boxShadow: "1px 1px 0 #170B26",
    },
  },
};

export const themes: Record<ThemeMode, MatriqTheme> = {
  glass: glassTheme,
  pop: popTheme,
};

export { typographyBase };
