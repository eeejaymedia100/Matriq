import React, { useState, useEffect, useRef } from "react";
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
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { colors, spacing, typography, radii } from "../../theme/colors";
import { Input, Button, ErrorBanner } from "../../components";
import { useAuth } from "../../contexts/AuthContext";
import type { AuthStackParamList } from "../../navigation/types";
import { formatApiError, type FriendlyError } from "../../utils/errors";

type Props = NativeStackScreenProps<AuthStackParamList, "VerifyEmail">;

/** Max wait before the "Resend code" link re-enables (30s). */
const RESEND_COOLDOWN_S = 30;

export function VerifyEmailScreen({ route, navigation }: Props) {
  const { verifyEmail, resendVerification } = useAuth();
  const email = (route.params?.email ?? "").trim().toLowerCase();

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [info, setInfo] = useState(
    `We sent a 6-digit code to ${email}. Enter it below to verify your account.`,
  );
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const cooldownRef = useRef(RESEND_COOLDOWN_S);

  // Start the resend countdown as soon as the screen opens (an email was just
  // sent by registration). Ticks every second down to 0.
  useEffect(() => {
    const id = setInterval(() => {
      cooldownRef.current = Math.max(0, cooldownRef.current - 1);
      setCooldown(cooldownRef.current);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const handleVerify = async () => {
    setError(null);
    if (code.length !== 6) {
      setError({
        title: "Enter the 6-digit code",
        message: "The code we emailed you has 6 digits.",
        action: "Check your inbox (and spam) for the code and enter it above.",
      });
      return;
    }

    setLoading(true);
    try {
      await verifyEmail(code);
      // Success: isAuthenticated flips, AppNavigator swaps to the main app.
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    if (cooldown > 0) return;

    setResending(true);
    try {
      const msg = await resendVerification(email);
      setInfo(msg);
      setCode("");
      // Reset the 30s countdown.
      cooldownRef.current = RESEND_COOLDOWN_S;
      setCooldown(RESEND_COOLDOWN_S);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setResending(false);
    }
  };

  const formatCountdown = (s: number) =>
    `0:${s.toString().padStart(2, "0")}`;

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
            <View style={styles.iconWrap}>
              <Ionicons name="mail-outline" size={28} color={colors.primary} />
            </View>
            <Text style={styles.title}>Verify your email</Text>
            <Text style={styles.subtitle}>{info}</Text>
          </View>

          {error ? <ErrorBanner error={error} /> : null}

          <View style={styles.form}>
            <Input
              label="Verification code"
              placeholder="••••••"
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={(t) => {
                setCode(t.replace(/[^0-9]/g, ""));
                if (error) setError(null);
              }}
              onSubmitEditing={handleVerify}
              valid={code.length === 6}
            />
            <Button
              title="Verify & Continue"
              onPress={handleVerify}
              loading={loading}
              size="lg"
            />

            {/* Resend — countdown sits right beside "Didn't get the code?" */}
            <View style={styles.resendRow}>
              <Text style={styles.resendHint}>Didn't get the code? </Text>
              {cooldown > 0 ? (
                <Text style={styles.countdown}>
                  Resend in {formatCountdown(cooldown)}
                </Text>
              ) : (
                <Text style={styles.link} onPress={handleResend}>
                  {resending ? "Sending..." : "Resend code"}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.spamHint}>
            <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
            <Text style={styles.spamHintText}>
              Can't find it? Check your spam or junk folder — it can take a
              minute to arrive.
            </Text>
          </View>

          <Text
            style={styles.backLink}
            onPress={() => navigation.navigate("Login")}
          >
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
  header: { alignItems: "center", marginBottom: spacing.lg },
  iconWrap: {
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
    lineHeight: 22,
  },
  form: { gap: spacing.sm },
  resendRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: spacing.md,
  },
  resendHint: { ...typography.body, color: colors.textSecondary },
  countdown: { ...typography.bodyBold, color: colors.textMuted },
  link: { ...typography.bodyBold, color: colors.primary },
  spamHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.xl,
  },
  spamHintText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
  backLink: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.xl,
  },
});
