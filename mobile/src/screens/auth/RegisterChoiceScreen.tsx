import React from "react";
import { View, Text, StyleSheet, SafeAreaView } from "react-native";
import { colors, spacing, typography, radii } from "../../theme/colors";
import { Button } from "../../components";

interface RegisterChoiceProps {
  navigation: { navigate: (screen: string) => void; goBack: () => void };
}

export function RegisterChoiceScreen({ navigation }: RegisterChoiceProps) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>
          How would you like to register?
        </Text>

        <View style={styles.options}>
          <Button
            title="I'm a Staylite Student"
            onPress={() => navigation.navigate("RegisterStaylite")}
            variant="primary"
            size="lg"
          />
          <Text style={styles.optionDesc}>
            Have a matric number? Use this to verify your identity quickly.
          </Text>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Button
            title="I'm a Fresher (New Student)"
            onPress={() => navigation.navigate("RegisterFresher")}
            variant="outline"
            size="lg"
          />
          <Text style={styles.optionDesc}>
            Just got admitted? Register with your JAMB number.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: {
    flex: 1,
    padding: spacing.lg,
    paddingTop: spacing.xxl,
  },
  title: { ...typography.h1, color: colors.textPrimary },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  options: { gap: spacing.sm },
  optionDesc: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    ...typography.caption,
    color: colors.textMuted,
    marginHorizontal: spacing.md,
  },
});
