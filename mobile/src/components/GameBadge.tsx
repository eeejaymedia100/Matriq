import React, { useId } from "react";
import { View } from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
  Polygon,
  Ellipse,
  Path,
  ClipPath,
} from "react-native-svg";
import { useTheme } from "../theme/ThemeContext";
import { Icon, type IconName } from "./icons";
import type { AchievementRarity } from "../utils/achievements";

/**
 * Game-quality achievement badge (UI direction §Achievement System).
 *
 * NOT a coloured circle + emoji. This is a reusable layered renderer:
 *  - hexagonal base silhouette with a rim ring (rarity-tinted)
 *  - metallic linear-gradient plate
 *  - inner darker plate for depth
 *  - specular shine (top arc) + rim lighting
 *  - a subtle radial glow + RN drop shadow for depth
 *  - four-point sparkles ONLY when earned/unlocked
 *  - locked badges render desaturated and dimmed
 *
 * Pure vector (react-native-svg) — GPU-friendly, scales to any size and to
 * future rarity tiers. Below 56px it drops the shine/sparkles so small
 * badges (Home preview) stay clean.
 */

export type BadgeSize = "sm" | "md" | "lg";

interface RarityPalette {
  label: string;
  rim: string;
  plateFrom: string;
  plateTo: string;
  innerFrom: string;
  innerTo: string;
  shine: string;
  glow: string;
  shadow: string;
  emblem: string;
  emblemDimmed: string;
}

export const RARITY_PALETTES: Record<AchievementRarity, RarityPalette> = {
  common: {
    label: "Common",
    rim: "#2B3140",
    plateFrom: "#97A0B5",
    plateTo: "#5E6880",
    innerFrom: "#7A849C",
    innerTo: "#4A5370",
    shine: "rgba(255,255,255,0.55)",
    glow: "rgba(150,160,180,0.0)",
    shadow: "rgba(10,10,20,0.45)",
    emblem: "#1E2430",
    emblemDimmed: "rgba(255,255,255,0.38)",
  },
  uncommon: {
    label: "Uncommon",
    rim: "#1E3D24",
    plateFrom: "#8BDD6E",
    plateTo: "#3E8E4E",
    innerFrom: "#6FC458",
    innerTo: "#2F6E3C",
    shine: "rgba(255,255,255,0.6)",
    glow: "rgba(139,221,110,0.0)",
    shadow: "rgba(10,30,15,0.45)",
    emblem: "#0F2415",
    emblemDimmed: "rgba(255,255,255,0.38)",
  },
  rare: {
    label: "Rare",
    rim: "#123844",
    plateFrom: "#6FD9E8",
    plateTo: "#2A7A94",
    innerFrom: "#4FC3DC",
    innerTo: "#1F5E75",
    shine: "rgba(255,255,255,0.62)",
    glow: "rgba(110,215,235,0.0)",
    shadow: "rgba(8,40,50,0.5)",
    emblem: "#0E2A34",
    emblemDimmed: "rgba(255,255,255,0.38)",
  },
  epic: {
    label: "Epic",
    rim: "#4A3208",
    plateFrom: "#FFD96B",
    plateTo: "#D99A1B",
    innerFrom: "#F5C24A",
    innerTo: "#B87F10",
    shine: "rgba(255,255,255,0.7)",
    glow: "rgba(255,217,107,0.0)",
    shadow: "rgba(60,40,5,0.5)",
    emblem: "#3A2805",
    emblemDimmed: "rgba(255,255,255,0.38)",
  },
};

