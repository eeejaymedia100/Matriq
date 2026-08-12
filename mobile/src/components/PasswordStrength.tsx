import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography } from "../theme/colors";

interface PasswordStrengthProps {
  password: string;
}

interface Rule {
  label: string;
  ok: boolean;
}

const RULES: Omit<Rule, "ok">[] = [
  { label: "At least 8 characters" },
  { label: "One uppercase letter (A–Z)" },
  { label: "One lowercase letter (a–z)" },
  { label: "One number (0–9)" },
  { label: "One symbol (! @ # $ …)" },
];

export function PasswordStrength({ password }: PasswordStrengthProps) {
  const rules: Rule[] = [
    { ...RULES[0], ok: password.length >= 8 },
    { ...RULES[1], ok: /[A-Z]/.test(password) },
    { ...RULES[2], ok: /[a-z]/.test(password) },
    { ...RULES[3], ok: /[0-9]/.test(password) },
    { ...RULES[4], ok: /[^A-Za-z0-9]/.test(password) },
  ];

  const met = rules.filter((r) => r.ok).length;
  const allMet = met === rules.length;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>
        {allMet
          ? "Password looks good"
          : `Password must include (${met}/${rules.length})`}
      </Text>
      {rules.map((rule) => (
        <View key={rule.label} style={styles.rule}>
          <Ionicons
            name={rule.ok ? "checkmark-circle" : "ellipse-outline"}
            size={16}
            color={rule.ok ? colors.success : colors.textMuted}
          />
          <Text
            style={[
              styles.ruleText,
              rule.ok ? styles.ruleOk : styles.rulePending,
            ]}
          >
            {rule.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs + 2,
  },
  heading: {
    ...typography.captionBold,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  rule: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  ruleText: { ...typography.caption },
  ruleOk: { color: colors.success },
  rulePending: { color: colors.textMuted },
});
