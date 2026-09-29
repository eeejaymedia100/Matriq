import React from "react";
import { View, Text, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { Icon, type IconName } from "./icons";

/**
 * The one empty state for the whole app: a quiet glyph, one line of "what
 * lives here", and an optional action. No illustration, no decoration —
 * emptiness should feel intentional, not broken (Apple inset-grouped rhythm:
 * generous vertical air, everything centered, nothing shouting).
 *
 * Use for: empty lists ("No deadlines yet"), empty search results, empty
 * feeds. Not for errors (ErrorBanner) or loading (Skeleton/LoadingScreen).
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
  style,
}: {
  icon: IconName;
  title: string;
  body?: string;
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const colors = theme.colors;

  return (
    <View
      style={[
        { alignItems: "center", paddingVertical: 56, paddingHorizontal: 32 },
        style,
      ]}
    >
      <View style={{ marginBottom: 14, opacity: 0.55 }}>
        <Icon name={icon} size={26} color={colors.textMuted} />
      </View>
      <Text
        style={[
          theme.typography.h3,
          { color: colors.textPrimary, textAlign: "center" },
        ]}
      >
        {title}
      </Text>
      {body ? (
        <Text
          style={[
            theme.typography.caption,
            {
              color: colors.textMuted,
              textAlign: "center",
              marginTop: 6,
              maxWidth: 280,
              lineHeight: 19,
            },
          ]}
        >
          {body}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: 18 }}>{action}</View> : null}
    </View>
  );
}