/** Vertices of a pointy-top hexagon inscribed in a circle of radius r. */
function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 90);
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`);
  }
  return pts.join(" ");
}

function Sparkle({ x, y, s, color }: { x: number; y: number; s: number; color: string }) {
  return (
    <Path
      d={`M${x} ${y - s} L${x + s * 0.28} ${y - s * 0.28} L${x + s} ${y} L${x + s * 0.28} ${y + s * 0.28} L${x} ${y + s} L${x - s * 0.28} ${y + s * 0.28} L${x - s} ${y} L${x - s * 0.28} ${y - s * 0.28} Z`}
      fill={color}
    />
  );
}

export function GameBadge({
  rarity,
  icon,
  earned,
  size = "md",
  style,
}: {
  rarity: AchievementRarity;
  icon: IconName;
  earned: boolean;
  size?: BadgeSize;
  style?: object;
}) {
  const { theme, isGlass } = useTheme();
  const clipId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const dims = size === "sm" ? 44 : size === "md" ? 88 : 132;
  const palette = RARITY_PALETTES[rarity];
  const cx = dims / 2;
  const cy = dims / 2;
  const R = dims / 2 - 2;
  const iconSize = dims * (size === "sm" ? 0.4 : 0.4);
  const complex = size !== "sm";

  return (
    <View
      style={[
        {
          width: dims,
          height: dims,
          opacity: earned ? 1 : 0.55,
          shadowColor: palette.shadow,
          shadowOpacity: earned ? 0.7 : 0.3,
          shadowRadius: dims * 0.09,
          shadowOffset: { width: 0, height: dims * 0.06 },
          elevation: earned ? 6 : 2,
        },
        style,
      ]}
    >
      <Svg width={dims} height={dims} viewBox={`0 0 ${dims} ${dims}`}>
        <Defs>
          <LinearGradient id={`plate-${clipId}`} x1="0" y1="0" x2="0.8" y2="1">
            <Stop offset="0" stopColor={palette.plateFrom} />
            <Stop offset="1" stopColor={palette.plateTo} />
          </LinearGradient>
          <LinearGradient id={`inner-${clipId}`} x1="0" y1="0" x2="0.8" y2="1">
            <Stop offset="0" stopColor={palette.innerFrom} />
            <Stop offset="1" stopColor={palette.innerTo} />
          </LinearGradient>
          <RadialGradient id={`glow-${clipId}`} cx="0.5" cy="0.42" r="0.65">
            <Stop offset="0" stopColor={palette.glow} stopOpacity={earned ? 0.9 : 0} />
            <Stop offset="1" stopColor={palette.glow} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id={`shine-${clipId}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.85} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </LinearGradient>
          <ClipPath id={`hexclip-${clipId}`}>
            <Polygon points={hexPoints(cx, cy, R - 4)} />
          </ClipPath>
        </Defs>

        {/* Soft glow behind the plate (earned only) */}
        <Ellipse
          cx={cx}
          cy={cy}
          rx={R * 0.95}
          ry={R * 0.95}
          fill={`url(#glow-${clipId})`}
        />

        {/* Outer rim ring */}
        <Polygon
          points={hexPoints(cx, cy, R)}
          fill={earned ? palette.rim : "#3A4150"}
          stroke={earned ? palette.rim : "#4A5264"}
          strokeWidth={1}
        />
        {/* Metallic base plate */}
        <Polygon
          points={hexPoints(cx, cy, R - 4)}
          fill={`url(#plate-${clipId})`}
        />
        {/* Inner darker plate for depth */}
        <Polygon
          points={hexPoints(cx, cy, R - 11)}
          fill={`url(#inner-${clipId})`}
          opacity={earned ? 1 : 0.75}
        />

        {earned ? (
          <>
            {/* Specular shine — top arc clipped to the plate (earned only) */}
            <Ellipse
              cx={cx}
              cy={cy - R * 0.38}
              rx={R * 0.62}
              ry={R * 0.34}
              fill={`url(#shine-${clipId})`}
              clipPath={`url(#hexclip-${clipId})`}
              opacity={complex ? 0.5 : 0.42}
            />
            {/* Rim light — a brighter top edge */}
            {complex ? (
              <Polygon
                points={hexPoints(cx, cy, R - 4)}
                fill="none"
                stroke="rgba(255,255,255,0.4)"
                strokeWidth={1.4}
                opacity={0.55}
              />
            ) : null}
          </>
        ) : null}
      </Svg>

      {/* Emblem — the achievement's icon, centred over the plate */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={
            earned
              ? {
                  shadowColor: isGlass ? "#000" : palette.emblem,
                  shadowOpacity: 0.35,
                  shadowRadius: 3,
                  shadowOffset: { width: 0, height: 1 },
                }
              : undefined
          }
        >
          <Icon
            name={icon}
            size={iconSize}
            color={earned ? palette.emblem : palette.emblemDimmed}
            strokeWidth={1.9}
          />
        </View>
      </View>

      {/* Sparkles — earned/unlocked only */}
      {complex && earned ? (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
          <Svg width={dims} height={dims} viewBox={`0 0 ${dims} ${dims}`}>
            <Sparkle x={dims * 0.2} y={dims * 0.22} s={dims * 0.055} color="rgba(255,255,255,0.95)" />
            <Sparkle x={dims * 0.84} y={dims * 0.34} s={dims * 0.042} color="rgba(255,255,255,0.8)" />
            <Sparkle x={dims * 0.28} y={dims * 0.82} s={dims * 0.04} color="rgba(255,255,255,0.7)" />
            <Sparkle x={dims * 0.78} y={dims * 0.76} s={dims * 0.05} color="rgba(255,255,255,0.85)" />
          </Svg>
        </View>
      ) : null}
    </View>
  );
}