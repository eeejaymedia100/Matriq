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
import { useAuth, type FresherData } from "../../contexts/AuthContext";
import { TERMS_URL, PRIVACY_URL } from "../../constants/legal";

interface Props {
  navigation: {
    navigate: (screen: string, params?: unknown) => void;
    goBack: () => void;
  };
}

export function RegisterFresherScreen({ navigation }: Props) {
  const { registerFresher } = useAuth();
  const [form, setForm] = useState<FresherData>({
    email: "",
    password: "",
    fullName: "",
    jambNumber: "",
    faculty: "",
    department: "",
    privacyPolicyVersion: "1.0",
    termsVersion: "1.0",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const update = (key: keyof FresherData, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleRegister = async () => {
    setError("");
    if (!form.email || !form.password || !form.fullName || !form.jambNumber) {
      setError("Please fill all required fields");
      return;
    }
    setLoading(true);
    try {
      await registerFresher(form);
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
          <Text style={styles.title}>Fresher Registration</Text>
          <Text style={styles.subtitle}>Welcome! Fill in your details to get started.</Text>
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          <Input label="Full Name" placeholder="Jane Doe" value={form.fullName} onChangeText={(v) => update("fullName", v)} />
          <Input label="Email" placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" value={form.email} onChangeText={(v) => update("email", v)} />
          <Input label="JAMB Registration Number" placeholder="12345678AB" value={form.jambNumber} onChangeText={(v) => update("jambNumber", v)} />
          <Input label="Faculty" placeholder="Science" value={form.faculty} onChangeText={(v) => update("faculty", v)} />
          <Input label="Department" placeholder="Biochemistry" value={form.department} onChangeText={(v) => update("department", v)} />
          <Input label="Password" placeholder="Min. 8 characters" secureTextEntry value={form.password} onChangeText={(v) => update("password", v)} />
          <Button title="Create Account" onPress={handleRegister} loading={loading} size="lg" />
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
  title: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.xs },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  errorBox: { backgroundColor: colors.errorBg, borderRadius: 8, padding: spacing.md, marginBottom: spacing.md },
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
