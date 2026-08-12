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
import { Ionicons } from "@expo/vector-icons";
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
              title={item.title}
              subtitle={`${item.author.role} · ${new Date(item.createdAt).toLocaleDateString()}`}
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
                    <Text style={styles.readCount}>
                      {item._count?.reads ?? 0} read
                    </Text>
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
  title: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.md },
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
