import React from "react";
import { View, Text, StyleSheet, SafeAreaView } from "react-native";
import { colors, spacing, typography, radii } from "../../theme/colors";
import { Button } from "../../components";

interface WelcomeScreenProps {
  navigation: { navigate: (screen: string) => void };
}

export function WelcomeScreen({ navigation }: WelcomeScreenProps) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.hero}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>M</Text>
          </View>
          <Text style={styles.title}>Matriq</Text>
          <Text style={styles.subtitle}>
            Your student association,{'\n'}simplified.
          </Text>
        </View>

        <View style={styles.actions}>
          <Button
            title="Sign In"
            onPress={() => navigation.navigate("Login")}
            variant="primary"
            size="lg"
          />
          <Button
            title="Create Account"
            onPress={() => navigation.navigate("RegisterChoice")}
            variant="outline"
            size="lg"
          />
        </View>

        <Text style={styles.footer}>
          By continuing, you agree to our Terms & Conditions and Privacy Policy.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: {
    flex: 1,
    justifyContent: "space-between",
    padding: spacing.lg,
    paddingTop: spacing.xxl * 2,
    paddingBottom: spacing.xl,
  },
  hero: { alignItems: "center", gap: spacing.md },
  logo: {
    width: 80,
    height: 80,
    borderRadius: radii.xl,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  logoText: {
    fontSize: 36,
    fontWeight: "700",
    color: colors.textOnPrimary,
  },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
    fontSize: 36,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 28,
  },
  actions: { gap: spacing.md },
  footer: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "center",
  },
});
