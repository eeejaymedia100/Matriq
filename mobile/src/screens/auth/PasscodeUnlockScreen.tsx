import React, { useRef, useState } from "react";
import { View, Text, SafeAreaView, Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useTheme } from "../../theme/ThemeContext";
import { ThemedScreen } from "../../components/Surface";
import { Icon } from "../../components/icons";
import { OtpInput } from "../../components";
import { useAuth } from "../../contexts/AuthContext";
import { getPasscode, markUnlocked, clearPasscode } from "../../utils/passcode";

/**
 * Returning-user passcode screen (spec §5). Shown when the app has been away
 * for 3+ hours. Per-box micro-feedback comes from OtpInput's scale pulse; a
 * wrong code triggers a shake + honest error with a clear next step.
 */
export function PasscodeUnlockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const { user, logout } = useAuth();

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const shakeX = useSharedValue(0);

  const firstName = user?.fullName?.split(" ")[0] ?? "there";

  const shake = () => {
    shakeX.value = withSequence(
      withTiming(-12, { duration: 60, easing: Easing.out(Easing.quad) }),
      withTiming(12, { duration: 80 }),
      withTiming(-8, { duration: 60 }),
      withTiming(8, { duration: 70 }),
      withTiming(0, { duration: 60 }),
    );
  };

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  /** Sign out + clear the (possibly forgotten) passcode so a fresh login
   *  leads to creating a new one. */
  const handleSignOut = async () => {
    await clearPasscode();
    await logout();
  };

  const handleComplete = async (value: string) => {
    const stored = await getPasscode();
    if (stored === value) {
      await markUnlocked();
      onUnlocked();
      return;
    }
    setAttempts((a) => a + 1);
    setError(
      attempts >= 2
        ? "That's not right — you can sign in with your password instead."
        : "That passcode doesn't match. Try again.",
    );
    setCode("");
    shake();
  };

  return (
    <ThemedScreen>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, padding: 24, justifyContent: "center" }}>
          <View style={{ alignItems: "center", marginBottom: 30 }}>
            <View
              style={{
                width: 78,
                height: 78,
                borderRadius: 999,
                backgroundColor: colors.surfaceAlt,
                borderWidth: 2,
                borderColor: colors.accent + "66",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 20,
              }}
            >
              <Text
                style={{
                  fontFamily: "PlusJakartaSans_800ExtraBold",
                  fontSize: 30,
                  color: colors.accent,
                }}
              >
                {(user?.fullName?.trim().charAt(0) ?? "S").toUpperCase()}
              </Text>
            </View>
            <Text style={[theme.typography.h1, { color: colors.textPrimary, textAlign: "center" }]}>
              Welcome back, {firstName}
            </Text>
            <Text
              style={[
                theme.typography.body,
                { color: colors.textSecondary, textAlign: "center", marginTop: 6, maxWidth: 300, lineHeight: 23 },
              ]}
            >
              Enter your passcode to pick up where you left off.
            </Text>
          </View>

          <Animated.View style={shakeStyle}>
            <OtpInput
              value={code}
              onChange={(v) => {
                setCode(v);
                if (error) setError(null);
              }}
              onComplete={(v) => void handleComplete(v)}
              error={!!error}
            />
          </Animated.View>

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

          <View style={{ marginTop: 28, alignItems: "center", gap: 14 }}>
            <Pressable onPress={() => void handleSignOut()}>
              <Text style={[theme.typography.bodyBold, { color: colors.brand }]}>
                Sign in with password instead
              </Text>
            </Pressable>
            <Text style={[theme.typography.caption, { color: colors.textMuted, textAlign: "center", maxWidth: 280 }]}>
              Forgot your passcode? Sign in with your password and it will be reset.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </ThemedScreen>
  );
}
