import React, { useEffect, useState } from "react";
import { StyleSheet, AccessibilityInfo, View, Dimensions } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing as ReEasing,
} from "react-native-reanimated";
import Svg, { Defs, RadialGradient, Stop, Circle } from "react-native-svg";
import { useTheme } from "../theme/ThemeContext";

interface BlobSpec {
  key: string;
  color: string;
  size: number;
  /** Starting position, in % of screen width/height space. */
  x: number;
  y: number;
  opacity: number;
  /** Duration of one drift (ms). Longer = slower = calmer. */
  duration: number;
  driftX: number;
  driftY: number;
  scaleTo: number;
}

/**
 * The Glass signature: 2–3 large, slow-drifting blurred blobs (lime, violet,
 * a whisper of magenta) behind everything, giving the frosted surfaces
 * something to refract. Rendered as radial-gradient SVG circles (works on
 * Android/iOS/web) with a very slow reanimated drift. Respects
 * prefers-reduced-motion (blobs render static).
 */
export function AmbientBlobs() {
  const { isGlass } = useTheme();
  if (!isGlass) return null;
  return <BlobsInner />;
}

function BlobsInner() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduceMotion(v);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const blobs: BlobSpec[] = [
    {
      key: "lime",
      color: "#C6FF3D",
      size: 300,
      x: -70,
      y: -90,
      opacity: 0.14,
      duration: 24000,
      driftX: 90,
      driftY: 130,
      scaleTo: 1.15,
    },
    {
      key: "violet",
      color: "#7B4BC4",
      size: 360,
      x: 190,
      y: 120,
      opacity: 0.22,
      duration: 30000,
      driftX: -70,
      driftY: 90,
      scaleTo: 1.1,
    },
    {
      key: "magenta",
      color: "#E879C9",
      size: 240,
      x: 30,
      y: 460,
      opacity: 0.07,
      duration: 26000,
      driftX: 80,
      driftY: -60,
      scaleTo: 1.2,
    },
  ];

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {blobs.map((b) => (
        <DriftingBlob key={b.key} blob={b} animate={!reduceMotion} />
      ))}
    </View>
  );
}

function DriftingBlob({ blob, animate }: { blob: BlobSpec; animate: boolean }) {
  const { theme } = useTheme();
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const sc = useSharedValue(1);

  useEffect(() => {
    if (!animate) return;
    tx.value = withRepeat(
      withTiming(blob.driftX, {
        duration: blob.duration,
        easing: ReEasing.inOut(ReEasing.sin),
      }),
      -1,
      true,
    );
    ty.value = withRepeat(
      withTiming(blob.driftY, {
        duration: blob.duration * 1.2,
        easing: ReEasing.inOut(ReEasing.sin),
      }),
      -1,
      true,
    );
    sc.value = withRepeat(
      withTiming(blob.scaleTo, {
        duration: blob.duration * 1.5,
        easing: ReEasing.inOut(ReEasing.sin),
      }),
      -1,
      true,
    );
  }, [animate, blob, tx, ty, sc]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: sc.value },
    ],
  }));

  const { width } = Dimensions.get("window");

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: (blob.x / 360) * width,
          top: blob.y,
          width: blob.size,
          height: blob.size,
          opacity: blob.opacity,
          borderRadius: blob.size / 2,
          shadowColor: blob.color,
          shadowOpacity: 0.35,
          shadowRadius: blob.size / 3,
        },
        animatedStyle,
      ]}
    >
      <Svg width={blob.size} height={blob.size}>
        <Defs>
          <RadialGradient id={`blob-${blob.key}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={blob.color} stopOpacity={0.85} />
            <Stop offset="55%" stopColor={blob.color} stopOpacity={0.35} />
            <Stop offset="100%" stopColor={blob.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle
          cx={blob.size / 2}
          cy={blob.size / 2}
          r={blob.size / 2}
          fill={`url(#blob-${blob.key})`}
        />
      </Svg>
    </Animated.View>
  );
}
