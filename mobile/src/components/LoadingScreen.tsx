import React from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { TAGLINE } from "../theme/tokens";
import { ThemedScreen } from "./Surface";

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = "Loading…" }: LoadingScreenProps) {
  const { theme } = useTheme();
  const colors = theme.colors;

  return (
    <ThemedScreen blobs={false}>
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          gap: 16,
        }}
      >
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[theme.typography.body, { color: colors.textSecondary }]}>
          {message}
        </Text>
        <Text style={[theme.typography.caption, { color: colors.textMuted }]}>
          {TAGLINE}
        </Text>
      </View>
    </ThemedScreen>
  );
}
