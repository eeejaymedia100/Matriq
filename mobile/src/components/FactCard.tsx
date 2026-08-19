import React from "react";
import { View, Text } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { Surface } from "./Surface";
import { Icon } from "./icons";
import type { Fact } from "../utils/facts";

/**
 * Rotating "did you know" card (spec §6 Home hero, §9 Study #1). Built once
 * here and shared by both screens so the card isn't rendered twice.
 */
export function FactCard({ fact, label }: { fact: Fact; label: string }) {
  const { theme } = useTheme();
  const colors = theme.colors;
  return (
    <Surface variant="sticker" style={{ padding: 20 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Icon name="sparkle" size={16} color={colors.accent} />
        <Text
          style={[
            theme.typography.small,
            { color: colors.textMuted, letterSpacing: 1, textTransform: "uppercase" },
          ]}
        >
          {fact.tag} · {label}
        </Text>
      </View>
      <Text style={[theme.typography.h3, { color: colors.textPrimary }]}>{fact.title}</Text>
      <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 6, lineHeight: 24 }]}>
        {fact.body}
      </Text>
    </Surface>
  );
}
