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
import { Card, Button, ListScreenSkeleton } from "../../components";
import { api } from "../../api/client";
import { useFocusEffect } from "@react-navigation/native";
import type { Event } from "../../types/api";

export function EventsScreen() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetch = useCallback(async () => {
    try {
      const data = await api.get<{ events: Event[] }>("/me/memberships");
      // Simplified - in production, fetch per association
      setEvents([]);
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

  const toggleRsvp = async (eventId: string, currentlyRsvp: boolean) => {
    try {
      await api.post(`/events/${eventId}/rsvp`, {});
      setEvents((prev) =>
        prev.map((e) =>
          e.id === eventId
            ? {
                ...e,
                rsvpByMe: !currentlyRsvp,
                rsvpCount: currentlyRsvp ? e.rsvpCount - 1 : e.rsvpCount + 1,
              }
            : e,
        ),
      );
    } catch {
      // ignore
    }
  };

  if (loading) return <ListScreenSkeleton rows={4} titleWidth={80} />;

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch(); }} />
        }
        ListHeaderComponent={
          <Text style={styles.title}>Events</Text>
        }
        ListEmptyComponent={
          <Card title="No events">
            <Text style={styles.emptyText}>No upcoming events. Check back later!</Text>
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
              <Text style={styles.count}>👥 {item.rsvpCount} attending</Text>
              <Button
                title={item.rsvpByMe ? "Going ✓" : "RSVP"}
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
  title: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.md },
  desc: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.md,
  },
  count: { ...typography.caption, color: colors.textMuted },
  emptyText: { ...typography.body, color: colors.textSecondary },
});
