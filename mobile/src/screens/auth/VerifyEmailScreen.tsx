import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTheme } from "../../theme/ThemeContext";
import { Button, ErrorBanner, OtpInput } from "../../components";
import { Icon } from "../../components/icons";
import { useAuth } from "../../contexts/AuthContext";
import type { AuthStackParamList } from "../../navigation/types";
import { formatApiError, type FriendlyError } from "../../utils/errors";

type Props = NativeStackScreenProps<AuthStackParamList, "VerifyEmail">;

/** Max wait before the "Resend code" link re-enables (30s — spec §1). */
const RESEND_COOLDOWN_S = 30;

export function VerifyEmailScreen({ route, navigation }: Props) {
  const { verifyEmail, resendVerification } = useAuth();
  const { theme } = useTheme();
  const colors = theme.colors;
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

  const handleVerify = async (fullCode?: string) => {
    setError(null);
    const finalCode = fullCode ?? code;
    if (finalCode.length !== 6) {
      setError({
        title: "Enter the 6-digit code",
        message: "The code we emailed you has 6 digits.",
        action: "Check your inbox (and spam) for the code and enter it above.",
      });
      return;
    }

    setLoading(true);
    try {
      await verifyEmail(finalCode);
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
      cooldownRef.current = RESEND_COOLDOWN_S;
      setCooldown(RESEND_COOLDOWN_S);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setResending(false);
    }
  };

  const formatCountdown = (s: number) => `0:${s.toString().padStart(2, "0")}`;

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
              <Icon name="mail" size={28} color={colors.brand} />
            </View>
            <Text style={[theme.typography.h1, { color: colors.textPrimary, textAlign: "center" }]}>
              Verify your email
            </Text>
            <Text
              style={[
                theme.typography.body,
                { color: colors.textSecondary, marginTop: 4, textAlign: "center", lineHeight: 22 },
              ]}
            >
              {info}
            </Text>
          </View>

          {error ? <ErrorBanner error={error} /> : null}

          <View style={{ gap: 12 }}>
            <Text style={[theme.typography.captionBold, { color: colors.textSecondary, marginBottom: 4 }]}>
              Verification code
            </Text>
            <OtpInput
              value={code}
              onChange={(v) => {
                setCode(v);
                if (error) setError(null);
              }}
              onComplete={handleVerify}
            />
            <View style={{ marginTop: 8 }}>
              <Button
                title="Verify & Continue"
                onPress={() => handleVerify()}
                loading={loading}
                size="lg"
              />
            </View>

            {/* Resend — countdown sits right beside "Didn't get the code?" */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                flexWrap: "wrap",
                marginTop: 8,
              }}
            >
              <Text style={[theme.typography.body, { color: colors.textSecondary }]}>
                Didn't get the code?{" "}
              </Text>
              {cooldown > 0 ? (
                <Text style={[theme.typography.bodyBold, { color: colors.textMuted }]}>
                  Resend in {formatCountdown(cooldown)}
                </Text>
              ) : (
                <Text
                  style={[theme.typography.bodyBold, { color: colors.brand }]}
                  onPress={handleResend}
                >
                  {resending ? "Sending..." : "Resend code"}
                </Text>
              )}
            </View>
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: colors.surfaceAlt,
              borderRadius: 14,
              padding: 16,
              marginTop: 32,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Icon name="info" size={16} color={colors.textMuted} />
            <Text style={[theme.typography.caption, { color: colors.textSecondary, flex: 1, lineHeight: 18 }]}>
              Can't find it? Check your spam or junk folder — it can take a minute to arrive.
            </Text>
          </View>

          <Text
            style={[theme.typography.body, { color: colors.textMuted, textAlign: "center", marginTop: 32 }]}
            onPress={() => navigation.navigate("Login")}
          >
            ← Back to sign in
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
