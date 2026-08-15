import React from "react";
import { View, Pressable, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

/**
 * Signature bottom nav (round-2 QA §10). The active tab renders as a raised
 * circular bubble that pops up above the bar's top edge; a ring in the bar's
 * own background colour around the bubble makes the bar silhouette read as
 * if it notches/curves around it — not an icon drawn on top of a flat bar.
 *
 * - Glass: lime bubble with a soft glow, dark icon.
 * - Pop:   lime bubble with the ink ring + offset shadow (sticker language).
 */
export function LiquidTabBar({ state, navigation }: BottomTabBarProps) {
  const { theme, isGlass } = useTheme();
  const colors = theme.colors;
  const insets = useSafeAreaInsets();

  const activeIndex = state.index;

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: colors.tabBarBg,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingTop: 14,
        paddingBottom: Math.max(insets.bottom, 6),
        paddingHorizontal: 4,
      }}
    >
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
            onPress={() => {
              navigation.navigate(tab.name as never);
            }}
            style={{ flex: 1, alignItems: "center", gap: 2, paddingVertical: 2 }}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={tab.label}
          >
            <View style={{ height: 40, alignItems: "center", justifyContent: "center" }}>
              {focused ? (
                // Raised bubble — the bar's bg ring creates the notch silhouette.
                <View
                  style={{
                    position: "absolute",
                    top: -24,
                    width: 46,
                    height: 46,
                    borderRadius: 23,
                    backgroundColor: colors.accent,
                    borderWidth: 3,
                    borderColor: colors.tabBarBg,
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: isGlass
                      ? "0 0 26px rgba(198,255,61,0.45)"
                      : "3px 3px 0 #170B26",
                  }}
                >
                  <Icon name={tab.icon} size={21} color="#170B26" />
                </View>
              ) : (
                <Icon
                  name={tab.icon}
                  size={22}
                  color={tint}
                  strokeWidth={1.8}
                />
              )}
            </View>
            <Text
              style={{
                fontFamily: theme.typography.small.fontFamily,
                fontSize: 10.5,
                lineHeight: 13,
                color: tint,
                fontWeight: focused ? "700" : "500",
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
