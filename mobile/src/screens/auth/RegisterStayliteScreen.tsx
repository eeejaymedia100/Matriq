import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from "react-native";
import { colors, spacing, typography } from "../../theme/colors";
import { Input, Button } from "../../components";
import { useAuth, type StayliteData } from "../../contexts/AuthContext";
import { TERMS_URL, PRIVACY_URL } from "../../constants/legal";

interface Props {
  navigation: {
    navigate: (screen: string, params?: unknown) => void;
    goBack: () => void;
  };
}

export function RegisterStayliteScreen({ navigation }: Props) {
  const { registerStaylite } = useAuth();
  const [form, setForm] = useState<StayliteData>({
    email: "",
    password: "",
    fullName: "",
    matricNumber: "",
    faculty: "",
    department: "",
    level: "",
    privacyPolicyVersion: "1.0",
    termsVersion: "1.0",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const update = (key: keyof StayliteData, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleRegister = async () => {
    setError("");
    if (!form.email || !form.password || !form.fullName || !form.matricNumber) {
      setError("Please fill all required fields");
      return;
    }
    setLoading(true);
    try {
      await registerStaylite(form);
      // Straight into OTP entry — the verification email has already been
      // sent by the backend.
      navigation.navigate("VerifyEmail", {
        email: form.email.trim().toLowerCase(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
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
          <Text style={styles.title}>Staylite Registration</Text>
          <Text style={styles.subtitle}>
            Enter your details. Your account will be provisional until an executive
            verifies your identity.
          </Text>
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          <Input
            label="Full Name"
            placeholder="John Doe"
            value={form.fullName}
            onChangeText={(v) => update("fullName", v)}
          />
          <Input
            label="Email"
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={form.email}
            onChangeText={(v) => update("email", v)}
          />
          <Input
            label="Matric Number"
            placeholder="ENG/2020/12345"
            value={form.matricNumber}
            onChangeText={(v) => update("matricNumber", v)}
          />
          <Input
            label="Faculty"
            placeholder="Engineering"
            value={form.faculty}
            onChangeText={(v) => update("faculty", v)}
          />
          <Input
            label="Department"
            placeholder="Computer Engineering"
            value={form.department}
            onChangeText={(v) => update("department", v)}
          />
          <Input
            label="Level"
            placeholder="400"
            value={form.level}
            onChangeText={(v) => update("level", v)}
          />
          <Input
            label="Password"
            placeholder="Min. 8 characters"
            secureTextEntry
            value={form.password}
            onChangeText={(v) => update("password", v)}
          />
          <Button
            title="Create Account"
            onPress={handleRegister}
            loading={loading}
            size="lg"
          />
          <Text style={styles.legal}>
            By registering, you agree to our{" "}
            <Text style={styles.link} onPress={() => Linking.openURL(TERMS_URL).catch(() => {})}>
              Terms & Conditions
            </Text>{" "}
            and{" "}
            <Text style={styles.link} onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}>
              Privacy Policy
            </Text>
            .
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingTop: spacing.lg },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  errorBox: {
    backgroundColor: colors.errorBg,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: { ...typography.caption, color: colors.error },
  legal: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.md,
    lineHeight: 18,
  },
  link: {
    color: colors.primary,
    textDecorationLine: "underline",
    fontWeight: "600",
  },
});
