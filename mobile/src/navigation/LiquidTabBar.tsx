import React, { useEffect, useRef, useState } from "react";
import { View, Pressable, Text, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useTheme } from "../theme/ThemeContext";
import { Icon, type IconName } from "../components/icons";

interface TabSpec {
  name: string;
  label: string;
  icon: IconName;
}

export const TABS: TabSpec[] = [
  { name: "Home", label: "Home", icon: "home" },
  { name: "Vault", label: "Vault", icon: "vault" },
  { name: "Tools", label: "Tools", icon: "tools" },
  { name: "Study", label: "Study", icon: "study" },
  { name: "Settings", label: "Settings", icon: "settings" },
];

const BLOB_W = 46;
const BLOB_H = 32;

/**
 * The signature bottom nav. In Glass, a soft lime blob slides and stretches
 * to the active icon (never jumps); in Pop, the active tab is ink with a
 * small lime clay dot beneath. SVG icons only.
 */
export function LiquidTabBar({ state, navigation }: BottomTabBarProps) {
  const { theme, isGlass } = useTheme();
  const colors = theme.colors;
  const insets = useSafeAreaInsets();

  const positions = useRef<Record<number, { x: number; w: number }>>({});
  const [measured, setMeasured] = useState(false);
  const blobX = useSharedValue(0);
  const blobScaleX = useSharedValue(1);

  const activeIndex = state.index;

  useEffect(() => {
    if (!measured) return;
    const pos = positions.current[activeIndex];
    if (!pos) return;
    const target = pos.x + pos.w / 2 - BLOB_W / 2;
    blobX.value = withSpring(target, {
      damping: 18,
      stiffness: 190,
      mass: 0.8,
    });
    blobScaleX.value = withSequence(
      withTiming(1.22, { duration: 130 }),
      withTiming(1, { duration: 220 }),
    );
  }, [activeIndex, measured, blobX, blobScaleX]);

  // First paint: place the blob exactly on the active tab the moment the bar
  // is measured, so there's never a frame of it sitting at the far-left edge.
  const firstMeasured = useRef(false);
  const onLayoutTab = (index: number) => (e: LayoutChangeEvent) => {
    positions.current[index] = {
      x: e.nativeEvent.layout.x,
      w: e.nativeEvent.layout.width,
    };
    if (!firstMeasured.current) {
      firstMeasured.current = true;
      const pos = positions.current[state.index];
      if (pos) {
        blobX.value = pos.x + pos.w / 2 - BLOB_W / 2;
      }
    }
    setMeasured(true);
  };

  const blobStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: blobX.value },
      { scaleX: blobScaleX.value },
    ],
  }));

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: colors.tabBarBg,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingTop: 8,
        paddingBottom: Math.max(insets.bottom, 6),
        paddingHorizontal: 4,
      }}
    >
      <View
        pointerEvents="none"
        style={{ position: "absolute", top: 10, left: 4, right: 4, height: BLOB_H }}
      >
        {isGlass ? (
          <Animated.View
            style={[
              {
                width: BLOB_W,
                height: BLOB_H,
                borderRadius: BLOB_H / 2,
                backgroundColor: colors.accent,
                opacity: 0.24,
                boxShadow: "0 2px 14px rgba(198,255,61,0.35)",
              },
              blobStyle,
            ]}
          />
        ) : null}
      </View>

      {TABS.map((tab, index) => {
        const focused = index === activeIndex;
        const tint = focused
          ? isGlass
            ? colors.accent
            : colors.textPrimary
          : colors.textMuted;
        return (
          <Pressable
            key={tab.name}
            onLayout={onLayoutTab(index)}
            onPress={() => {
              navigation.navigate(tab.name as never);
            }}
            style={{ flex: 1, alignItems: "center", gap: 3, paddingVertical: 4 }}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={tab.label}
          >
            <View style={{ height: 24, justifyContent: "center" }}>
              <Icon name={tab.icon} size={22} color={tint} strokeWidth={focused ? 2.2 : 1.8} />
            </View>
            <Text
              style={{
                fontFamily: focused
                  ? theme.typography.small.fontFamily
                  : theme.typography.small.fontFamily,
                fontSize: 10.5,
                lineHeight: 13,
                color: tint,
                fontWeight: focused ? "700" : "500",
              }}
            >
              {tab.label}
            </Text>
            {!isGlass && focused ? (
              <View
                style={{
                  position: "absolute",
                  bottom: -2,
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: colors.accent,
                }}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
