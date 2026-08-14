import React from "react";
import { View, Text } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { Icon } from "./icons";

interface PasswordStrengthProps {
  password: string;
}

const RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: "At least 8 characters", test: (p) => p.length >= 8 },
  { label: "One uppercase letter (A–Z)", test: (p) => /[A-Z]/.test(p) },
  { label: "One lowercase letter (a–z)", test: (p) => /[a-z]/.test(p) },
  { label: "One number (0–9)", test: (p) => /[0-9]/.test(p) },
  { label: "One symbol (! @ # $ …)", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function PasswordStrength({ password }: PasswordStrengthProps) {
  const { theme } = useTheme();
  const colors = theme.colors;

  const rules = RULES.map((r) => ({ ...r, ok: r.test(password) }));
  const met = rules.filter((r) => r.ok).length;
  const allMet = met === rules.length;

  return (
    <View
      style={{
        backgroundColor: colors.surfaceAlt,
        borderRadius: 10,
        padding: 16,
        marginBottom: 16,
        gap: 6,
        borderWidth: 1,
        borderColor: allMet ? colors.success + "44" : colors.border,
      }}
    >
      <Text style={[theme.typography.captionBold, { color: colors.textSecondary, marginBottom: 2 }]}>
        {allMet ? "Password looks good" : `Password must include (${met}/${rules.length})`}
      </Text>
      {rules.map((rule) => (
        <View key={rule.label} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon
            name={rule.ok ? "check" : "dot"}
            size={15}
            color={rule.ok ? colors.success : colors.textMuted}
          />
          <Text
            style={[
              theme.typography.caption,
              { color: rule.ok ? colors.success : colors.textMuted },
            ]}
          >
            {rule.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
