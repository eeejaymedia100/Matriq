import React from "react";
import { View, Text, Pressable, Linking } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { Icon } from "./icons";
import { TERMS_URL, PRIVACY_URL } from "../constants/legal";

interface TermsCheckboxProps {
  checked: boolean;
  onToggle: () => void;
  error?: boolean;
}

/**
 * The required Terms of Use checkbox shown on registration (spec §4, §14).
 * Tapping the box toggles; tapping the legal names opens the hosted pages.
 */
export function TermsCheckbox({ checked, onToggle, error }: TermsCheckboxProps) {
  const { theme } = useTheme();
  const colors = theme.colors;

  return (
    <View style={{ marginBottom: 16 }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}
      >
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            borderWidth: 2,
            borderColor: error
              ? colors.error
              : checked
                ? colors.accent
                : colors.borderStrong,
            backgroundColor: checked ? colors.accent : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {checked ? (
            <Icon name="check" size={17} color="#170B26" strokeWidth={3} />
          ) : null}
        </View>
        <Text
          style={[
            theme.typography.caption,
            { color: colors.textSecondary, flex: 1, lineHeight: 20 },
          ]}
        >
          I agree to the{" "}
          <Text
            style={{ color: colors.brand, fontWeight: "600", textDecorationLine: "underline" }}
            onPress={() => Linking.openURL(TERMS_URL).catch(() => {})}
          >
            Terms of Use
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
      </Pressable>
      {error ? (
        <Text style={[theme.typography.caption, { color: colors.error, marginTop: 4, marginLeft: 36 }]}>
          Please accept the Terms of Use to continue.
        </Text>
      ) : null}
    </View>
  );
}
