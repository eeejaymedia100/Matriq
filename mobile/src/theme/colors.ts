// Matriq Design System — matches the web prototype's theme tokens
// Light-mode accent corrected per production-directive.md: #2E6B00, not raw neon

export const colors = {
  // Primary palette — the brand is black + lime; chrome is ink, not purple.
  primary: "#17181A",
  primaryLight: "#3A3C40",
  primaryDark: "#000000",

  // Accent (corrected for light-mode contrast)
  accent: "#2E6B00",
  accentLight: "#4CAF50",

  // Neutrals — warm paper, zero purple tint
  bg: "#F6F5F2",
  surface: "#FFFFFF",
  surfaceAlt: "#F0EEE9",
  border: "#E3E1DC",

  // Text
  textPrimary: "#17181A",
  textSecondary: "#56585A",
  textMuted: "#8C8E90",
  textOnPrimary: "#FFFFFF",
  textOnAccent: "#FFFFFF",

  // Semantic
  success: "#2E6B00",
  successBg: "#E8F5E9",
  warning: "#F59E0B",
  warningBg: "#FEF3C7",
  error: "#DC2626",
  errorBg: "#FEE2E2",
  info: "#3B82F6",
  infoBg: "#DBEAFE",

  // Status
  pending: "#F59E0B",
  live: "#2E6B00",
  suspended: "#DC2626",

  // Dark mode overrides — void blacks
  dark: {
    bg: "#0A0A0A",
    surface: "#161618",
    surfaceAlt: "#1F1F22",
    border: "#2A2A2E",
    textPrimary: "#F5F4F1",
    textSecondary: "#C8C6C1",
    textMuted: "#8E8C88",
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const typography = {
  h1: { fontSize: 28, fontWeight: "700" as const, lineHeight: 36 },
  h2: { fontSize: 22, fontWeight: "700" as const, lineHeight: 28 },
  h3: { fontSize: 18, fontWeight: "600" as const, lineHeight: 24 },
  body: { fontSize: 16, fontWeight: "400" as const, lineHeight: 24 },
  bodyBold: { fontSize: 16, fontWeight: "600" as const, lineHeight: 24 },
  caption: { fontSize: 13, fontWeight: "400" as const, lineHeight: 18 },
  captionBold: { fontSize: 13, fontWeight: "600" as const, lineHeight: 18 },
  small: { fontSize: 11, fontWeight: "500" as const, lineHeight: 16 },
} as const;
