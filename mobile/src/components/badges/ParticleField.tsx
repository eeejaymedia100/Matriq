import React, { useEffect, useMemo } from "react";
import { StyleSheet } from "react-native";
import {
  Canvas,
  Circle,
  Group,
  RadialGradient,
  Rect,
  vec,
} from "@shopify/react-native-skia";
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { ParticleTheme } from "../../utils/badgeDesign";

/**
 * ParticleField — the Skia burst behind the unlock ceremony.
 *
 * One Reanimated shared value (0→1, eased) drives every particle; each
 * particle's position is a useDerivedValue, so all motion runs on the UI
 * thread with zero JS per frame. Particles fly outward with per-particle
 * variance, sag under gravity, shrink and fade — tuned per rarity by
 * badgeDesign.ts (common = dust, epic = gold fireworks).
 */

interface Particle {
  angle: number;
  speedFactor: number;
  radius: number;
  color: string;
  /** Small particles lag slightly behind the burst front. */
  delay: number;
}

function makeParticles(theme: ParticleTheme, seed: number): Particle[] {
  // Deterministic PRNG so a given badge always bursts the same way.
  let s = seed >>> 0 || 1;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  return Array.from({ length: theme.count }, () => {
    const rMin = theme.radius[0];
    const rMax = theme.radius[1];
    return {
      angle: rand() * Math.PI * 2,
      speedFactor: 0.45 + rand() * 0.75,
      radius: rMin + rand() * (rMax - rMin),
      color: theme.colors[Math.floor(rand() * theme.colors.length)],
      delay: rand() * 0.12,
    };
  });
}

const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
const BURST_MS = 1900;

function ParticleDot({
  p,
  progress,
  origin,
  theme,
}: {
  p: Particle;
  progress: ReturnType<typeof useSharedValue<number>>;
  origin: { x: number; y: number };
  theme: ParticleTheme;
}) {
  const cx = useDerivedValue(() => {
    const t = Math.max(0, progress.value - p.delay);
    return origin.x + Math.cos(p.angle) * theme.speed * p.speedFactor * t;
  });
  const cy = useDerivedValue(() => {
    const t = Math.max(0, progress.value - p.delay);
    return (
      origin.y +
      Math.sin(p.angle) * theme.speed * p.speedFactor * t +
      // Gravity sag — grows with the square of travel time.
      theme.gravity * 210 * t * t
    );
  });
  const r = useDerivedValue(() => {
    const t = Math.max(0, progress.value - p.delay);
    return p.radius * (1 - 0.55 * t);
  });
  const opacity = useDerivedValue(() => {
    const t = Math.max(0, progress.value - p.delay);
    // Pop in fast, ease out to nothing.
    return Math.min(1, t / 0.06) * Math.pow(Math.max(0, 1 - t), 1.35);
  });

  return (
    <Circle cx={cx} cy={cy} r={r} opacity={opacity} color={p.color} />
  );
}

export function ParticleField({
  theme,
  origin,
  seed,
  originRadius,
  width,
  height,
  onDone,
}: {
  theme: ParticleTheme;
  origin: { x: number; y: number };
  seed: number;
  originRadius: number;
  width: number;
  height: number;
  onDone: () => void;
}) {
  const progress = useSharedValue(0);
  const particles = useMemo(() => makeParticles(theme, seed), [theme, seed]);

  useEffect(() => {
    progress.value = withTiming(1, { duration: BURST_MS, easing: EASE_OUT });
    const timer = setTimeout(onDone, BURST_MS + 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Bloom behind the badge — a soft radial pool in rarity colors. */}
      <Group opacity={0.16}>
        <Rect x={0} y={0} width={width} height={height}>
          <RadialGradient
            c={vec(origin.x, origin.y)}
            r={originRadius * 3.4}
            colors={[...theme.colors.slice(0, 2), "#00000000"]}
            positions={[0, 0.42, 1]}
          />
        </Rect>
      </Group>
      <Group>
        {particles.map((p, i) => (
          <ParticleDot
            key={i}
            p={p}
            progress={progress}
            origin={origin}
            theme={theme}
          />
        ))}
      </Group>
    </Canvas>
  );
}
