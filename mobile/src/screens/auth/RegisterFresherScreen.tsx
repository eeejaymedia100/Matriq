import React, { useMemo, useState } from "react";
import { View, Text, Platform } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardScreen } from "../../components/KeyboardScreen";
import { Field, Button, ErrorBanner, PasswordStrength, TermsCheckbox, InstitutionCascadePicker } from "../../components";
import { useAuth, type FresherData } from "../../contexts/AuthContext";
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

const INSTITUTION_HINT =
  "Pick your school so your faculty association finds you automatically. Not listed? Just type your faculty and department below.";

/**
 * Validate everything, but only surface errors for fields the user has
 * engaged with (typed then cleared, or a failed submit). Showing live errors
 * for untouched fields painted the whole form red on arrival — noisy, and it
 * read as broken. Errors appear after blur or a submit attempt instead.
 */
function visibleErrors(
  live: Partial<Record<FieldKey, string>>,
  touched: Partial<Record<FieldKey, boolean>>,
): Partial<Record<FieldKey, string>> {
  const shown: Partial<Record<FieldKey, string>> = {};
  (Object.keys(live) as FieldKey[]).forEach((k) => {
    if (touched[k]) shown[k] = live[k];
  });
  return shown;
}

function validate(form: FresherData): Partial<Record<FieldKey, string>> {
  const e: Partial<Record<FieldKey, string>> = {};
  if (form.fullName.trim().length < 2) e.fullName = "Please enter your full name.";
  if (!isValidEmail(form.email)) e.email = "That email doesn't look right.";
  if (form.jambNumber.trim().length < 5)
    e.jambNumber = "Enter your JAMB registration number (e.g. 12345678AB).";
  if (!isRequired(form.faculty)) e.faculty = "Please enter your faculty.";
  if (!isRequired(form.department)) e.department = "Please enter your department.";
  if (!isStrongPassword(form.password))
    e.password = "Your password doesn't meet the requirements below.";
  return e;
}

export function RegisterFresherScreen({ navigation }: Props) {
  const { registerFresher } = useAuth();
  const { theme } = useTheme();
  const colors = theme.colors;

  const [form, setForm] = useState<FresherData>({
    email: "",
    password: "",
    fullName: "",
    jambNumber: "",
    institutionId: "",
    faculty: "",
    department: "",
    privacyPolicyVersion: "1.0",
    termsVersion: "1.0",
  });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsError, setTermsError] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);

  // Errors only for engaged fields — see visibleErrors above.
  const errors = useMemo(
    () => visibleErrors(validate(form), touched),
    [form, touched],
  );

  const update = (key: FieldKey, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    // Typing resumes → clear the field's error state; it gets re-evaluated on
    // blur (or submit). Red text while a value is still being typed is noise.
    if (value) setTouched((t) => ({ ...t, [key]: false }));
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
        jambNumber: true,
        faculty: true,
        department: true,
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
    <KeyboardScreen
      themed={false}
      paddingTop={8}
      paddingBottom={48}
      edges={["top", "bottom", "left", "right"]}
    >

          <View style={{ marginBottom: 16 }}>
            <Text style={[theme.typography.h2, { color: colors.textPrimary, marginBottom: 4 }]}>
              Fresher Registration
            </Text>
            <Text style={[theme.typography.body, { color: colors.textSecondary, lineHeight: 22 }]}>
              Welcome to Matriq! Fill in your details to get started.
            </Text>
          </View>

          {error ? <ErrorBanner error={error} /> : null}

          <Field
            label="Full Name"
            placeholder="e.g. Adaeze Okafor"
            autoCapitalize="words"
            value={form.fullName}
            onChangeText={(v) => update("fullName", v)}
            onBlur={() => onBlur("fullName")}
            error={fieldError("fullName")}
            valid={!fieldError("fullName")}
          />
          <Field
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
          <Field
            label="JAMB Registration Number"
            placeholder="12345678AB"
            autoCapitalize="characters"
            value={form.jambNumber}
            onChangeText={(v) => update("jambNumber", v)}
            onBlur={() => onBlur("jambNumber")}
            error={fieldError("jambNumber")}
            valid={!fieldError("jambNumber")}
          />
          <InstitutionCascadePicker
            institutionId={form.institutionId ?? ""}
            faculty={form.faculty}
            department={form.department}
            onChange={(institutionId, faculty, department) =>
              setForm((f) => ({ ...f, institutionId, faculty, department }))
            }
            hint={INSTITUTION_HINT}
          />
          <Field
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
    </KeyboardScreen>
  );
}
