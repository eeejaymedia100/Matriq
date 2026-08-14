import React from "react";
import Svg, { Path, Circle, Line, Polyline, Rect, Ellipse, type SvgProps } from "react-native-svg";

/**
 * Matriq icon set — hand-curated inline SVG (spec §2: icons are inline SVG
 * only, never an icon font; icon fonts caused the broken-glyph bug before).
 * All glyphs are 24×24 stroke-based (lucide-style) with round caps, drawn
 * from geometry so nothing relies on a font file. The one exception is the
 * four-point sparkle, which is filled — it is reserved exclusively for
 * AI-touched surfaces.
 */

export type IconName =
  | "home"
  | "vault"
  | "tools"
  | "study"
  | "settings"
  | "sparkle"
  | "chevronRight"
  | "chevronLeft"
  | "chevronDown"
  | "arrowLeft"
  | "check"
  | "x"
  | "alert"
  | "info"
  | "eye"
  | "eyeOff"
  | "mail"
  | "lock"
  | "download"
  | "upload"
  | "trash"
  | "refresh"
  | "plus"
  | "calendar"
  | "wallet"
  | "megaphone"
  | "clock"
  | "search"
  | "user"
  | "graduationCap"
  | "moon"
  | "sun"
  | "camera"
  | "image"
  | "phone"
  | "link"
  | "target"
  | "trophy"
  | "layers"
  | "timer"
  | "zap"
  | "wifiOff"
  | "book"
  | "creditCard"
  | "cloudOff"
  | "pen"
  | "fileText"
  | "filter"
  | "bell"
  | "shield"
  | "logout"
  | "globe"
  | "qrCode"
  | "trendingUp"
  | "dot";

