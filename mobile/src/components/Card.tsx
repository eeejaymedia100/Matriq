import React from "react";
import { View, Text, type ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { Surface } from "./Surface";

interface CardProps {
  children?: React.ReactNode;
  title?: string;
  subtitle?: string;
  style?: ViewStyle;
  headerRight?: React.ReactNode;
  /** "sticker" gives the Pop brutalist hero treatment (ink border + offset shadow). */
  variant?: "card" | "sticker";
  onPress?: () => void;
}

export function Card({
  children,
  title,
  subtitle,
  style,
  headerRight,
  variant = "card",
  onPress,
}: CardProps) {
  const { theme } = useTheme();
  const colors = theme.colors;

  return (
    <Surface
      variant={variant}
      pressable={!!onPress}
      onPress={onPress}
      style={[styles.card, style]}
    >
      {title ?? headerRight ? (
        <View style={styles.header}>
          <View style={styles.headerText}>
            {title && (
              <Text style={[theme.typography.h3, { color: colors.textPrimary }]}>
                {title}
              </Text>
            )}
            {subtitle && (
              <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
                {subtitle}
              </Text>
            )}
          </View>
          {headerRight}
        </View>
      ) : null}
      {children}
    </Surface>
  );
}

const styles = {
  card: { padding: 16, marginBottom: 16 } as ViewStyle,
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  } as ViewStyle,
  headerText: { flex: 1 } as ViewStyle,
};
