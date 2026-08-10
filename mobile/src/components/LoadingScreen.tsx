import React from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { colors, typography, spacing } from "../theme/colors";

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = "Loading..." }: LoadingScreenProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
    gap: spacing.md,
  },
  text: { ...typography.body, color: colors.textSecondary },
});
