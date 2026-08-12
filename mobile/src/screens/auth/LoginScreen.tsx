import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, radii } from "../../theme/colors";
import { Input, Button, ErrorBanner } from "../../components";
import { useAuth } from "../../contexts/AuthContext";
import { ApiError } from "../../api/client";
import { formatApiError, type FriendlyError } from "../../utils/errors";
import { isValidEmail, isRequired } from "../../utils/validation";

interface LoginScreenProps {
  navigation: { navigate: (screen: string, params?: unknown) => void };
}

export function LoginScreen({ navigation }: LoginScreenProps) {
  const { login, completeMfaLogin } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [touched, setTouched] = useState<{ email: boolean; password: boolean }>({
    email: false,
    password: false,
  });

  const emailInvalid = email.length > 0 && !isValidEmail(email);
  const emailError = emailInvalid
    ? "That email doesn't look right."
    : touched.email && !isRequired(email)
      ? "Please enter your email."
      : undefined;
  const passwordError =
    touched.password && !isRequired(password)
      ? "Please enter your password."
      : undefined;

  const handleLogin = async () => {
    setError(null);
    setTouched({ email: true, password: true });
    if (!isValidEmail(email) || !isRequired(password)) {
      setError({
        title: "Please check your details",
        message: "Enter your email and password to sign in.",
        action: "Fix the highlighted fields and try again.",
      });
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
      // Unverified account → send them to the OTP entry screen instead of
      // showing a dead 401 message.
      if (err instanceof ApiError && err.code === "EMAIL_NOT_VERIFIED") {
        navigation.navigate("VerifyEmail", {
          email: email.trim().toLowerCase(),
        });
        return;
      }
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async () => {
    setError(null);
    if (!challengeToken || code.length !== 6) {
      setError({
        title: "Enter the 6-digit code",
        message: "The code from your authenticator app is 6 digits long.",
        action: "Check your authenticator app and enter the code.",
      });
      return;
    }

    setLoading(true);
    try {
      await completeMfaLogin(challengeToken, code);
    } catch (err) {
      setError(formatApiError(err));
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
          <View style={styles.header}>
            <View style={styles.logo}>
              <Ionicons
                name={challengeToken ? "shield-checkmark-outline" : "person-outline"}
                size={28}
                color={colors.primary}
              />
            </View>
            <Text style={styles.title}>
              {challengeToken ? "Two-factor authentication" : "Welcome back"}
            </Text>
            <Text style={styles.subtitle}>
              {challengeToken
                ? "Enter the code from your authenticator app"
                : "Sign in to your Matriq account"}
            </Text>
          </View>

          {error ? <ErrorBanner error={error} /> : null}

          {challengeToken ? (
            <View style={styles.form}>
              <Input
                label="Authentication code"
                placeholder="••••••"
                keyboardType="number-pad"
                maxLength={6}
                value={code}
                onChangeText={(t) => {
                  setCode(t.replace(/[^0-9]/g, ""));
                  if (error) setError(null);
                }}
                onSubmitEditing={handleMfaSubmit}
                valid={code.length === 6}
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
                  setError(null);
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
                onChangeText={(t) => {
                  setEmail(t);
                  if (error) setError(null);
                }}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                error={emailError}
                valid={!emailError && isRequired(email)}
              />
              <Input
                label="Password"
                placeholder="Enter your password"
                secureTextEntry
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  if (error) setError(null);
                }}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                error={passwordError}
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
  header: { alignItems: "center", marginBottom: spacing.lg },
  logo: {
    width: 64,
    height: 64,
    borderRadius: radii.full,
    backgroundColor: colors.primaryLight + "22",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  title: { ...typography.h1, color: colors.textPrimary, textAlign: "center" },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: "center",
  },
  form: { gap: spacing.sm },
  links: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.xl,
  },
  linkText: { ...typography.body, color: colors.textSecondary },
  link: { ...typography.bodyBold, color: colors.primary },
});
