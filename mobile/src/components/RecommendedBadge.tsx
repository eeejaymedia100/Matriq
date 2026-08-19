import React from "react";
import { View, Text } from "react-native";
import { useTheme } from "../theme/ThemeContext";

/** Small "Recommended" pill on model cards (Study + Offline AI picker). */
export function RecommendedBadge() {
  const { theme } = useTheme();
  return (
    <View
      style={{
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 2,
        backgroundColor: theme.colors.accent,
      }}
    >
      <Text style={{ fontSize: 10, fontWeight: "700", color: "#170B26" }}>
        Recommended
      </Text>
    </View>
  );
}
