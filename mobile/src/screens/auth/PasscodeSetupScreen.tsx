import React, { useState } from "react";
import { View, Text, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../theme/ThemeContext";
import { ThemedScreen } from "../../components/Surface";
import { Icon } from "../../components/icons";
import { Button, OtpInput } from "../../components";
import { setPasscode } from "../../utils/passcode";

/**
 * Mandatory passcode creation (spec §4) — immediately after verification,
 * before the student ever sees Home. Not optional, not a to-do: every account
 * needs a 6-digit passcode because it protects the account afterward (§5).
 */
export function PasscodeSetupScreen({ onDone }: { onDone: () => void }) {
  const { theme } = useTheme();
  const colors = theme.colors;

  const [step, setStep] = useState<1 | 2>(1);
  const [first, setFirst] = useState("");
  const [current, setCurrent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleFirstComplete = (code: string) => {
    setFirst(code);
    setCurrent("");
    setError(null);
    setStep(2);
  };

  const handleConfirm = async (code: string) => {
    if (code !== first) {
      // Friendly, structured error (spec §12): what / why / what to do.
      setError("The two codes don't match — enter the same 6 digits.");
      setCurrent("");
      return;
    }
    await setPasscode(code);
    onDone();
  };

  return (
    <ThemedScreen>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: "center" }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ alignItems: "center", marginBottom: 28 }}>
              <View
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: 999,
                  backgroundColor: colors.surfaceAlt,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 18,
                }}
              >
                <Icon name="lock" size={30} color={colors.accent} />
              </View>
              <Text style={[theme.typography.h1, { color: colors.textPrimary, textAlign: "center" }]}>
                {step === 1 ? "Create a passcode" : "Confirm your passcode"}
              </Text>
              <Text
                style={[
                  theme.typography.body,
                  { color: colors.textSecondary, textAlign: "center", marginTop: 6, lineHeight: 23, maxWidth: 320 },
                ]}
              >
                {step === 1
                  ? "You'll use this 6-digit code to unlock Matriq when you come back after a while — no need to sign in every time."
                  : "Enter it once more to lock it in."}
              </Text>
            </View>

            <OtpInput
              value={current}
              onChange={(v) => {
                setCurrent(v);
                if (error) setError(null);
              }}
              onComplete={step === 1 ? handleFirstComplete : (c) => void handleConfirm(c)}
              error={!!error}
            />

            {error ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 16,
                  backgroundColor: colors.errorBg,
                  borderRadius: 12,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: colors.error + "44",
                }}
              >
                <Icon name="alert" size={16} color={colors.error} />
                <Text style={[theme.typography.caption, { color: colors.error, flex: 1 }]}>{error}</Text>
              </View>
            ) : null}

            <View style={{ marginTop: 24 }}>
              {step === 2 ? (
                <Button title="Back" onPress={() => { setStep(1); setError(null); setCurrent(""); }} />
              ) : (
                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    backgroundColor: colors.surfaceAlt,
                    borderRadius: 12,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Icon name="shield" size={16} color={colors.textMuted} />
                  <Text style={[theme.typography.caption, { color: colors.textSecondary, flex: 1, lineHeight: 18 }]}>
                    Stored only on this device — never sent to our servers.
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedScreen>
  );
}
