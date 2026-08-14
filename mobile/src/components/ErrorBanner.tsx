import React from "react";
import { View, Text } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { Icon } from "./icons";
import type { FriendlyError } from "../utils/errors";

interface ErrorBannerProps {
  error: FriendlyError;
}

/**
 * Structured error banner. Shows what happened, why, and what to do next —
 * never raw HTTP codes or backend jargon (spec §12).
 */
export function ErrorBanner({ error }: ErrorBannerProps) {
  const { theme } = useTheme();
  const colors = theme.colors;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
        backgroundColor: colors.errorBg,
        borderRadius: theme.radii.md,
        borderWidth: 1,
        borderColor: colors.error + "44",
        padding: 16,
        marginBottom: 16,
      }}
    >
      <View style={{ paddingTop: 2 }}>
        <Icon name="alert" size={22} color={colors.error} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[theme.typography.captionBold, { color: colors.error }]}>
          {error.title}
        </Text>
        <Text
          style={[
            theme.typography.caption,
            { color: colors.textSecondary, lineHeight: 18 },
          ]}
        >
          {error.message}
        </Text>
        <Text
          style={[
            theme.typography.caption,
            {
              color: colors.error,
              fontWeight: "600",
              marginTop: 4,
              lineHeight: 18,
            },
          ]}
        >
          {error.action}
        </Text>
      </View>
    </View>
  );
}
