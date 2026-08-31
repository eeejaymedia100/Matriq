import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardScreen } from "../../components/KeyboardScreen";
import { Icon } from "../../components/icons";
import { ConfirmSheet } from "../../components/ConfirmSheet";
import { api } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import { formatApiError } from "../../utils/errors";
import { bytesLabel } from "../../utils/files";
import {
  cacheVaultSearch,
  readCachedVaultSearch,
} from "../../utils/vaultCache";
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
  companionMimeType: string | null;
  moderationStatus: "pending" | "approved" | "rejected";
  rejectionReason: string | null;
  downloads: number;
  createdAt: string;
  level: string | null;
  session: string | null;
  institution: { id: string; name: string; shortCode: string } | null;
  submitter: { fullName: string; level: string } | null;
}

type Filter = "all" | "past_question" | "material";
type Tab = "community" | "mine";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "past_question", label: "Past questions" },
  { id: "material", label: "Materials" },
];

const LEVELS = ["", "100", "200", "300", "400", "500"] as const;

/**
 * The Vault — two clearly separated spaces:
 *  - Community library: PUBLIC resources from students at your school
 *    (approved by admins), searchable by course code / title / type / level.
 *    These are community contributions, not personal storage.
 *  - My uploads: everything you contributed — public items with their review
 *    status and private items only you can see.
 */
