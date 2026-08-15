import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../../theme/ThemeContext";
import { ThemedScreen } from "../../components/Surface";
import { Icon } from "../../components/icons";
import { api } from "../../api/client";
import { formatApiError } from "../../utils/errors";
import { bytesLabel, saveGeneratedFile } from "../../utils/files";
import type { MainTabParamList } from "../../navigation/types";

type Props = BottomTabScreenProps<MainTabParamList, "Vault">;

export interface VaultItemDto {
  id: string;
  courseCode: string;
  title: string;
  type: "past_question" | "material";
  visibility: "public" | "private";
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  hasCompanion: boolean;
  companionSizeBytes: number | null;
  moderationStatus: "pending" | "approved" | "rejected";
  rejectionReason: string | null;
  downloads: number;
  createdAt: string;
  submitter: { fullName: string; level: string } | null;
}

type Filter = "all" | "past_question" | "material";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "past_question", label: "Past questions" },
  { id: "material", label: "Materials" },
];

/**
 * The Vault (spec §7) — the shared, cross-student academic database. Search
 * is course-code first; public uploads are scoped to the student's school
 * after admin approval, private ones are the owner's own. Smart storage:
 * items with a lighter companion offer a "Light" download for bad data.
 */
export function VaultScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const colors = theme.colors;

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<VaultItemDto[]>([]);
  const [mine, setMine] = useState<VaultItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<{ title: string; message: string; action: string } | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stackNav = navigation.getParent() as { navigate: (s: string) => void } | undefined;

  const loadMine = useCallback(async () => {
    try {
      const data = await api.get<{ items: VaultItemDto[] }>("/me/vault");
      setMine(data.items);
    } catch {
      // My uploads are a secondary section — fail silently.
    }
  }, []);

  const runSearch = useCallback(
    async (q: string, type: Filter, showSpinner: boolean) => {
      if (showSpinner) setSearching(true);
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (type !== "all") params.set("type", type);
        const qs = params.toString();
        const data = await api.get<{ items: VaultItemDto[] }>(
          `/vault${qs ? `?${qs}` : ""}`,
        );
        setItems(data.items);
        setError(null);
      } catch (err) {
        setError(formatApiError(err));
      } finally {
        setSearching(false);
        setLoading(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      void loadMine();
      void runSearch("", "all", false);
    }, [loadMine, runSearch]),
  );

  // Debounced search as the student types (course-code first).
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void runSearch(query, filter, true);
    }, 400);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query, filter, runSearch]);

  const download = async (item: VaultItemDto, variant: "original" | "light") => {
    if (downloadingId) return;
    setDownloadingId(item.id);
    setNote(null);
    try {
      const data = await api.get<{
        fileName: string;
        mimeType: string;
        dataUri: string;
        variant: "original" | "light";
      }>(`/vault/${item.id}/download?variant=${variant}`);
      const base64 = data.dataUri.includes(",")
        ? data.dataUri.split(",")[1]
        : data.dataUri;
      const result = await saveGeneratedFile(data.fileName, base64, data.mimeType);
      setNote(
        result.shared
          ? variant === "light"
            ? "Light copy saved — original stays safe on the Vault."
            : "Downloaded — the original file."
          : "Saved to Matriq's cache (no share sheet available).",
      );
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setDownloadingId(null);
    }
  };

  const statusChip = (item: VaultItemDto) => {
    if (item.moderationStatus === "pending") {
      return (
        <View
          style={{
            borderRadius: 999,
            paddingHorizontal: 8,
            paddingVertical: 3,
            backgroundColor: colors.warningBg,
          }}
        >
          <Text style={[theme.typography.small, { color: colors.warning, fontWeight: "700" }]}>
            Reviewing
          </Text>
        </View>
      );
    }
    if (item.moderationStatus === "rejected") {
      return (
        <View
          style={{
            borderRadius: 999,
            paddingHorizontal: 8,
            paddingVertical: 3,
            backgroundColor: colors.errorBg,
          }}
        >
          <Text style={[theme.typography.small, { color: colors.error, fontWeight: "700" }]}>
            Rejected
          </Text>
        </View>
      );
    }
    return null;
  };

  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Round-2 QA §6: compact file-manager rows — filename + upload date
  // up front; tapping a row expands the download actions.
  const renderItem = (item: VaultItemDto, showOwner = false) => {
    const expanded = expandedId === item.id;
    const uploadDate = new Date(item.createdAt).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    return (
      <View
        key={item.id}
        style={{
          borderRadius: theme.radii.md,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: expanded ? colors.brand + "66" : colors.border,
          marginBottom: 8,
          overflow: "hidden",
        }}
      >
        <Pressable onPress={() => setExpandedId(expanded ? null : item.id)}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingVertical: 12,
              paddingHorizontal: 14,
            }}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                backgroundColor: colors.surfaceAlt,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon
                name={item.type === "past_question" ? "layers" : "book"}
                size={18}
                color={colors.brand}
              />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View
                  style={{
                    borderRadius: 6,
                    paddingHorizontal: 7,
                    paddingVertical: 2,
                    backgroundColor: colors.brand + "1A",
                  }}
                >
                  <Text style={[theme.typography.small, { color: colors.brand, fontWeight: "700" }]}>
                    {item.courseCode}
                  </Text>
                </View>
                {item.visibility === "private" ? (
                  <Icon name="lock" size={12} color={colors.textMuted} />
                ) : null}
                {statusChip(item)}
              </View>
              {/* Filename first — this is a file-manager list now */}
              <Text
                style={[theme.typography.captionBold, { color: colors.textPrimary, marginTop: 4 }]}
                numberOfLines={1}
              >
                {item.originalName || item.title}
              </Text>
              <Text style={[theme.typography.small, { color: colors.textMuted, marginTop: 2 }]}>
                {uploadDate} · {bytesLabel(item.sizeBytes)}
                {item.downloads > 0 ? ` · ${item.downloads} dl` : ""}
                {showOwner && item.submitter
                  ? ` · ${item.submitter.fullName} (${item.submitter.level})`
                  : ""}
              </Text>
            </View>
            <Icon name="chevronDown" size={16} color={colors.textMuted} />
          </View>
        </Pressable>

        {expanded ? (
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: colors.border,
              padding: 12,
              gap: 8,
            }}
          >
            {item.moderationStatus === "rejected" && item.rejectionReason ? (
              <Text style={[theme.typography.small, { color: colors.error, lineHeight: 17 }]}>
                Reason: {item.rejectionReason}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={() => void download(item, "original")}
                disabled={downloadingId === item.id}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 10,
                  borderRadius: theme.radii.md,
                  backgroundColor: colors.accent,
                  borderWidth: theme.mode === "pop" ? 2 : 0,
                  borderColor: colors.borderStrong,
                }}
              >
                {downloadingId === item.id ? (
                  <ActivityIndicator size="small" color="#170B26" />
                ) : (
                  <Text style={{ fontFamily: "PlusJakartaSans_700Bold", fontSize: 12, color: "#170B26" }}>
                    Download
                  </Text>
                )}
              </Pressable>
              {item.hasCompanion ? (
                <Pressable
                  onPress={() => void download(item, "light")}
                  disabled={downloadingId === item.id}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    paddingVertical: 10,
                    borderRadius: theme.radii.md,
                    borderWidth: 1.5,
                    borderColor: colors.borderStrong,
                  }}
                >
                  <Text style={[theme.typography.captionBold, { color: colors.textPrimary }]}>
                    Light{item.companionSizeBytes ? ` (${bytesLabel(item.companionSizeBytes)})` : ""}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  const myPending = mine.filter((m) => m.moderationStatus !== "approved");

  return (
    <ThemedScreen>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Text style={[theme.typography.display, { color: colors.textPrimary }]}>Vault</Text>
              <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 2 }]}>
                Past questions &amp; materials from students like you.
              </Text>
            </View>
            <Pressable
              onPress={() => stackNav?.navigate("VaultUpload")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: theme.radii.pill,
                backgroundColor: colors.accent,
                borderWidth: theme.mode === "pop" ? 2 : 0,
                borderColor: colors.borderStrong,
              }}
            >
              <Icon name="plus" size={15} color="#170B26" />
              <Text style={{ fontFamily: "PlusJakartaSans_700Bold", fontSize: 12, color: "#170B26" }}>
                Upload
              </Text>
            </Pressable>
          </View>

          {/* Search — course code first */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: 18,
              borderWidth: 1.5,
              borderColor: colors.border,
              borderRadius: theme.radii.md,
              backgroundColor: colors.surface,
              paddingHorizontal: 14,
            }}
          >
            {searching ? (
              <ActivityIndicator size="small" color={colors.brand} />
            ) : (
              <Icon name="search" size={18} color={colors.textMuted} />
            )}
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by course code — e.g. CHM 101"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
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

          {/* Type filter chips */}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            {FILTERS.map((f) => (
              <Pressable
                key={f.id}
                onPress={() => setFilter(f.id)}
                style={{
                  paddingVertical: 7,
                  paddingHorizontal: 14,
                  borderRadius: theme.radii.pill,
                  backgroundColor: filter === f.id ? colors.accent : colors.surface,
                  borderWidth: 1,
                  borderColor: filter === f.id ? "transparent" : colors.border,
                }}
              >
                <Text
                  style={{
                    fontFamily: "PlusJakartaSans_600SemiBold",
                    fontSize: 12,
                    color: filter === f.id ? "#170B26" : colors.textPrimary,
                  }}
                >
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Error banner */}
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
                <Text style={[theme.typography.captionBold, { color: colors.error }]}>
                  {error.title}
                </Text>
                <Text style={[theme.typography.caption, { color: colors.textSecondary, marginTop: 2, lineHeight: 17 }]}>
                  {error.message} {error.action}
                </Text>
              </View>
            </View>
          ) : null}

          {note ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginTop: 14,
                backgroundColor: colors.successBg,
                borderRadius: 12,
                padding: 12,
                borderWidth: 1,
                borderColor: colors.success + "44",
              }}
            >
              <Icon name="check" size={15} color={colors.success} />
              <Text style={[theme.typography.caption, { color: colors.textSecondary, flex: 1 }]}>
                {note}
              </Text>
            </View>
          ) : null}

          {/* Results */}
          <Text style={[theme.typography.h3, { color: colors.textPrimary, marginTop: 24, marginBottom: 12 }]}>
            {loading ? "" : query.trim() ? `Results for “${query.trim()}”` : "Latest"}
          </Text>

          {loading ? (
            <View style={{ alignItems: "center", paddingVertical: 40 }}>
              <ActivityIndicator color={colors.brand} />
              <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 10 }]}>
                Opening the Vault…
              </Text>
            </View>
          ) : items.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 30 }}>
              <Icon name="vault" size={36} color={colors.textMuted} />
              <Text style={[theme.typography.body, { color: colors.textMuted, marginTop: 12, textAlign: "center", maxWidth: 280, lineHeight: 22 }]}>
                {query.trim()
                  ? `Nothing found for “${query.trim()}” — try another course code.`
                  : "The Vault is still filling up. Upload the first past question or note for your courses."}
              </Text>
              {!query.trim() ? (
                <Pressable
                  onPress={() => stackNav?.navigate("VaultUpload")}
                  style={{ marginTop: 16, paddingVertical: 10, paddingHorizontal: 18, borderRadius: theme.radii.pill, backgroundColor: colors.accent }}
                >
                  <Text style={{ fontFamily: "PlusJakartaSans_700Bold", fontSize: 12, color: "#170B26" }}>
                    Be the first to contribute
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            items.map((item) => renderItem(item))
          )}

          {/* My uploads */}
          {mine.length > 0 ? (
            <>
              <Text style={[theme.typography.h3, { color: colors.textPrimary, marginTop: 26, marginBottom: 4 }]}>
                My uploads
              </Text>
              <Text style={[theme.typography.small, { color: colors.textMuted, marginBottom: 12 }]}>
                Public uploads go live after a quick admin review.
              </Text>
              {mine.map((item) => renderItem(item, true))}
            </>
          ) : null}

          {myPending.length === 0 && mine.length > 0 ? (
            <Text style={[theme.typography.small, { color: colors.textMuted, textAlign: "center", marginTop: 8 }]}>
              All your uploads are live. Nice.
            </Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedScreen>
  );
}
