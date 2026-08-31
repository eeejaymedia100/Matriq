import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardScreen } from "../../components/KeyboardScreen";
import { Icon } from "../../components/icons";
import { api } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import { formatApiError } from "../../utils/errors";
import { DocumentCard } from "./DocumentCard";
import type { LibraryDiscovery, LibraryDoc } from "./types";

type Nav = { navigate: (s: string, p?: object) => void };

/**
 * The academic library ("Netflix for Students") — cross-institution discovery
 * of public study materials. Each horizontal row is a real backend section and
 * only renders when it has data. Tapping a card opens the details screen.
 */
export function LibraryScreen({ navigation }: { navigation: Nav }) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const { isAuthenticated } = useAuth();

  const [data, setData] = useState<LibraryDiscovery | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<{ title: string; message: string; action: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get<LibraryDiscovery>("/library/discovery");
      setData(d);
      setError(null);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated) return;
      void load();
    }, [load, isAuthenticated]),
  );

  const openDoc = (doc: LibraryDoc) =>
    navigation.navigate("LibraryDetail", {
      itemId: doc.id,
      title: doc.title,
      courseCode: doc.courseCode,
      continuePosition: doc.continuePosition ?? null,
      continueProgress: doc.continueProgress ?? null,
    });

  const section = (
    title: string,
    items: LibraryDoc[],
    itemAction: (d: LibraryDoc) => void = openDoc,
  ) => {
    if (!items || items.length === 0) return null;
    return (
      <View style={{ marginTop: 22 }}>
        <Text style={[theme.typography.h3, { color: colors.textPrimary, marginBottom: 12 }]}>
          {title}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {items.map((d) => (
            <DocumentCard key={d.id} doc={d} onPress={() => itemAction(d)} />
          ))}
        </ScrollView>
      </View>
    );
  };

  if (loading) {
    return (
      <KeyboardScreen edges={["top", "left", "right"]} padding={0} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 }}>
        <Text style={[theme.typography.display, { color: colors.textPrimary }]}>Library</Text>
        <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 2 }]}>
          Past questions &amp; materials from students across institutions.
        </Text>
        <View style={{ alignItems: "center", paddingVertical: 60 }}>
          <ActivityIndicator color={colors.brand} />
          <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 10 }]}>
            Curating your discovery feed…
          </Text>
        </View>
      </KeyboardScreen>
    );
  }

  return (
    <KeyboardScreen edges={["top", "left", "right"]} padding={0} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <Text style={[theme.typography.display, { color: colors.textPrimary }]}>Library</Text>
          <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 2 }]}>
            Discover study materials from institutions near you.
          </Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate("LibrarySearch", {})}
          style={{
            width: 44,
            height: 44,
            borderRadius: theme.radii.md,
            backgroundColor: colors.surface,
            borderWidth: 1.5,
            borderColor: colors.borderStrong,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="search" size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      {/* Search bar shortcut */}
      <Pressable
        onPress={() => navigation.navigate("LibrarySearch", {})}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          marginTop: 16,
          paddingVertical: 13,
          paddingHorizontal: 14,
          borderRadius: theme.radii.md,
          backgroundColor: colors.surface,
          borderWidth: 1.5,
          borderColor: colors.border,
        }}
      >
        <Icon name="search" size={18} color={colors.textMuted} />
        <Text style={[theme.typography.body, { color: colors.textMuted }]}>
          Search by title or course code — e.g. CHM 101
        </Text>
      </Pressable>

      {/* Saved shortcut */}
      <Pressable
        onPress={() => navigation.navigate("LibrarySaved", {})}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          marginTop: 10,
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderRadius: theme.radii.md,
          backgroundColor: colors.surfaceAlt,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Icon name="book" size={16} color={colors.brand} />
        <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>
          My saved library
        </Text>
        <Text style={[theme.typography.small, { color: colors.textMuted, flex: 1 }]}>
          {data?.saved.length ? `${data.saved.length} saved` : "Your bookmarks"}
        </Text>
        <Icon name="chevronRight" size={16} color={colors.textMuted} />
      </Pressable>

      {error ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 8,
            marginTop: 14,
            backgroundColor: colors.errorBg,
            borderRadius: 12,
            padding: 12,
            borderWidth: 1,
            borderColor: colors.error + "44",
          }}
        >
          <Icon name="alert" size={16} color={colors.error} />
          <View style={{ flex: 1 }}>
            <Text style={[theme.typography.captionBold, { color: colors.error }]}>{error.title}</Text>
            <Text style={[theme.typography.caption, { color: colors.textSecondary, marginTop: 2, lineHeight: 17 }]}>
              {error.message} {error.action}
            </Text>
          </View>
        </View>
      ) : null}

      {!data || emptyOf(data) ? (
        <View style={{ alignItems: "center", paddingVertical: 50 }}>
          <Icon name="book" size={40} color={colors.textMuted} />
          <Text style={[theme.typography.body, { color: colors.textMuted, marginTop: 14, textAlign: "center", maxWidth: 300, lineHeight: 22 }]}>
            The library is filling up. Upload the first past question or note for your courses to help other students.
          </Text>
          <Pressable
            onPress={() => navigation.navigate("VaultUpload", {})}
            style={{ marginTop: 16, paddingVertical: 10, paddingHorizontal: 18, borderRadius: theme.radii.pill, backgroundColor: colors.accent }}
          >
            <Text style={{ fontFamily: "PlusJakartaSans_700Bold", fontSize: 12, color: "#170B26" }}>
              Be the first to contribute
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* Continue Reading — resume where they left off */}
          {section("Continue reading", data!.continueReading)}

          {section("Recommended for you", data!.recommended)}

          {section("Popular this week", data!.trending)}

          {section("Popular all-time", data!.popular)}

          {data!["fromYourDepartment"]?.length ? section("From your department", data!["fromYourDepartment"]) : null}
          {data!["fromYourFaculty"]?.length ? section("From your faculty", data!["fromYourFaculty"]) : null}
          {data!["fromYourUniversity"]?.length ? section("From your university", data!["fromYourUniversity"]) : null}

          {section("Past questions", data!.pastQuestions)}

          {section("Lecture notes", data!.lectureNotes)}

          {section("Recently added", data!.recent)}

          <View style={{ marginTop: 24, flexDirection: "row", gap: 8 }}>
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.brand} />
            ) : (
              <Pressable
                onPress={() => {
                  setRefreshing(true);
                  void load();
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderRadius: theme.radii.pill,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Icon name="refresh" size={14} color={colors.textSecondary} />
                <Text style={[theme.typography.captionBold, { color: colors.textSecondary }]}>Refresh</Text>
              </Pressable>
            )}
          </View>
        </>
      )}
    </KeyboardScreen>
  );
}

function emptyOf(d: LibraryDiscovery): boolean {
  return (
    d.continueReading.length === 0 &&
    d.recommended.length === 0 &&
    d.popular.length === 0 &&
    d.trending.length === 0 &&
    d.recent.length === 0 &&
    d.fromYourUniversity.length === 0 &&
    d.fromYourFaculty.length === 0 &&
    d.fromYourDepartment.length === 0 &&
    d.pastQuestions.length === 0 &&
    d.lectureNotes.length === 0
  );
}
