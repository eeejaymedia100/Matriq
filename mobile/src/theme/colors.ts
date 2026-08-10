// Matriq Design System — matches the web prototype's theme tokens
// Light-mode accent corrected per production-directive.md: #2E6B00, not raw neon

export const colors = {
  // Primary palette
  primary: "#6C3BAA",
  primaryLight: "#8B5CF6",
  primaryDark: "#4C1D95",

  // Accent (corrected for light-mode contrast)
  accent: "#2E6B00",
  accentLight: "#4CAF50",

  // Neutrals
  bg: "#F8F6FC",
  surface: "#FFFFFF",
  surfaceAlt: "#F3F0FA",
  border: "#E8E0F0",

  // Text
  textPrimary: "#0D0620",
  textSecondary: "#5C4D82",
  textMuted: "#8B7AAE",
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

  // Dark mode overrides
  dark: {
    bg: "#0D0620",
    surface: "#1A1033",
    surfaceAlt: "#241A3D",
    border: "#2D1F4A",
    textPrimary: "#F8F6FC",
    textSecondary: "#C4B5E8",
    textMuted: "#8B7AAE",
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
