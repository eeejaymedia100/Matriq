import React, { useState } from "react";
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { Input, Button, ErrorBanner, OtpInput } from "../../components";
import { Icon } from "../../components/icons";
import { useAuth } from "../../contexts/AuthContext";
import { ApiError } from "../../api/client";
import { formatApiError, type FriendlyError } from "../../utils/errors";
import { isValidEmail, isRequired } from "../../utils/validation";

interface LoginScreenProps {
  navigation: { navigate: (screen: string, params?: unknown) => void };
}

export function LoginScreen({ navigation }: LoginScreenProps) {
  const { login, completeMfaLogin } = useAuth();
  const { theme } = useTheme();
  const colors = theme.colors;

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
        setChallengeToken(result.challengeToken ?? null);
      }
    } catch (err) {
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 48 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: "center", marginBottom: 24 }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 999,
                backgroundColor: colors.surfaceAlt,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <Icon
                name={challengeToken ? "shield" : "user"}
                size={28}
                color={colors.brand}
              />
            </View>
            <Text
              style={[
                theme.typography.h1,
                { color: colors.textPrimary, textAlign: "center" },
              ]}
            >
              {challengeToken ? "Two-factor authentication" : "Welcome back"}
            </Text>
            <Text
              style={[
                theme.typography.body,
                { color: colors.textSecondary, marginTop: 4, textAlign: "center" },
              ]}
            >
              {challengeToken
                ? "Enter the code from your authenticator app"
                : "Sign in to your Matriq account"}
            </Text>
          </View>

          {error ? <ErrorBanner error={error} /> : null}

          {challengeToken ? (
            <View style={{ gap: 8 }}>
              <Text style={[theme.typography.captionBold, { color: colors.textSecondary, marginBottom: 6 }]}>
                Authentication code
              </Text>
              <OtpInput
                value={code}
                onChange={(v) => {
                  setCode(v);
                  if (error) setError(null);
                }}
                onComplete={handleMfaSubmit}
              />
              <View style={{ marginTop: 12 }}>
                <Button
                  title="Verify & Sign In"
                  onPress={handleMfaSubmit}
                  loading={loading}
                  size="lg"
                />
              </View>
              <Text
                style={[
                  theme.typography.body,
                  { color: colors.textMuted, textAlign: "center", marginTop: 16 },
                ]}
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
            <View style={{ gap: 8 }}>
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
              <View style={{ marginTop: 8 }}>
                <Button
                  title="Sign In"
                  onPress={handleLogin}
                  loading={loading}
                  size="lg"
                />
              </View>
            </View>
          )}

          {!challengeToken && (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                marginTop: 32,
              }}
            >
              <Text style={[theme.typography.body, { color: colors.textSecondary }]}>
                Don't have an account?{" "}
              </Text>
              <Text
                style={[theme.typography.bodyBold, { color: colors.brand }]}
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
