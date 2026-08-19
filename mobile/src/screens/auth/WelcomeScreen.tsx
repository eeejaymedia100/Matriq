import React from "react";
import { View, Text, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../theme/ThemeContext";
import { TAGLINE } from "../../theme/tokens";
import { Button } from "../../components";
import { Icon } from "../../components/icons";
import { TERMS_URL, PRIVACY_URL } from "../../constants/legal";

interface WelcomeScreenProps {
  navigation: { navigate: (screen: string) => void };
}

export function WelcomeScreen({ navigation }: WelcomeScreenProps) {
  const { theme } = useTheme();
  const colors = theme.colors;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          flex: 1,
          justifyContent: "space-between",
          padding: 24,
          paddingTop: 96,
          paddingBottom: 32,
        }}
      >
        <View style={{ alignItems: "center", gap: 16 }}>
          <View
            style={{
              width: 84,
              height: 84,
              borderRadius: 24,
              backgroundColor: colors.brand,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 8,
              boxShadow:
                theme.mode === "pop"
                  ? "4px 4px 0 #170B26"
                  : "0 0 60px rgba(123,75,196,0.4)",
            }}
          >
            <Text
              style={{
                fontSize: 38,
                fontFamily: "PlusJakartaSans_800ExtraBold",
                color: "#FFFFFF",
              }}
            >
              M
            </Text>
          </View>
          <Text
            style={[
              theme.typography.display,
              { color: colors.textPrimary, fontSize: 36 },
            ]}
          >
            Matriq
          </Text>
          <Text
            style={[
              theme.typography.body,
              { color: colors.textSecondary, textAlign: "center", lineHeight: 27 },
            ]}
          >
            Your student association,{"\n"}simplified.
          </Text>
        </View>

        <View style={{ gap: 14 }}>
          <Button
            title="Sign In"
            onPress={() => navigation.navigate("Login")}
            variant="primary"
            size="lg"
          />
          <Button
            title="Create Account"
            onPress={() => navigation.navigate("RegisterChoice")}
            variant="outline"
            size="lg"
          />
          <Text
            style={[
              theme.typography.small,
              {
                color: colors.textMuted,
                textAlign: "center",
                marginTop: 4,
                letterSpacing: 1,
                textTransform: "uppercase",
              },
            ]}
          >
            {TAGLINE}
          </Text>
        </View>

        <View style={{ alignItems: "center", paddingHorizontal: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Icon name="shield" size={14} color={colors.textMuted} />
            <Text style={[theme.typography.caption, { color: colors.textMuted }]}>
              By continuing, you agree to our{" "}
              <Text
                style={{ color: colors.brand, fontWeight: "600", textDecorationLine: "underline" }}
                onPress={() => Linking.openURL(TERMS_URL).catch(() => {})}
              >
                Terms & Conditions
              </Text>{" "}
              and{" "}
              <Text
                style={{ color: colors.brand, fontWeight: "600", textDecorationLine: "underline" }}
                onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}
              >
                Privacy Policy
              </Text>
              .
            </Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
