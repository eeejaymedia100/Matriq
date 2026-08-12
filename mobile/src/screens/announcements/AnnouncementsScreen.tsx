import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, radii } from "../../theme/colors";
import { Card, ListScreenSkeleton, ErrorBanner } from "../../components";
import { api } from "../../api/client";
import { useFocusEffect } from "@react-navigation/native";
import type { Announcement, Association } from "../../types/api";
import { formatApiError, type FriendlyError } from "../../utils/errors";

export function AnnouncementsScreen() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const pending = useRef<Set<string>>(new Set());

  const fetch = useCallback(async () => {
    try {
      const memberships = await api.get<{
        memberships: Array<{ association: Association }>;
      }>("/me/memberships");
      const assoc = memberships.memberships[0]?.association;
      if (!assoc) {
        setAnnouncements([]);
        return;
      }
      const data = await api.get<{ announcements: Announcement[] }>(
        `/associations/${assoc.id}/announcements`,
      );
      setAnnouncements(data.announcements);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetch();
    }, [fetch]),
  );

  /**
   * Optimistic mark-as-read: the "New" badge disappears and the read count
   * ticks up instantly; rolled back if the request fails.
   */
  const markAsRead = async (id: string, currentlyRead: boolean) => {
    if (currentlyRead || pending.current.has(id)) return;
    pending.current.add(id);

    setAnnouncements((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, readByMe: true, readCount: a.readCount + 1 }
          : a,
      ),
    );

    try {
      await api.post(`/announcements/${id}/read`, {});
    } catch (err) {
      setAnnouncements((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, readByMe: false, readCount: Math.max(0, a.readCount - 1) }
            : a,
        ),
      );
      setError(formatApiError(err));
    } finally {
      pending.current.delete(id);
    }
  };

  if (loading) return <ListScreenSkeleton rows={5} titleWidth={185} />;

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={announcements}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetch();
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Announcements</Text>
            {error ? <ErrorBanner error={error} /> : null}
          </View>
        }
        ListEmptyComponent={
          <Card title="No announcements yet">
            <Text style={styles.emptyText}>
              When your association publishes announcements, they'll appear here.
            </Text>
          </Card>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => markAsRead(item.id, !!item.readByMe)}
          >
            <Card
              title={item.title}
              subtitle={`${item.author.name} · ${item.author.role} · ${new Date(
                item.createdAt,
              ).toLocaleDateString()}`}
            >
              <Text style={styles.body} numberOfLines={3}>
                {item.body}
              </Text>
              <View style={styles.footer}>
                <View style={styles.footerLeft}>
                  {item.pinned && (
                    <View style={styles.pinBadge}>
                      <Ionicons name="pin" size={11} color={colors.primary} />
                      <Text style={styles.pinText}>Pinned</Text>
                    </View>
                  )}
                  <View style={styles.readRow}>
                    <Ionicons name="eye-outline" size={14} color={colors.textMuted} />
                    <Text style={styles.readCount}>{item.readCount} read</Text>
                  </View>
                </View>
                {!item.readByMe && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>New</Text>
                  </View>
                )}
              </View>
            </Card>
          </TouchableOpacity>
        )}
        ListFooterComponent={<View style={{ height: spacing.xxl }} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg },
  header: { marginBottom: spacing.md },
  title: { ...typography.h2, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  footerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  readCount: { ...typography.caption, color: colors.textMuted },
  readRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  pinBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primaryLight + "22",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  pinText: { ...typography.small, color: colors.primary, fontWeight: "600" },
  unreadBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  unreadText: { ...typography.small, color: colors.textOnPrimary },
  emptyText: { ...typography.body, color: colors.textSecondary },
});
