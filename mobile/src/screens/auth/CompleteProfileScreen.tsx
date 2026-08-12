import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, radii } from "../../theme/colors";
import { Button, ErrorBanner, WheelPicker } from "../../components";
import { useAuth } from "../../contexts/AuthContext";
import { formatApiError, type FriendlyError } from "../../utils/errors";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function daysInMonth(monthIndex: number, year: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

interface Props {
  navigation: { replace: (screen: string, params?: unknown) => void };
}

export function CompleteProfileScreen({ navigation }: Props) {
  const { updateProfile } = useAuth();
  const today = new Date();
  const [monthIndex, setMonthIndex] = useState(today.getMonth());
  const [dayIndex, setDayIndex] = useState(today.getDate() - 1);
  const [year, setYear] = useState(String(today.getFullYear()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);

  const yearNum = Number(year);
  const currentYear = today.getFullYear();
  const maxDay = Number.isFinite(yearNum)
    ? daysInMonth(monthIndex, yearNum)
    : 31;

  const days = Array.from({ length: maxDay }, (_, i) => String(i + 1));

  // Keep the picked day valid when the month/year changes the max days.
  const safeDayIndex = Math.min(dayIndex, maxDay - 1);

  const yearInvalid =
    year.length > 0 &&
    (!/^\d{4}$/.test(year) ||
      yearNum < 1900 ||
      yearNum > currentYear ||
      (yearNum === currentYear &&
        monthIndex > today.getMonth()));
  const yearEmpty = year.trim().length === 0;

  const validate = (): string | null => {
    if (yearEmpty || yearInvalid) {
      return `Please enter a valid year between 1900 and ${currentYear}.`;
    }
    const dob = new Date(yearNum, monthIndex, safeDayIndex + 1);
    if (dob.getTime() > Date.now()) {
      return "That date is in the future — please pick today or earlier.";
    }
    return null;
  };

  const formatPreview = () => {
    if (yearEmpty || yearInvalid) return "";
    return `${safeDayIndex + 1} ${MONTHS[monthIndex]} ${yearNum}`;
  };

  const handleSave = async () => {
    setError(null);
    const problem = validate();
    if (problem) {
      setError({
        title: "Please check the date",
        message: problem,
        action: "Adjust the day, month or year and try again.",
      });
      return;
    }
    setLoading(true);
    try {
      const iso = `${yearNum}-${String(monthIndex + 1).padStart(2, "0")}-${String(
        safeDayIndex + 1,
      ).padStart(2, "0")}`;
      await updateProfile({ dateOfBirth: iso });
      navigation.replace("Home");
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
              <Ionicons name="calendar-outline" size={28} color={colors.primary} />
            </View>
            <Text style={styles.title}>Almost done!</Text>
            <Text style={styles.subtitle}>
              One last thing — when is your birthday? Scroll to pick the day and
              month, then type the year.
            </Text>
          </View>

          {error ? <ErrorBanner error={error} /> : null}

          <View style={styles.pickers}>
            <View style={styles.pickerCol}>
              <Text style={styles.pickerLabel}>Day</Text>
              <WheelPicker
                data={days}
                selectedIndex={safeDayIndex}
                onChange={(i) => {
                  setDayIndex(i);
                  if (error) setError(null);
                }}
              />
            </View>
            <View style={styles.pickerCol}>
              <Text style={styles.pickerLabel}>Month</Text>
              <WheelPicker
                data={MONTHS}
                selectedIndex={monthIndex}
                onChange={(i) => {
                  setMonthIndex(i);
                  if (error) setError(null);
                }}
              />
            </View>
            <View style={styles.pickerCol}>
              <Text style={styles.pickerLabel}>Year</Text>
              <View
                style={[
                  styles.yearInputWrap,
                  yearInvalid && styles.yearInputError,
                ]}
              >
                <TextInput
                  style={styles.yearInput}
                  value={year}
                  onChangeText={(t) => {
                    setYear(t.replace(/[^0-9]/g, "").slice(0, 4));
                    if (error) setError(null);
                  }}
                  keyboardType="number-pad"
                  placeholder="2005"
                  placeholderTextColor={colors.textMuted}
                  maxLength={4}
                />
              </View>
              {yearInvalid ? (
                <Text style={styles.yearError}>
                  Enter a year from 1900 to {currentYear}.
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.preview}>
            <Ionicons name="gift-outline" size={18} color={colors.primary} />
            <Text style={styles.previewText}>
              {formatPreview() || "Select your date of birth"}
            </Text>
          </View>

          <Button
            title="Continue"
            onPress={handleSave}
            loading={loading}
            size="lg"
          />

          <Text style={styles.privacyNote}>
            Your date of birth is kept private and is never shown to other
            students.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.xxl },
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
  pickers: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  pickerCol: { flex: 1 },
  pickerLabel: {
    ...typography.captionBold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  yearInputWrap: {
    height: 220,
    marginTop: 0,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  yearInputError: { borderColor: colors.error },
  yearInput: {
    ...typography.body,
    fontSize: 17,
    color: colors.textPrimary,
    textAlign: "center",
    paddingVertical: spacing.md,
  },
  yearError: {
    ...typography.caption,
    color: colors.error,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  preview: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  previewText: { ...typography.bodyBold, color: colors.textPrimary },
  privacyNote: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.md,
  },
});