export function VaultScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const { isAuthenticated } = useAuth();

  const [tab, setTab] = useState<Tab>("community");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [levelFilter, setLevelFilter] = useState<string>("");
  const [items, setItems] = useState<VaultItemDto[]>([]);
  const [mine, setMine] = useState<VaultItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  /** True when the list is showing a saved copy because the network failed. */
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<{ title: string; message: string; action: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<VaultItemDto | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VaultItemDto | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stackNav = navigation.getParent() as
    | { navigate: (s: string, p?: object) => void }
    | undefined;

  const loadMine = useCallback(async () => {
    try {
      const data = await api.get<{ items: VaultItemDto[] }>("/me/vault");
      setMine(data.items);
    } catch {
      // My uploads are a secondary section — fail silently.
    }
  }, []);

  const runSearch = useCallback(
    async (q: string, type: Filter, level: string, showSpinner: boolean) => {
      if (showSpinner) setSearching(true);
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (type !== "all") params.set("type", type);
        if (level) params.set("level", level);
        const qs = params.toString();
        const data = await api.get<{ items: VaultItemDto[] }>(
          `/vault${qs ? `?${qs}` : ""}`,
        );
        setItems(data.items);
        setError(null);
        setOffline(false);
        // Save the latest list so the Vault still opens offline later.
        void cacheVaultSearch(data.items);
      } catch (err) {
        // Network / session failure — fall back to the saved copy instead of
        // stranding the student with an empty error page.
        const cached = await readCachedVaultSearch();
        if (cached && cached.length > 0) {
          setItems(cached as VaultItemDto[]);
          setOffline(true);
          setError(null);
        } else {
          setError(formatApiError(err));
        }
      } finally {
        setSearching(false);
        setLoading(false);
      }
    },
    [],
  );

  // Offline first-paint: show the last saved list instantly, then refresh.
  // The "offline" note only flips on when a network fetch actually fails.
  useEffect(() => {
    if (items.length > 0) return;
    void readCachedVaultSearch().then((cached) => {
      if (cached && cached.length > 0) {
        setItems(cached as VaultItemDto[]);
        setLoading(false);
      }
    });
  }, [items.length]);

  useFocusEffect(
    useCallback(() => {
      // Rely on the global auth lifecycle: when the session expired the app
      // is already redirecting — don't fire requests that would 401.
      if (!isAuthenticated) return;
      void loadMine();
      void runSearch("", "all", "", false);
    }, [loadMine, runSearch, isAuthenticated]),
  );

  // Debounced search as the student types (course-code first).
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void runSearch(query, filter, levelFilter, true);
    }, 400);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query, filter, levelFilter, runSearch]);

  const doRename = async () => {
    if (!renameTarget) return;
    const name = renameValue.trim();
    if (!name) {
      setRenameError("Enter a file name.");
      return;
    }
    setRenameBusy(true);
    setRenameError(null);
    try {
      const updated = await api.patch<VaultItemDto>(`/vault/${renameTarget.id}`, {
        originalName: name,
      });
      // Refresh both lists in place so the new name shows immediately.
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      setMine((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      setRenameTarget(null);
      setNote("File renamed.");
    } catch (err) {
      setRenameError(
        err instanceof Error
          ? err.message
          : "Couldn't rename the file — try again.",
      );
    } finally {
      setRenameBusy(false);
    }
  };

  const openRename = (item: VaultItemDto) => {
    setRenameTarget(item);
    setRenameValue(item.originalName || item.title);
    setRenameError(null);
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/vault/${deleteTarget.id}`);
      setMine((prev) => prev.filter((i) => i.id !== deleteTarget.id));
      setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
      setDeleteTarget(null);
      setNote("Upload deleted.");
    } catch (err) {
      setError(formatApiError(err));
      setDeleteTarget(null);
    } finally {
      setDeleteBusy(false);
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

  // Compact file-manager rows — filename + upload date up front; tapping a
  // row expands the actions. `own` enables rename/delete (owner only).
  const renderItem = (item: VaultItemDto, own = false) => {
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
                ) : (
                  <Icon name="globe" size={12} color={colors.brand} />
                )}
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
                {item.level ? ` · L${item.level}` : ""}
                {item.session ? ` · ${item.session}` : ""}
                {own && item.submitter ? ` · ${item.submitter.fullName}` : ""}
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
                onPress={() =>
                  stackNav?.navigate("DocumentReader", {
                    itemId: item.id,
                    originalName: item.originalName || item.title,
                    title: item.title,
                    courseCode: item.courseCode,
                    mimeType: item.mimeType,
                  })
                }
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 10,
                  borderRadius: theme.radii.md,
                  backgroundColor: colors.surfaceAlt,
                  borderWidth: 1.5,
                  borderColor: colors.borderStrong,
                }}
              >
                <Text style={[theme.typography.captionBold, { color: colors.textPrimary }]}>Read</Text>
              </Pressable>
              {own ? (
                <>
                  <Pressable
                    onPress={() => openRename(item)}
                    style={{
                      alignItems: "center",
                      justifyContent: "center",
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderRadius: theme.radii.md,
                      borderWidth: 1.5,
                      borderColor: colors.borderStrong,
                    }}
                  >
                    <Icon name="pen" size={16} color={colors.textPrimary} />
                  </Pressable>
                  <Pressable
                    onPress={() => setDeleteTarget(item)}
                    style={{
                      alignItems: "center",
                      justifyContent: "center",
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderRadius: theme.radii.md,
                      borderWidth: 1.5,
                      borderColor: colors.error + "66",
                    }}
                  >
                    <Icon name="trash" size={16} color={colors.error} />
                  </Pressable>
                </>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  const myPending = mine.filter((m) => m.moderationStatus !== "approved");

  return (
    <KeyboardScreen
      edges={["top", "left", "right"]}
      padding={0}
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 }}
    >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Text style={[theme.typography.display, { color: colors.textPrimary }]}>Vault</Text>
              <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 2 }]}>
                Your private files &amp; your school's public library.
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={() => stackNav?.navigate("Library")}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: theme.radii.pill,
                  backgroundColor: colors.surface,
                  borderWidth: 1.5,
                  borderColor: colors.borderStrong,
                }}
              >
                <Icon name="book" size={15} color={colors.textPrimary} />
                <Text style={{ fontFamily: "PlusJakartaSans_700Bold", fontSize: 12, color: colors.textPrimary }}>
                  Discover
                </Text>
              </Pressable>
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
          </View>

          {/* Community / My uploads tabs */}
          <View
            style={{
              flexDirection: "row",
              gap: 6,
              marginTop: 16,
              padding: 4,
              borderRadius: theme.radii.md,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            {(
              [
                { id: "community", label: "Community library", hint: "public resources" },
                { id: "mine", label: "My uploads", hint: "private + yours" },
              ] as const
            ).map((t) => (
              <Pressable
                key={t.id}
                onPress={() => setTab(t.id)}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 9,
                  borderRadius: theme.radii.md - 2,
                  backgroundColor: tab === t.id ? colors.accent : "transparent",
                }}
              >
                <Text
                  style={{
                    fontFamily: "PlusJakartaSans_700Bold",
                    fontSize: 12,
                    color: tab === t.id ? "#170B26" : colors.textPrimary,
                  }}
                >
                  {t.label}
                </Text>
                <Text
                  style={[
                    theme.typography.small,
                    { color: tab === t.id ? "#170B26" : colors.textMuted, marginTop: 1 },
                  ]}
                >
                  {t.hint}
                </Text>
              </Pressable>
            ))}
          </View>

          {tab === "community" ? (
            <>
              {/* Search — course code first */}
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

              {/* Level filter chips */}
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                {LEVELS.map((lvl) => (
                  <Pressable
                    key={lvl || "all"}
                    onPress={() => setLevelFilter(lvl)}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: theme.radii.pill,
                      backgroundColor: levelFilter === lvl ? colors.accent : colors.surfaceAlt,
                      borderWidth: 1,
                      borderColor: levelFilter === lvl ? "transparent" : colors.border,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "PlusJakartaSans_600SemiBold",
                        fontSize: 11,
                        color: levelFilter === lvl ? "#170B26" : colors.textSecondary,
                      }}
                    >
                      {lvl || "All levels"}
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

              {offline ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 14,
                    backgroundColor: colors.infoBg,
                    borderRadius: 12,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: colors.info + "44",
                  }}
                >
                  <Icon name="download" size={15} color={colors.info} />
                  <Text style={[theme.typography.caption, { color: colors.textSecondary, flex: 1 }]}>
                    Showing your saved copy — you're offline. Downloads you've made before still work.
                  </Text>
                </View>
              ) : null}

              {/* Results */}
              <Text style={[theme.typography.h3, { color: colors.textPrimary, marginTop: 24, marginBottom: 12 }]}>
                {loading ? "" : query.trim() ? `Results for “${query.trim()}”` : levelFilter ? `Level ${levelFilter} — latest` : "Latest"}
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
                    {query.trim() || levelFilter
                      ? `Nothing found — try another course code${levelFilter ? " or level" : ""}.`
                      : "The Community library is still filling up. Upload the first past question or note for your courses."}
                  </Text>
                  {!query.trim() && !levelFilter ? (
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

              <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 14, textAlign: "center", lineHeight: 18 }]}>
                Public resources are community contributions — shared by students at your school to help each other.
              </Text>
            </>
          ) : (
            <>
              {mine.length === 0 ? (
                <View style={{ alignItems: "center", paddingVertical: 36 }}>
                  <Icon name="upload" size={36} color={colors.textMuted} />
                  <Text style={[theme.typography.body, { color: colors.textMuted, marginTop: 12, textAlign: "center", maxWidth: 280, lineHeight: 22 }]}>
                    You haven't uploaded anything yet. Share a past question or keep a private file for yourself.
                  </Text>
                  <Pressable
                    onPress={() => stackNav?.navigate("VaultUpload")}
                    style={{ marginTop: 16, paddingVertical: 10, paddingHorizontal: 18, borderRadius: theme.radii.pill, backgroundColor: colors.accent }}
                  >
                    <Text style={{ fontFamily: "PlusJakartaSans_700Bold", fontSize: 12, color: "#170B26" }}>
                      Upload a file
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <Text style={[theme.typography.small, { color: colors.textMuted, marginBottom: 12, marginTop: 4 }]}>
                    Public uploads go live after a quick admin review. Private ones are only yours.
                  </Text>
                  {mine.map((item) => renderItem(item, true))}
                  {myPending.length === 0 ? (
                    <Text style={[theme.typography.small, { color: colors.textMuted, textAlign: "center", marginTop: 8 }]}>
                      All your uploads are live. Nice.
                    </Text>
                  ) : null}
                </>
              )}
            </>
          )}

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

      {/* Rename sheet — owner-only, keeps the file's real extension */}
      <ConfirmSheet
        visible={!!renameTarget}
        title="Rename file"
        body="The file keeps its format — just the name changes."
        confirmLabel={renameBusy ? "Saving…" : "Rename"}
        onConfirm={() => void doRename()}
        onClose={() => {
          if (!renameBusy) setRenameTarget(null);
        }}
      >
        <TextInput
          value={renameValue}
          onChangeText={(t) => {
            setRenameValue(t);
            setRenameError(null);
          }}
          autoFocus
          selectTextOnFocus
          placeholder="New file name"
          placeholderTextColor={colors.textMuted}
          style={{
            marginTop: 14,
            backgroundColor: colors.surfaceAlt,
            borderRadius: theme.radii.md,
            borderWidth: 1.5,
            borderColor: renameError ? colors.error : colors.borderStrong,
            color: colors.textPrimary,
            fontFamily: "PlusJakartaSans_400Regular",
            fontSize: 15,
            paddingHorizontal: 14,
            paddingVertical: 12,
          }}
        />
        <Text style={[theme.typography.small, { color: colors.textMuted, marginTop: 6 }]}>
          Tip: type just the name — ".pdf" (or your file's extension) is added automatically.
        </Text>
        {renameError ? (
          <Text style={[theme.typography.captionBold, { color: colors.error, marginTop: 8 }]}>
            {renameError}
          </Text>
        ) : null}
        {renameBusy ? (
          <View style={{ marginTop: 10 }}>
            <ActivityIndicator size="small" color={colors.brand} />
          </View>
        ) : null}
      </ConfirmSheet>

      {/* Delete sheet — owner only */}
      <ConfirmSheet
        visible={!!deleteTarget}
        title="Delete this upload?"
        body={`“${deleteTarget?.originalName || deleteTarget?.title || "this file"}” will be removed from the Vault. This can't be undone.`}
        confirmLabel={deleteBusy ? "Deleting…" : "Delete"}
        destructive
        onConfirm={() => void doDelete()}
        onClose={() => {
          if (!deleteBusy) setDeleteTarget(null);
        }}
      >
        {deleteBusy ? (
          <View style={{ marginTop: 12 }}>
            <ActivityIndicator size="small" color={colors.brand} />
          </View>
        ) : null}
      </ConfirmSheet>
    </KeyboardScreen>
  );
}
