import React, { useState, useMemo } from "react";
import { View, Text, TextInput, Platform, KeyboardAvoidingView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../theme/ThemeContext";
import { Button, ErrorBanner, WheelPicker } from "../../components";
import { Icon } from "../../components/icons";
import { useAuth } from "../../contexts/AuthContext";
import { formatApiError, type FriendlyError } from "../../utils/errors";

interface Props {
  navigation: { replace: (screen: string) => void };
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function daysInMonth(monthIndex: number): number {
  return new Date(2024, monthIndex + 1, 0).getDate();
}

function currentYear(): number {
  return new Date().getFullYear();
}

/** The "add a birthday" step: wheels for day + month, manual year input. */
export function CompleteProfileScreen({ navigation }: Props) {
  const { updateProfile } = useAuth();
  const { theme } = useTheme();
  const colors = theme.colors;

  const [dayIdx, setDayIdx] = useState(0);
  const [monthIdx, setMonthIdx] = useState(0);
  const [year, setYear] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [yearTouched, setYearTouched] = useState(false);

  const days = useMemo(() => {
    const n = daysInMonth(monthIdx);
    return Array.from({ length: n }, (_, i) => String(i + 1));
  }, [monthIdx]);

  const yearNum = parseInt(year, 10);
  const yearInvalid =
    yearTouched && (Number.isNaN(yearNum) || yearNum < 1900 || yearNum > currentYear());
  const preview = `${days[dayIdx] ?? "1"} ${MONTHS[monthIdx]} ${year || "____"}`;

  const handleSave = async () => {
    setError(null);
    if (Number.isNaN(yearNum) || yearNum < 1900 || yearNum > currentYear()) {
      setYearTouched(true);
      setError({
        title: "Check the year",
        message: "Please enter a valid year between 1900 and this year.",
        action: "Type your birth year and try again.",
      });
      return;
    }
    setLoading(true);
    try {
      const iso = `${yearNum}-${String(monthIdx + 1).padStart(2, "0")}-${String(dayIdx + 1).padStart(2, "0")}`;
      await updateProfile({ dateOfBirth: iso });
      navigation.replace("Home");
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
      <View style={{ flex: 1, padding: 24, paddingTop: 40 }}>
        <View style={{ alignItems: "center", marginBottom: 20 }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 18,
              backgroundColor: colors.surfaceAlt,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 12,
            }}
          >
            <Icon name="calendar" size={26} color={colors.brand} />
          </View>
          <Text style={[theme.typography.h2, { color: colors.textPrimary }]}>
            When were you born?
          </Text>
          <Text style={[theme.typography.body, { color: colors.textSecondary, textAlign: "center", marginTop: 4, lineHeight: 22 }]}>
            One last step before your dashboard.
          </Text>
        </View>

        {error ? <ErrorBanner error={error} /> : null}

        <View style={{ flexDirection: "row", gap: 12, justifyContent: "center" }}>
          <View style={{ flex: 1, maxWidth: 120 }}>
            <Text style={[theme.typography.captionBold, { color: colors.textSecondary, textAlign: "center", marginBottom: 6 }]}>
              Day
            </Text>
            <WheelPicker data={days} selectedIndex={dayIdx} onChange={setDayIdx} />
          </View>
          <View style={{ flex: 1, maxWidth: 160 }}>
            <Text style={[theme.typography.captionBold, { color: colors.textSecondary, textAlign: "center", marginBottom: 6 }]}>
              Month
            </Text>
            <WheelPicker data={MONTHS} selectedIndex={monthIdx} onChange={setMonthIdx} />
          </View>
        </View>

        <View style={{ marginTop: 20 }}>
          <Text style={[theme.typography.captionBold, { color: colors.textSecondary, marginBottom: 6 }]}>
            Year
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              borderWidth: 1.5,
              borderColor: yearInvalid ? colors.error : colors.border,
              borderRadius: theme.radii.md,
              backgroundColor: colors.surface,
              paddingHorizontal: 16,
            }}
          >
            <TextInput
              value={year}
              onChangeText={(t) => {
                setYear(t.replace(/[^0-9]/g, "").slice(0, 4));
                if (error) setError(null);
              }}
              onBlur={() => setYearTouched(true)}
              keyboardType="number-pad"
              placeholder="e.g. 2005"
              placeholderTextColor={colors.textMuted}
              maxLength={4}
              style={{
                flex: 1,
                fontFamily: theme.typography.body.fontFamily,
                fontSize: 16,
                color: colors.textPrimary,
                paddingVertical: 14,
              }}
            />
            <Icon name="pen" size={16} color={colors.textMuted} />
          </View>
          {yearInvalid ? (
            <Text style={[theme.typography.caption, { color: colors.error, marginTop: 4 }]}>
              Enter a year between 1900 and {currentYear()}.
            </Text>
          ) : null}
        </View>

        <View
          style={{
            alignItems: "center",
            marginTop: 20,
            paddingVertical: 10,
            borderRadius: theme.radii.md,
            backgroundColor: colors.surfaceAlt,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>{preview}</Text>
        </View>

        <View style={{ marginTop: 24 }}>
          <Button title="Continue" onPress={handleSave} loading={loading} size="lg" />
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginTop: 20,
            justifyContent: "center",
          }}
        >
          <Icon name="lock" size={14} color={colors.textMuted} />
          <Text style={[theme.typography.small, { color: colors.textMuted }]}>
            Only used for age checks — never shown publicly
            {Platform.OS === "web" ? "" : ""}.
          </Text>
        </View>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
