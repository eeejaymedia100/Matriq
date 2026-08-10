import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { colors, spacing, typography } from "../../theme/colors";
import { Input, Button } from "../../components";
import { useAuth } from "../../contexts/AuthContext";

interface LoginScreenProps {
  navigation: { navigate: (screen: string) => void };
}

export function LoginScreen({ navigation }: LoginScreenProps) {
  const { login, completeMfaLogin } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setError("");
    if (!email.trim() || !password) {
      setError("Please enter your email and password");
      return;
    }

    setLoading(true);
    try {
      const result = await login(email.trim().toLowerCase(), password);
      if (result.mfaRequired) {
        // Step 2: TOTP code required.
        setChallengeToken(result.challengeToken ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async () => {
    setError("");
    if (!challengeToken || code.length !== 6) {
      setError("Enter the 6-digit code from your authenticator app");
      return;
    }

    setLoading(true);
    try {
      await completeMfaLogin(challengeToken, code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>
            {challengeToken ? "Two-factor authentication" : "Welcome back"}
          </Text>
          <Text style={styles.subtitle}>
            {challengeToken
              ? "Enter the code from your authenticator app"
              : "Sign in to your Matriq account"}
          </Text>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {challengeToken ? (
            <View style={styles.form}>
              <Input
                label="Authentication code"
                placeholder="••••••"
                keyboardType="number-pad"
                maxLength={6}
                value={code}
                onChangeText={(t) => setCode(t.replace(/[^0-9]/g, ""))}
                onSubmitEditing={handleMfaSubmit}
              />
              <Button
                title="Verify & Sign In"
                onPress={handleMfaSubmit}
                loading={loading}
                size="lg"
              />
              <Text
                style={[styles.link, { textAlign: "center" }]}
                onPress={() => {
                  setChallengeToken(null);
                  setCode("");
                  setError("");
                }}
              >
                ← Back
              </Text>
            </View>
          ) : (
            <View style={styles.form}>
              <Input
                label="Email"
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={setEmail}
              />
              <Input
                label="Password"
                placeholder="Enter your password"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={handleLogin}
              />
              <Button
                title="Sign In"
                onPress={handleLogin}
                loading={loading}
                size="lg"
              />
            </View>
          )}

          {!challengeToken && (
            <View style={styles.links}>
              <Text style={styles.linkText}>Don't have an account? </Text>
              <Text
                style={styles.link}
                onPress={() => navigation.navigate("RegisterChoice")}
              >
                Create one
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingTop: spacing.xxl,
  },
  title: { ...typography.h1, color: colors.textPrimary },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  errorBox: {
    backgroundColor: colors.errorBg,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: { ...typography.caption, color: colors.error },
  form: { gap: spacing.sm },
  links: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.xl,
  },
  linkText: { ...typography.body, color: colors.textSecondary },
  link: { ...typography.bodyBold, color: colors.primary },
});
