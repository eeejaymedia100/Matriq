import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardScreen } from "../../components/KeyboardScreen";
import { Icon } from "../../components/icons";
import { api } from "../../api/client";
import { formatApiError } from "../../utils/errors";
import { DocumentCard } from "./DocumentCard";
import type { LibrarySearchResult, LibraryDoc } from "./types";

const LEVELS = ["", "100", "200", "300", "400", "500"] as const;
const TYPES = [
  { id: "", label: "All" },
  { id: "past_question", label: "Past questions" },
  { id: "material", label: "Materials" },
] as const;

/**
 * Backend search + filters (the library is never downloaded to the phone —
 * every keystroke queries the API). Search by title / course, filter by
 * level / session / type, and load more via pagination.
 */
export function LibrarySearchScreen({
  navigation,
  route,
}: {
  navigation: { navigate: (s: string, p?: object) => void };
  // Optional seed query, e.g. a course code tapped from a breadcrumb trail.
  route: { params?: { q?: string } };
}) {
  const { theme } = useTheme();
  const colors = theme.colors;

  const [query, setQuery] = useState(route?.params?.q ?? "");
  const [type, setType] = useState<"past_question" | "material" | "">("");
  const [level, setLevel] = useState("");
  const [session, setSession] = useState("");
  const [result, setResult] = useState<LibrarySearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<{ title: string; message: string; action: string } | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(
    async (page: number) => {
      if (page === 1) setLoading(true);
      else setLoadingMore(true);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        if (type) params.set("type", type);
        if (level) params.set("level", level);
        if (session.trim()) params.set("session", session.trim());
        params.set("page", String(page));
        params.set("pageSize", "20");
        const d = await api.get<LibrarySearchResult>(`/library/search?${params.toString()}`);
        setResult((prev) =>
          page === 1
            ? d
            : {
                ...d,
                items: [...(prev?.items ?? []), ...d.items],
              },
        );
        setError(null);
      } catch (err) {
        setError(formatApiError(err));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [query, type, level, session],
  );

  // Debounced first-page search as filters change.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(1), 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, type, level, session, run]);

  const openDoc = (doc: LibraryDoc) =>
    navigation.navigate("LibraryDetail", {
      itemId: doc.id,
      title: doc.title,
      courseCode: doc.courseCode,
    });

  return (
    <KeyboardScreen paddingBottom={40}>
      <Text style={[theme.typography.display, { color: colors.textPrimary }]}>Search the library</Text>
      <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 2 }]}>
        Past questions &amp; materials across institutions.
      </Text>

      {/* Search */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginTop: 16,
          borderWidth: 1.5,
          borderColor: colors.border,
          borderRadius: theme.radii.md,
          backgroundColor: colors.surface,
          paddingHorizontal: 14,
        }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.brand} />
        ) : (
          <Icon name="search" size={18} color={colors.textMuted} />
        )}
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Title or course code — e.g. CHM 101"
          placeholderTextColor={colors.textMuted}
          style={{
            flex: 1,
            fontFamily: theme.typography.body.fontFamily,
            fontSize: 15,
            color: colors.textPrimary,
            paddingVertical: 13,
            paddingLeft: 10,
          }}
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery("")} hitSlop={10}>
            <Icon name="x" size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {/* Session filter */}
      <TextInput
        value={session}
        onChangeText={setSession}
        placeholder="Session filter (e.g. 2023/2024)"
        placeholderTextColor={colors.textMuted}
        style={{
          marginTop: 10,
          backgroundColor: colors.surface,
          borderRadius: theme.radii.md,
          borderWidth: 1.5,
          borderColor: colors.border,
          color: colors.textPrimary,
          fontFamily: theme.typography.body.fontFamily,
          fontSize: 15,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      />

      {/* Type chips */}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        {TYPES.map((t) => (
          <Pressable
            key={t.id || "all"}
            onPress={() => setType(t.id as any)}
            style={{
              paddingVertical: 7,
              paddingHorizontal: 14,
              borderRadius: theme.radii.pill,
              backgroundColor: type === t.id ? colors.accent : colors.surface,
              borderWidth: 1,
              borderColor: type === t.id ? "transparent" : colors.border,
            }}
          >
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: type === t.id ? "#17181A" : colors.textPrimary }}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Level chips */}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
        {LEVELS.map((lvl) => (
          <Pressable
            key={lvl || "all"}
            onPress={() => setLevel(lvl)}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: theme.radii.pill,
              backgroundColor: level === lvl ? colors.accent : colors.surfaceAlt,
              borderWidth: 1,
              borderColor: level === lvl ? "transparent" : colors.border,
            }}
          >
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: level === lvl ? "#17181A" : colors.textSecondary }}>
              {lvl || "All levels"}
            </Text>
          </Pressable>
        ))}
      </View>

      {error ? (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 14, backgroundColor: colors.errorBg, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.error + "44" }}>
          <Icon name="alert" size={16} color={colors.error} />
          <View style={{ flex: 1 }}>
            <Text style={[theme.typography.captionBold, { color: colors.error }]}>{error.title}</Text>
            <Text style={[theme.typography.caption, { color: colors.textSecondary, marginTop: 2, lineHeight: 17 }]}>{error.message} {error.action}</Text>
          </View>
        </View>
      ) : null}

      {/* Results */}
      <Text style={[theme.typography.h3, { color: colors.textPrimary, marginTop: 20, marginBottom: 12 }]}>
        {result?.total ? `${result.total} result${result.total === 1 ? "" : "s"}` : "Results"}
      </Text>

      {loading ? (
        <View style={{ alignItems: "center", paddingVertical: 40 }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : !result || result.items.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: 40 }}>
          <Icon name="search" size={32} color={colors.textMuted} />
          <Text style={[theme.typography.body, { color: colors.textMuted, marginTop: 12, textAlign: "center", maxWidth: 280, lineHeight: 22 }]}>
            {query.trim() || type || level
              ? "Nothing matched — try different words or filters."
              : "Search the community library for past questions and materials."}
          </Text>
        </View>
      ) : (
        <>
          {result.items.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {result.items.map((doc) => (
                <DocumentCard key={doc.id} doc={doc} onPress={() => openDoc(doc)} />
              ))}
            </View>
          ) : null}
          {result.hasMore ? (
            <Pressable
              onPress={() => void run((result.page ?? 1) + 1)}
              style={{ marginTop: 16, alignItems: "center", paddingVertical: 12, borderRadius: theme.radii.md, borderWidth: 1.5, borderColor: colors.borderStrong }}
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color={colors.brand} />
              ) : (
                <Text style={[theme.typography.captionBold, { color: colors.textPrimary }]}>Load more</Text>
              )}
            </Pressable>
          ) : null}
        </>
      )}
    </KeyboardScreen>
  );
}