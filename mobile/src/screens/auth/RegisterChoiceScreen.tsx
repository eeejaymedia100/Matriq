import React from "react";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../theme/ThemeContext";
import { Button } from "../../components";
import { Icon } from "../../components/icons";

interface RegisterChoiceProps {
  navigation: { navigate: (screen: string) => void; goBack: () => void };
}

export function RegisterChoiceScreen({ navigation }: RegisterChoiceProps) {
  const { theme } = useTheme();
  const colors = theme.colors;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, padding: 24, paddingTop: 48 }}>
        <Text style={[theme.typography.h1, { color: colors.textPrimary }]}>
          Create your account
        </Text>
        <Text
          style={[
            theme.typography.body,
            { color: colors.textSecondary, marginTop: 4, marginBottom: 32 },
          ]}
        >
          How would you like to register?
        </Text>

        <View style={{ gap: 8 }}>
          <View style={{ gap: 12 }}>
            <Button
              title="I'm a Staylite Student"
              onPress={() => navigation.navigate("RegisterStaylite")}
              variant="primary"
              size="lg"
            />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon name="graduationCap" size={14} color={colors.textMuted} />
              <Text style={[theme.typography.caption, { color: colors.textMuted, flex: 1 }]}>
                Have a matric number? Use it to verify your identity quickly.
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 16 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            <Text
              style={[
                theme.typography.caption,
                { color: colors.textMuted, marginHorizontal: 16 },
              ]}
            >
              or
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          </View>

          <View style={{ gap: 12 }}>
            <Button
              title="I'm a Fresher (New Student)"
              onPress={() => navigation.navigate("RegisterFresher")}
              variant="outline"
              size="lg"
            />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon name="zap" size={14} color={colors.textMuted} />
              <Text style={[theme.typography.caption, { color: colors.textMuted, flex: 1 }]}>
                Just got admitted? Register with your JAMB number.
              </Text>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
