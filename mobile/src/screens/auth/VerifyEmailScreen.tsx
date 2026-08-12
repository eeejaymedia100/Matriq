import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { colors, spacing, typography } from "../../theme/colors";
import { Input, Button } from "../../components";
import { useAuth } from "../../contexts/AuthContext";
import type { AuthStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<AuthStackParamList, "VerifyEmail">;

export function VerifyEmailScreen({ route, navigation }: Props) {
  const { verifyEmail, resendVerification } = useAuth();
  const email = (route.params?.email ?? "").trim().toLowerCase();

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState(
    `We sent a 6-digit code to ${email}. Enter it below to verify your account.`,
  );
  const resendCooldown = useRef(0);

  const handleVerify = async () => {
    setError("");
    if (code.length !== 6) {
      setError("Enter the 6-digit code from your email");
      return;
    }

    setLoading(true);
    try {
      await verifyEmail(code);
      // Success: isAuthenticated flips, AppNavigator swaps to the main app.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    const wait = resendCooldown.current - Date.now();
    if (wait > 0) {
      setInfo(`Please wait ${Math.ceil(wait / 1000)}s before requesting a new code.`);
      return;
    }

    setResending(true);
    try {
      const msg = await resendVerification(email);
      setInfo(msg);
      setCode("");
      resendCooldown.current = Date.now() + 30_000; // 30s cooldown
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend the code");
    } finally {
      setResending(false);
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
          <Text style={styles.title}>Verify your email</Text>
          <Text style={styles.subtitle}>{info}</Text>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            <Input
              label="Verification code"
              placeholder="••••••"
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={(t) => setCode(t.replace(/[^0-9]/g, ""))}
              onSubmitEditing={handleVerify}
            />
            <Button
              title="Verify & Continue"
              onPress={handleVerify}
              loading={loading}
              size="lg"
            />
            <Text style={styles.resendHint}>
              Didn't get the code?{" "}
              <Text style={styles.link} onPress={handleResend}>
                {resending ? "Sending..." : "Resend code"}
              </Text>
            </Text>
          </View>

          <Text style={styles.backLink} onPress={() => navigation.navigate("Login")}>
            ← Back to sign in
          </Text>
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
    lineHeight: 22,
  },
  errorBox: {
    backgroundColor: colors.errorBg,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: { ...typography.caption, color: colors.error },
  form: { gap: spacing.sm },
  resendHint: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.md,
  },
  link: { ...typography.bodyBold, color: colors.primary },
  backLink: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.xl,
  },
});
