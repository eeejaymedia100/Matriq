import React from "react";
import { View, Text, StyleSheet, type ViewStyle } from "react-native";
import { colors, radii, spacing, typography } from "../theme/colors";

interface CardProps {
  children?: React.ReactNode;
  title?: string;
  subtitle?: string;
  style?: ViewStyle;
  headerRight?: React.ReactNode;
}

export function Card({ children, title, subtitle, style, headerRight }: CardProps) {
  return (
    <View style={[styles.card, style]}>
      {(title ?? headerRight) ? (
        <View style={styles.header}>
          <View style={styles.headerText}>
            {title && <Text style={styles.title}>{title}</Text>}
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
          {headerRight}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: colors.textPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.md,
  },
  headerText: { flex: 1 },
  title: { ...typography.h3, color: colors.textPrimary },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
});
