import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, radii } from "../../theme/colors";
import { Card, Button, ListScreenSkeleton, ErrorBanner } from "../../components";
import { api } from "../../api/client";
import { useFocusEffect } from "@react-navigation/native";
import type { Event, Association } from "../../types/api";
import { formatApiError, type FriendlyError } from "../../utils/errors";

export function EventsScreen() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  // Events with an in-flight RSVP request (prevents double-taps).
  const pending = useRef<Set<string>>(new Set());

  const fetch = useCallback(async () => {
    try {
      const memberships = await api.get<{
        memberships: Array<{ association: Association }>;
      }>("/me/memberships");
      const assoc = memberships.memberships[0]?.association;
      if (!assoc) {
        setEvents([]);
        return;
      }
      const data = await api.get<{ events: Event[] }>(
        `/associations/${assoc.id}/events`,
      );
      setEvents(data.events);
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
   * Optimistic RSVP: flip the UI immediately, then reconcile with the server.
   * If the request fails the change is rolled back and a friendly error shows.
   */
  const toggleRsvp = async (eventId: string, currentlyRsvp: boolean) => {
    if (pending.current.has(eventId)) return;
    pending.current.add(eventId);
    setError(null);

    // 1. Optimistic update.
    setEvents((prev) =>
      prev.map((e) =>
        e.id === eventId
          ? {
              ...e,
              rsvpByMe: !currentlyRsvp,
              rsvpCount: currentlyRsvp
                ? Math.max(0, e.rsvpCount - 1)
                : e.rsvpCount + 1,
            }
          : e,
      ),
    );

    try {
      await api.post(`/events/${eventId}/rsvp`, {});
    } catch (err) {
      // 2. Rollback on failure.
      setEvents((prev) =>
        prev.map((e) =>
          e.id === eventId
            ? {
                ...e,
                rsvpByMe: currentlyRsvp,
                rsvpCount: currentlyRsvp
                  ? e.rsvpCount + 1
                  : Math.max(0, e.rsvpCount - 1),
              }
            : e,
        ),
      );
      setError(formatApiError(err));
    } finally {
      pending.current.delete(eventId);
    }
  };

  if (loading) return <ListScreenSkeleton rows={4} titleWidth={80} />;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom", "left", "right"]}>
      <FlatList
        data={events}
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
            <Text style={styles.title}>Events</Text>
            {error ? <ErrorBanner error={error} /> : null}
          </View>
        }
        ListEmptyComponent={
          <Card title="No events">
            <Text style={styles.emptyText}>
              No upcoming events. Check back later!
            </Text>
          </Card>
        }
        renderItem={({ item }) => (
          <Card
            title={item.title}
            subtitle={`${new Date(item.eventDate).toLocaleDateString()} · ${item.location}`}
          >
            <Text style={styles.desc} numberOfLines={2}>
              {item.description}
            </Text>
            <View style={styles.footer}>
              <View style={styles.countRow}>
                <Ionicons name="people-outline" size={14} color={colors.textMuted} />
                <Text style={styles.count}>{item.rsvpCount} attending</Text>
              </View>
              <Button
                title={item.rsvpByMe ? "Going" : "RSVP"}
                onPress={() => toggleRsvp(item.id, item.rsvpByMe)}
                variant={item.rsvpByMe ? "ghost" : "primary"}
                size="sm"
                fullWidth={false}
              />
            </View>
          </Card>
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
  desc: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.md,
  },
  count: { ...typography.caption, color: colors.textMuted },
  countRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  emptyText: { ...typography.body, color: colors.textSecondary },
});
