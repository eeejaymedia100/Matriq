import React, { useState } from "react";
import { View, Text } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardScreen } from "../../components/KeyboardScreen";
import { Field, Button, ErrorBanner, OtpInput } from "../../components";
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
  // Format errors surface after blur, not mid-keystroke — a half-typed
  // address isn't wrong, it's just not finished. Empty-after-touch is the
  // other case that earns an error.
  const emailError =
    touched.email && email.length > 0 && !isValidEmail(email)
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
    <KeyboardScreen
      themed={false}
      center
      paddingTop={8}
      edges={["top", "bottom", "left", "right"]}
    >

          <View style={{ alignItems: "center", marginBottom: 24 }}>
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
              <Field
                label="Email"
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (t) setTouched((p) => ({ ...p, email: false }));
                  if (error) setError(null);
                }}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                error={emailError}
                valid={!emailError && isRequired(email)}
              />
              <Field
                label="Password"
                placeholder="Enter your password"
                secureTextEntry
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  if (t) setTouched((p) => ({ ...p, password: false }));
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
    </KeyboardScreen>
  );
}
