import React from "react";
import { View, Text, Pressable } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { Surface } from "./Surface";
import { GameBadge } from "./GameBadge";
import { Icon } from "./icons";
import { useAchievements } from "../hooks/useAchievements";

/**
 * Compact Home achievements preview (UI direction: Home answers \"what
 * progress have I made\"). Shows the three most recently earned badges as
 * mini game badges + the earned count; tapping opens the full Board.
 */
export function AchievementsPreview({
  onPress,
}: {
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const { board } = useAchievements();

  if (!board || board.earnedCount === 0) return null;

  const earned = board.achievements.filter((a) => a.earned);
  const recent = earned.slice(-3);

  return (
    <View style={{ paddingHorizontal: 24, marginTop: 8 }}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Achievements, ${board.earnedCount} earned`}>
        <Surface
          variant="sticker"
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginBottom: 0,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {recent.map((a, i) => (
              <View key={a.id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                <GameBadge rarity={a.rarity} icon={a.icon as never} earned size="sm" />
              </View>
            ))}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[theme.typography.captionBold, { color: colors.textPrimary }]}>
              {board.earnedCount} achievement{board.earnedCount === 1 ? "" : "s"}
            </Text>
            <Text style={[theme.typography.small, { color: colors.textMuted }]}>
              {board.achievements.length - board.earnedCount} more to unlock
            </Text>
          </View>
          <Icon name="chevronRight" size={16} color={colors.textMuted} />
        </Surface>
      </Pressable>
    </View>
  );
}