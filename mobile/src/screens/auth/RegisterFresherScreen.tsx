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
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, radii } from "../../theme/colors";
import { Input, Button, ErrorBanner, PasswordStrength } from "../../components";
import { useAuth, type FresherData } from "../../contexts/AuthContext";
import { TERMS_URL, PRIVACY_URL } from "../../constants/legal";
import { formatApiError, type FriendlyError } from "../../utils/errors";
import {
  isValidEmail,
  isStrongPassword,
  isRequired,
} from "../../utils/validation";

interface Props {
  navigation: {
    navigate: (screen: string, params?: unknown) => void;
    goBack: () => void;
  };
}

type FieldKey = keyof Pick<
  FresherData,
  "fullName" | "email" | "jambNumber" | "faculty" | "department" | "password"
>;

function validate(form: FresherData): Partial<Record<FieldKey, string>> {
  const e: Partial<Record<FieldKey, string>> = {};
  if (form.fullName.trim().length < 2) {
    e.fullName = "Please enter your full name.";
  }
  if (!isValidEmail(form.email)) {
    e.email = "That email doesn't look right.";
  }
  if (form.jambNumber.trim().length < 5) {
    e.jambNumber = "Enter your JAMB registration number (e.g. 12345678AB).";
  }
  if (!isRequired(form.faculty)) {
    e.faculty = "Please enter your faculty.";
  }
  if (!isRequired(form.department)) {
    e.department = "Please enter your department.";
  }
  if (!isStrongPassword(form.password)) {
    e.password = "Your password doesn't meet the requirements below.";
  }
  return e;
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
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);

  const errors = validate(form);

  const update = (key: FieldKey, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (error) setError(null);
  };

  const onBlur = (key: FieldKey) => {
    setTouched((t) => ({ ...t, [key]: true }));
  };

  const fieldError = (key: FieldKey): string | undefined => {
    const live = errors[key];
    if (live) return live;
    if (touched[key] && !isRequired(form[key])) return "This field is required.";
    return undefined;
  };

  const handleRegister = async () => {
    const e = validate(form);
    if (Object.keys(e).length > 0) {
      setTouched({
        fullName: true,
        email: true,
        jambNumber: true,
        faculty: true,
        department: true,
        password: true,
      });
      setError({
        title: "Please check your details",
        message: "Some fields still need attention.",
        action: "Fix the highlighted fields below and try again.",
      });
      return;
    }
    setLoading(true);
    try {
      await registerFresher(form);
      navigation.navigate("VerifyEmail", {
        email: form.email.trim().toLowerCase(),
      });
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
            <View style={styles.iconWrap}>
              <Ionicons name="rocket-outline" size={26} color={colors.primary} />
            </View>
            <Text style={styles.title}>Fresher Registration</Text>
            <Text style={styles.subtitle}>
              Welcome to Matriq! Fill in your details to get started.
            </Text>
          </View>

          {error ? <ErrorBanner error={error} /> : null}

          <Input
            label="Full Name"
            placeholder="Jane Doe"
            autoCapitalize="words"
            value={form.fullName}
            onChangeText={(v) => update("fullName", v)}
            onBlur={() => onBlur("fullName")}
            error={fieldError("fullName")}
            valid={!fieldError("fullName")}
          />
          <Input
            label="Email"
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={form.email}
            onChangeText={(v) => update("email", v)}
            onBlur={() => onBlur("email")}
            error={fieldError("email")}
            valid={!fieldError("email")}
          />
          <Input
            label="JAMB Registration Number"
            placeholder="12345678AB"
            autoCapitalize="characters"
            value={form.jambNumber}
            onChangeText={(v) => update("jambNumber", v)}
            onBlur={() => onBlur("jambNumber")}
            error={fieldError("jambNumber")}
            valid={!fieldError("jambNumber")}
          />
          <Input
            label="Faculty"
            placeholder="Science"
            value={form.faculty}
            onChangeText={(v) => update("faculty", v)}
            onBlur={() => onBlur("faculty")}
            error={fieldError("faculty")}
            valid={!fieldError("faculty")}
          />
          <Input
            label="Department"
            placeholder="Biochemistry"
            value={form.department}
            onChangeText={(v) => update("department", v)}
            onBlur={() => onBlur("department")}
            error={fieldError("department")}
            valid={!fieldError("department")}
          />
          <Input
            label="Password"
            placeholder="Min. 8 characters"
            secureTextEntry
            value={form.password}
            onChangeText={(v) => update("password", v)}
            onBlur={() => onBlur("password")}
            error={fieldError("password")}
          />
          <PasswordStrength password={form.password} />
          <Button
            title="Create Account"
            onPress={handleRegister}
            loading={loading}
            size="lg"
          />
          <Text style={styles.legal}>
            By registering, you agree to our{" "}
            <Text
              style={styles.link}
              onPress={() => Linking.openURL(TERMS_URL).catch(() => {})}
            >
              Terms & Conditions
            </Text>{" "}
            and{" "}
            <Text
              style={styles.link}
              onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}
            >
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
  container: { padding: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  header: { marginBottom: spacing.md },
  iconWrap: {
    alignSelf: "flex-start",
    width: 48,
    height: 48,
    borderRadius: radii.lg,
    backgroundColor: colors.primaryLight + "22",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
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