const ICONS: Record<IconName, React.ReactNode> = {
  home: (
    <>
      <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <Path d="M9 22V12h6v10" />
    </>
  ),
  vault: (
    <>
      <Ellipse cx="12" cy="5" rx="9" ry="3" />
      <Path d="M3 5v14a9 3 0 0 0 18 0V5" />
      <Path d="M3 12a9 3 0 0 0 18 0" />
    </>
  ),
  tools: (
    <>
      <Line x1="21" x2="14" y1="4" y2="4" />
      <Line x1="10" x2="3" y1="4" y2="4" />
      <Line x1="21" x2="12" y1="12" y2="12" />
      <Line x1="8" x2="3" y1="12" y2="12" />
      <Line x1="21" x2="16" y1="20" y2="20" />
      <Line x1="12" x2="3" y1="20" y2="20" />
      <Line x1="14" x2="14" y1="2" y2="6" />
      <Line x1="8" x2="8" y1="10" y2="14" />
      <Line x1="16" x2="16" y1="18" y2="22" />
    </>
  ),
  study: (
    <>
      <Path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <Path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </>
  ),
  settings: (
    <>
      <Path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <Circle cx="12" cy="12" r="3" />
    </>
  ),
  sparkle: <Path d="M12 2.5l2.5 7 7 2.5-7 2.5-2.5 7-2.5-7-7-2.5 7-2.5z" />,
  chevronRight: <Polyline points="9 18 15 12 9 6" />,
  chevronLeft: <Polyline points="15 18 9 12 15 6" />,
  chevronDown: <Polyline points="6 9 12 15 18 9" />,
  arrowLeft: (
    <>
      <Path d="M19 12H5" />
      <Path d="M12 19l-7-7 7-7" />
    </>
  ),
  check: <Polyline points="20 6 9 17 4 12" />,
  x: (
    <>
      <Path d="M18 6L6 18" />
      <Path d="M6 6l12 12" />
    </>
  ),
  alert: (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Line x1="12" x2="12" y1="8" y2="12" />
      <Line x1="12" x2="12.01" y1="16" y2="16" />
    </>
  ),
  info: (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Line x1="12" x2="12" y1="16" y2="12" />
      <Line x1="12" x2="12.01" y1="8" y2="8" />
    </>
  ),
  eye: (
    <>
      <Path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
      <Circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <Path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <Path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <Path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <Line x1="2" x2="22" y1="2" y2="22" />
    </>
  ),
  mail: (
    <>
      <Rect width="20" height="16" x="2" y="4" rx="2" />
      <Path d="m22 6-10 7L2 6" />
    </>
  ),
  lock: (
    <>
      <Rect width="18" height="11" x="3" y="11" rx="2" />
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  download: (
    <>
      <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <Polyline points="7 10 12 15 17 10" />
      <Line x1="12" x2="12" y1="15" y2="3" />
    </>
  ),
  upload: (
    <>
      <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <Polyline points="17 8 12 3 7 8" />
      <Line x1="12" x2="12" y1="3" y2="15" />
    </>
  ),
  trash: (
    <>
      <Path d="M3 6h18" />
      <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <Path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <Line x1="10" x2="10" y1="11" y2="17" />
      <Line x1="14" x2="14" y1="11" y2="17" />
    </>
  ),
  refresh: (
    <>
      <Path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <Path d="M21 3v5h-5" />
      <Path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <Path d="M8 16H3v5" />
    </>
  ),
  plus: (
    <>
      <Line x1="12" x2="12" y1="5" y2="19" />
      <Line x1="5" x2="19" y1="12" y2="12" />
    </>
  ),
  calendar: (
    <>
      <Rect width="18" height="18" x="3" y="4" rx="2" />
      <Line x1="16" x2="16" y1="2" y2="6" />
      <Line x1="8" x2="8" y1="2" y2="6" />
      <Line x1="3" x2="21" y1="10" y2="10" />
    </>
  ),
  wallet: (
    <>
      <Path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <Path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <Path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
    </>
  ),
  megaphone: (
    <>
      <Path d="m3 11 18-5v12L3 14v-3z" />
      <Path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </>
  ),
  clock: (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Polyline points="12 6 12 12 16 14" />
    </>
  ),
  search: (
    <>
      <Circle cx="11" cy="11" r="8" />
      <Line x1="21" x2="16.65" y1="21" y2="16.65" />
    </>
  ),
  user: (
    <>
      <Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <Circle cx="12" cy="7" r="4" />
    </>
  ),
  graduationCap: (
    <>
      <Path d="M22 10 12 5 2 10l10 5 10-5z" />
      <Path d="M6 12v5c0 1.66 2.69 3 6 3s6-1.34 6-3v-5" />
      <Path d="M22 10v6" />
    </>
  ),
  moon: <Path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />,
  sun: (
    <>
      <Circle cx="12" cy="12" r="4" />
      <Line x1="12" x2="12" y1="2" y2="4" />
      <Line x1="12" x2="12" y1="20" y2="22" />
      <Line x1="4.93" x2="6.34" y1="4.93" y2="6.34" />
      <Line x1="17.66" x2="19.07" y1="17.66" y2="19.07" />
      <Line x1="2" x2="4" y1="12" y2="12" />
      <Line x1="20" x2="22" y1="12" y2="12" />
      <Line x1="6.34" x2="4.93" y1="17.66" y2="19.07" />
      <Line x1="19.07" x2="17.66" y1="6.34" y2="4.93" />
    </>
  ),
  camera: (
    <>
      <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <Circle cx="12" cy="13" r="4" />
    </>
  ),
  image: (
    <>
      <Rect width="18" height="18" x="3" y="3" rx="2" />
      <Circle cx="9" cy="9" r="2" />
      <Path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21" />
    </>
  ),
  phone: (
    <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  ),
  link: (
    <>
      <Path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <Path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),
  target: (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Circle cx="12" cy="12" r="6" />
      <Circle cx="12" cy="12" r="2" />
    </>
  ),
  trophy: (
    <>
      <Path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <Path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <Path d="M4 22h16" />
      <Path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <Path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <Path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
    </>
  ),
  layers: (
    <>
      <Path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" />
      <Path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
      <Path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
    </>
  ),
  timer: (
    <>
      <Line x1="10" x2="14" y1="2" y2="2" />
      <Line x1="12" x2="15" y1="14" y2="11" />
      <Circle cx="12" cy="14" r="8" />
    </>
  ),
  zap: <Path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />,
  wifiOff: (
    <>
      <Line x1="2" x2="22" y1="2" y2="22" />
      <Path d="M8.5 16.43a5 5 0 0 1 7 0" />
      <Path d="M5 12.86a10 10 0 0 1 5.17-2.69" />
      <Path d="M19 12.86a10 10 0 0 0-2.01-1.52" />
      <Path d="M2 8.82a15 15 0 0 1 4.18-2.64" />
      <Path d="M22 8.82a15 15 0 0 0-11.29-3.76" />
      <Path d="M12 20h.01" />
    </>
  ),
  book: (
    <>
      <Path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
    </>
  ),
  creditCard: (
    <>
      <Rect width="20" height="14" x="2" y="5" rx="2" />
      <Line x1="2" x2="22" y1="10" y2="10" />
    </>
  ),
  cloudOff: (
    <>
      <Path d="M22.61 16.95A5 5 0 0 0 18 10h-1.26a8 8 0 0 0-7.05-6M5 5a8 8 0 0 0 4 15h9a5 5 0 0 0 1.7-.3" />
      <Line x1="2" x2="22" y1="2" y2="22" />
    </>
  ),
  pen: <Path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />,
  fileText: (
    <>
      <Path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
      <Path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <Line x1="16" x2="8" y1="13" y2="13" />
      <Line x1="16" x2="8" y1="17" y2="17" />
      <Line x1="10" x2="8" y1="9" y2="9" />
    </>
  ),
  filter: <Path d="M22 3H2l8 9.46V19l4 2v-8.54z" />,
  bell: (
    <>
      <Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
  shield: (
    <>
      <Path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <Path d="m9 12 2 2 4-4" />
    </>
  ),
  logout: (
    <>
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <Polyline points="16 17 21 12 16 7" />
      <Line x1="21" x2="9" y1="12" y2="12" />
    </>
  ),
  globe: (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Line x1="2" x2="22" y1="12" y2="12" />
      <Path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </>
  ),
  qrCode: (
    <>
      <Rect x="3" y="3" width="7" height="7" rx="1" />
      <Rect x="14" y="3" width="7" height="7" rx="1" />
      <Rect x="3" y="14" width="7" height="7" rx="1" />
      <Path d="M14 14h3v3h-3z" />
      <Path d="M20 14h1v4h-4v-1" />
    </>
  ),
  trendingUp: (
    <>
      <Polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <Polyline points="16 7 22 7 22 13" />
    </>
  ),
  dot: <Circle cx="12" cy="12" r="3" />,
};

/** Filled glyphs render with fill instead of stroke. */
const FILLED: ReadonlySet<IconName> = new Set(["sparkle", "qrCode", "dot"]);

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 24, color = "#170B26", strokeWidth = 2 }: IconProps) {
  const filled = FILLED.has(name);
  const common: SvgProps = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    ...(filled
      ? { fill: color }
      : {
          fill: "none",
          stroke: color,
          strokeWidth,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }),
  };
  return <Svg {...common}>{ICONS[name]}</Svg>;
}
