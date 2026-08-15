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
import { Icon, type IconName } from "../../components/icons";
import { api } from "../../api/client";
import { formatApiError } from "../../utils/errors";
import { useNotifications } from "../../contexts/NotificationsContext";
import type { AppNotification } from "../../types/api";
import type { MainStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<MainStackParamList, "Notifications">;

const TYPE_ICON: Record<AppNotification["type"], IconName> = {
  verification: "shield",
  payment: "wallet",
  dues: "wallet",
  announcement: "megaphone",
  broadcast: "globe",
  vault: "vault",
  timetable: "calendar",
  update: "download",
  general: "bell",
};

/** Only these deep links exist in the main stack — guard unknown targets. */
const VALID_LINKS = new Set([
  "VerificationStatus",
  "Fees",
  "Explore",
  "Vault",
  "Receipt",
  "Home",
  "Timetable",
]);

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

/**
 * The in-app notification feed (round-2 QA §9) — where the Home bell points.
 * Verification updates, payment receipts, new dues, announcements and
 * platform broadcasts all land here; nothing requires a second app.
 */
export function NotificationFeedScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const { unreadCount, refreshUnread, setUnread } = useNotifications();

  const [items, setItems] = useState<AppNotification[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<{ title: string; message: string; action: string } | null>(null);

  const load = useCallback(
    async (nextCursor?: string) => {
      try {
        const qs = nextCursor ? `?cursor=${encodeURIComponent(nextCursor)}` : "";
        const data = await api.get<{
          notifications: AppNotification[];
          pagination: { cursor: string | null; hasMore: boolean };
          unreadCount: number;
        }>(`/me/notifications${qs}`);
        setItems((prev) =>
          nextCursor ? [...prev, ...data.notifications] : data.notifications,
        );
        setCursor(data.pagination.cursor);
        setHasMore(data.pagination.hasMore);
        setUnread(data.unreadCount);
        setError(null);
      } catch (err) {
        setError(formatApiError(err));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [setUnread],
  );

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
      // Refresh the unread badge whenever the feed is open (e.g. after
      // tapping through to a linked screen and coming back).
      void refreshUnread();
    }, [load, refreshUnread]),
  );

  const markAllRead = async () => {
    try {
      await api.post<{ message: string }>("/me/notifications/read-all");
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch {
      // Non-fatal.
    }
  };

  const openItem = async (item: AppNotification) => {
    if (!item.read) {
      void api.post(`/me/notifications/${item.id}/read`).catch(() => {});
      setItems((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)),
      );
      setUnread(Math.max(0, unreadCount - 1));
    }
    if (item.link && VALID_LINKS.has(item.link)) {
      navigation.navigate(item.link as never);
    }
  };

  return (
    <ThemedScreen>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          onScroll={({ nativeEvent }) => {
            const nearBottom =
              nativeEvent.layoutMeasurement.height +
                nativeEvent.contentOffset.y >=
              nativeEvent.contentSize.height - 120;
            if (nearBottom && hasMore && !loadingMore && !loading) {
              setLoadingMore(true);
              void load(cursor ?? undefined);
            }
          }}
          scrollEventThrottle={200}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={[theme.typography.display, { color: colors.textPrimary }]}>
                Notifications
              </Text>
              <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 2 }]}>
                {unreadCount > 0
                  ? `${unreadCount} unread`
                  : "You're all caught up"}
              </Text>
            </View>
            {unreadCount > 0 ? (
              <Pressable
                onPress={() => void markAllRead()}
                style={{
                  paddingVertical: 9,
                  paddingHorizontal: 14,
                  borderRadius: theme.radii.pill,
                  borderWidth: 1.5,
                  borderColor: colors.borderStrong,
                }}
              >
                <Text style={[theme.typography.captionBold, { color: colors.textPrimary }]}>
                  Mark all read
                </Text>
              </Pressable>
            ) : null}
          </View>

          {error ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
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
              <View style={{ flex: 1 }}>
                <Text style={[theme.typography.captionBold, { color: colors.error }]}>
                  {error.title}
                </Text>
                <Text style={[theme.typography.caption, { color: colors.textSecondary, marginTop: 2, lineHeight: 17 }]}>
                  {error.message} {error.action}
                </Text>
              </View>
            </View>
          ) : null}

          {loading ? (
            <View style={{ alignItems: "center", paddingVertical: 48 }}>
              <ActivityIndicator color={colors.brand} />
              <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 10 }]}>
                Loading notifications…
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
                <Icon name="bell" size={28} color={colors.textMuted} />
              </View>
              <Text style={[theme.typography.body, { color: colors.textMuted, marginTop: 14, textAlign: "center", maxWidth: 280, lineHeight: 22 }]}>
                Nothing yet. Verification updates, payment receipts, new dues
                and announcements will show up here.
              </Text>
            </View>
          ) : (
            <View style={{ marginTop: 20, gap: 10 }}>
              {items.map((item) => {
                const icon = TYPE_ICON[item.type] ?? "bell";
                return (
                  <Pressable key={item.id} onPress={() => void openItem(item)}>
                    <View
                      style={{
                        flexDirection: "row",
                        gap: 12,
                        padding: 14,
                        borderRadius: theme.radii.lg,
                        backgroundColor: item.read ? colors.surface : colors.surfaceAlt,
                        borderWidth: 1,
                        borderColor: item.read ? colors.border : colors.brand + "44",
                      }}
                    >
                      <View
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 12,
                          backgroundColor: item.read ? colors.surfaceAlt : colors.surface,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Icon name={icon} size={18} color={item.read ? colors.textMuted : colors.brand} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text
                            style={[
                              theme.typography.bodyBold,
                              { color: colors.textPrimary, flexShrink: 1 },
                            ]}
                            numberOfLines={1}
                          >
                            {item.title}
                          </Text>
                          {!item.read ? (
                            <View
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: colors.accent,
                              }}
                            />
                          ) : null}
                        </View>
                        <Text
                          style={[
                            theme.typography.caption,
                            { color: colors.textSecondary, marginTop: 3, lineHeight: 18 },
                          ]}
                        >
                          {item.body}
                        </Text>
                        <Text style={[theme.typography.small, { color: colors.textMuted, marginTop: 5 }]}>
                          {timeAgo(item.createdAt)}
                        </Text>
                      </View>
                      {item.link && VALID_LINKS.has(item.link) ? (
                        <Icon name="chevronRight" size={16} color={colors.textMuted} />
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}

              {loadingMore ? (
                <ActivityIndicator color={colors.brand} style={{ marginVertical: 14 }} />
              ) : null}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedScreen>
  );
}
