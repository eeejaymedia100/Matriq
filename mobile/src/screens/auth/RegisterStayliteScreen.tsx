import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../theme/ThemeContext";
import { Input, Button, ErrorBanner, PasswordStrength, TermsCheckbox } from "../../components";
import { Icon } from "../../components/icons";
import { useAuth, type StayliteData } from "../../contexts/AuthContext";
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
  StayliteData,
  "fullName" | "email" | "matricNumber" | "faculty" | "department" | "level" | "password"
>;

function validate(form: StayliteData): Partial<Record<FieldKey, string>> {
  const e: Partial<Record<FieldKey, string>> = {};
  if (form.fullName.trim().length < 2) e.fullName = "Please enter your full name.";
  if (!isValidEmail(form.email)) e.email = "That email doesn't look right.";
  if (form.matricNumber.trim().length < 5)
    e.matricNumber = "Enter your matric number (e.g. ENG/2020/12345).";
  if (!isRequired(form.faculty)) e.faculty = "Please enter your faculty.";
  if (!isRequired(form.department)) e.department = "Please enter your department.";
  if (!isRequired(form.level)) e.level = "Please enter your level (e.g. 400).";
  if (!isStrongPassword(form.password))
    e.password = "Your password doesn't meet the requirements below.";
  return e;
}

export function RegisterStayliteScreen({ navigation }: Props) {
  const { registerStaylite } = useAuth();
  const { theme } = useTheme();
  const colors = theme.colors;

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
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsError, setTermsError] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);

  const errors = validate(form);

  const update = (key: FieldKey, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (error) setError(null);
  };

  const onBlur = (key: FieldKey) => setTouched((t) => ({ ...t, [key]: true }));

  const fieldError = (key: FieldKey): string | undefined => {
    const live = errors[key];
    if (live) return live;
    if (touched[key] && !isRequired(form[key])) return "This field is required.";
    return undefined;
  };

  const handleRegister = async () => {
    const e = validate(form);
    const termsOk = termsAccepted;
    setTermsError(!termsOk);
    if (Object.keys(e).length > 0 || !termsOk) {
      setTouched({
        fullName: true,
        email: true,
        matricNumber: true,
        faculty: true,
        department: true,
        level: true,
        password: true,
      });
      setError({
        title: "Please check your details",
        message: "Some fields still need attention.",
        action: "Fix the highlighted fields and accept the Terms of Use to continue.",
      });
      return;
    }
    setLoading(true);
    try {
      await registerStaylite(form);
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingTop: 24, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ marginBottom: 16 }}>
            <View
              style={{
                alignSelf: "flex-start",
                width: 48,
                height: 48,
                borderRadius: 16,
                backgroundColor: colors.surfaceAlt,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 8,
              }}
            >
              <Icon name="graduationCap" size={24} color={colors.brand} />
            </View>
            <Text style={[theme.typography.h2, { color: colors.textPrimary, marginBottom: 4 }]}>
              Staylite Registration
            </Text>
            <Text style={[theme.typography.body, { color: colors.textSecondary, lineHeight: 22 }]}>
              Enter your details. Your account will be provisional until an executive
              verifies your identity.
            </Text>
          </View>

          {error ? <ErrorBanner error={error} /> : null}

          <Input
            label="Full Name"
            placeholder="John Doe"
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
            label="Matric Number"
            placeholder="ENG/2020/12345"
            autoCapitalize="characters"
            value={form.matricNumber}
            onChangeText={(v) => update("matricNumber", v)}
            onBlur={() => onBlur("matricNumber")}
            error={fieldError("matricNumber")}
            valid={!fieldError("matricNumber")}
          />
          <Input
            label="Faculty"
            placeholder="Engineering"
            value={form.faculty}
            onChangeText={(v) => update("faculty", v)}
            onBlur={() => onBlur("faculty")}
            error={fieldError("faculty")}
            valid={!fieldError("faculty")}
          />
          <Input
            label="Department"
            placeholder="Computer Engineering"
            value={form.department}
            onChangeText={(v) => update("department", v)}
            onBlur={() => onBlur("department")}
            error={fieldError("department")}
            valid={!fieldError("department")}
          />
          <Input
            label="Level"
            placeholder="400"
            keyboardType="number-pad"
            value={form.level}
            onChangeText={(v) => update("level", v)}
            onBlur={() => onBlur("level")}
            error={fieldError("level")}
            valid={!fieldError("level")}
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

          <TermsCheckbox
            checked={termsAccepted}
            onToggle={() => {
              setTermsAccepted((v) => !v);
              setTermsError(false);
            }}
            error={termsError}
          />

          <Button
            title="Create Account"
            onPress={handleRegister}
            loading={loading}
            size="lg"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
