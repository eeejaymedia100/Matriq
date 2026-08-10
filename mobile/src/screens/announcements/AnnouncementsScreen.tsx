import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { colors, spacing, typography, radii } from "../../theme/colors";
import { Card, ListScreenSkeleton } from "../../components";
import { api } from "../../api/client";
import { useFocusEffect } from "@react-navigation/native";
import type { Announcement } from "../../types/api";

export function AnnouncementsScreen() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetch = useCallback(async () => {
    try {
      // Use first association ID or fetch all
      const data = await api.get<{ announcements: Announcement[] }>(
        "/me/memberships",
      );
      // Simplified - in production, get announcements per association
      setAnnouncements([]);
    } catch {
      // ignore
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

  if (loading) return <ListScreenSkeleton rows={5} titleWidth={185} />;

  const markAsRead = async (id: string) => {
    try {
      await api.post(`/announcements/${id}/read`, {});
    } catch {
      // ignore
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={announcements}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch(); }} />
        }
        ListHeaderComponent={
          <Text style={styles.title}>Announcements</Text>
        }
        ListEmptyComponent={
          <Card title="No announcements yet">
            <Text style={styles.emptyText}>
              When your association publishes announcements, they'll appear here.
            </Text>
          </Card>
        }
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => markAsRead(item.id)}>
            <Card
              title={item.pinned ? `📌 ${item.title}` : item.title}
              subtitle={`${item.author.role} · ${new Date(item.createdAt).toLocaleDateString()}`}
            >
              <Text style={styles.body} numberOfLines={3}>
                {item.body}
              </Text>
              <View style={styles.footer}>
                <Text style={styles.readCount}>
                  👁 {item._count?.reads ?? 0} read
                </Text>
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
  title: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.md },
  body: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  readCount: { ...typography.caption, color: colors.textMuted },
  unreadBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  unreadText: { ...typography.small, color: colors.textOnPrimary },
  emptyText: { ...typography.body, color: colors.textSecondary },
});
