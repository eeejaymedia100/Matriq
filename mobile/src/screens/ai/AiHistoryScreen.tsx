import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTheme } from "../../theme/ThemeContext";
import { ThemedScreen } from "../../components/Surface";
import { Icon } from "../../components/icons";
import {
  deleteConversation,
  loadHistory,
  type Conversation,
} from "../../offline/history";
import type { MainStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<MainStackParamList, "AiHistory">;

function timeLabel(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

/**
 * Past AI conversations. Tapping one reopens it in the chat screen; swipe
 * isn't available, so a delete button sits on each row.
 */
export function AiHistoryScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const colors = theme.colors;

  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      setLoading(true);
      void loadHistory().then((list) => {
        if (!mounted) return;
        setItems(list);
        setLoading(false);
      });
      return () => {
        mounted = false;
      };
    }, []),
  );

  const open = (conv: Conversation) => {
    navigation.navigate("AiChat", { conversationId: conv.id });
  };

  const remove = async (id: string) => {
    setItems((prev) => prev.filter((c) => c.id !== id));
    await deleteConversation(id).catch(() => {});
  };

  return (
    <ThemedScreen>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[theme.typography.display, { color: colors.textPrimary }]}>
            Chat history
          </Text>
          <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 2 }]}>
            Past conversations with the offline AI.
          </Text>

          {loading ? (
            <View style={{ alignItems: "center", paddingVertical: 48 }}>
              <ActivityIndicator color={colors.brand} />
              <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 10 }]}>
                Loading history…
              </Text>
            </View>
          ) : items.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 40 }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 20,
                  backgroundColor: colors.surfaceAlt,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="clock" size={28} color={colors.textMuted} />
              </View>
              <Text
                style={[
                  theme.typography.body,
                  { color: colors.textMuted, marginTop: 14, textAlign: "center", maxWidth: 280, lineHeight: 22 },
                ]}
              >
                No conversations yet. Ask the AI a question and it'll show up
                here so you can come back to it.
              </Text>
            </View>
          ) : (
            <View style={{ marginTop: 20, gap: 10 }}>
              {items.map((conv) => (
                <View
                  key={conv.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    borderRadius: theme.radii.lg,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: 6,
                  }}
                >
                  <Pressable
                    onPress={() => open(conv)}
                    style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12, padding: 8 }}
                  >
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 12,
                        backgroundColor: colors.surfaceAlt,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon name="sparkle" size={17} color={colors.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[theme.typography.bodyBold, { color: colors.textPrimary }]}
                        numberOfLines={1}
                      >
                        {conv.title}
                      </Text>
                      <Text style={[theme.typography.small, { color: colors.textMuted, marginTop: 2 }]}>
                        {conv.messages.filter((m) => m.role === "user").length} questions ·{" "}
                        {timeLabel(conv.updatedAt)}
                      </Text>
                    </View>
                    <Icon name="chevronRight" size={16} color={colors.textMuted} />
                  </Pressable>
                  <Pressable
                    onPress={() => void remove(conv.id)}
                    hitSlop={8}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="trash" size={16} color={colors.error} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedScreen>
  );
}
