import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, radii } from "../theme/colors";
import type { FriendlyError } from "../utils/errors";

interface ErrorBannerProps {
  error: FriendlyError;
}

/**
 * Structured error banner. Shows what happened, why, and what to do next —
 * never raw HTTP codes or backend jargon.
 */
export function ErrorBanner({ error }: ErrorBannerProps) {
  return (
    <View style={styles.box}>
      <View style={styles.iconWrap}>
        <Ionicons name="alert-circle" size={22} color={colors.error} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title}>{error.title}</Text>
        <Text style={styles.message}>{error.message}</Text>
        <Text style={styles.action}>{error.action}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.errorBg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "#F5C2C2",
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  iconWrap: {
    paddingTop: 2,
  },
  textWrap: { flex: 1, gap: 2 },
  title: {
    ...typography.captionBold,
    color: colors.error,
  },
  message: {
    ...typography.caption,
    color: "#7F1D1D",
    lineHeight: 18,
  },
  action: {
    ...typography.caption,
    color: colors.error,
    fontWeight: "600",
    marginTop: spacing.xs,
    lineHeight: 18,
  },
});
