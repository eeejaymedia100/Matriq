import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardScreen } from "../../components/KeyboardScreen";
import { Surface } from "../../components/Surface";
import { Icon } from "../../components/icons";
import { ConfirmSheet } from "../../components/ConfirmSheet";
import { api } from "../../api/client";
import { formatApiError } from "../../utils/errors";
import { bytesLabel } from "../../utils/files";
import { DocumentCard } from "./DocumentCard";
import type { LibraryDetail, LibraryReportReason } from "./types";

const REPORT_REASONS: LibraryReportReason[] = [
  { id: "inappropriate", label: "Inappropriate content" },
  { id: "irrelevant", label: "Not relevant to the course" },
  { id: "duplicate", label: "Duplicate of another resource" },
  { id: "incorrectly_categorized", label: "Wrong course / wrong category" },
];

/**
 * Document details + related materials. From here a student can open the
 * in-app reader (== records a view + reading progress), bookmark the document,
 * or flag it for moderation.
 */
export function LibraryDetailScreen({
  navigation,
  route,
}: {
  navigation: {
    navigate: (s: string, p?: object) => void;
  };
  route: {
    params: {
      itemId: string;
      title: string;
      courseCode: string;
      continuePosition?: string | null;
      continueProgress?: number | null;
    };
  };
}) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const { itemId, continuePosition, continueProgress } = route.params;

  const [detail, setDetail] = useState<LibraryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ title: string; message: string; action: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [reportDone, setReportDone] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportBusy, setReportBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.get<LibraryDetail>(`/library/${itemId}`);
      setDetail(d);
      setError(null);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reading = record a view + save the resume marker, then open the reader.
  const openReader = async () => {
    const doc = detail?.item;
    if (!doc) return;
    await api
      .post(`/library/${itemId}/view`, {
        position: continuePosition ?? "new",
        progress: continueProgress ?? 0,
      })
      .catch(() => undefined);
    navigation.navigate("DocumentReader", {
      itemId,
      originalName: `${doc.courseCode}.pdf`,
      title: doc.title,
      courseCode: doc.courseCode,
      mimeType: doc.mimeType,
    });
  };

  const toggleSave = async () => {
    setSaveBusy(true);
    try {
      if (saved) {
        await api.delete(`/library/${itemId}/save`);
        setSaved(false);
      } else {
        await api.post(`/library/${itemId}/save`, {});
        setSaved(true);
      }
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSaveBusy(false);
    }
  };

  const submitReport = async () => {
    if (!reportReason) {
      setReportError("Select a reason.");
      return;
    }
    setReportBusy(true);
    setReportError(null);
    try {
      await api.post(`/library/${itemId}/report`, {
        reason: reportReason,
        details: "",
      });
      setReportDone(true);
      setReportOpen(false);
    } catch (err) {
      setReportError(
        err instanceof Error ? err.message : "Couldn't submit the report.",
      );
    } finally {
      setReportBusy(false);
    }
  };

  if (loading) {
    return (
      <KeyboardScreen>
        <View style={{ alignItems: "center", paddingVertical: 60 }}>
          <ActivityIndicator color={colors.brand} />
          <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 10 }]}>
            Opening document…
          </Text>
        </View>
      </KeyboardScreen>
    );
  }

  if (error || !detail?.item) {
    return (
      <KeyboardScreen>
        <View style={{ alignItems: "center", paddingVertical: 50 }}>
          <Icon name="alert" size={34} color={colors.error} />
          <Text style={[theme.typography.body, { color: colors.textMuted, marginTop: 12, textAlign: "center", maxWidth: 300 }]}>
            {error?.message ?? "This document isn't available."}
          </Text>
        </View>
      </KeyboardScreen>
    );
  }

  const doc = detail.item;

  return (
    <KeyboardScreen paddingBottom={40}>
      {/* Breadcrumb trail: Discover › Course code › Title — only on the
          discovery hierarchy, where it genuinely helps students retrace
          their path to a document. */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 5,
          marginBottom: 10,
        }}
      >
        <Pressable onPress={() => navigation.navigate("Library", {})} hitSlop={8}>
          <Text style={[theme.typography.captionBold, { color: colors.brand }]}>Discover</Text>
        </Pressable>
        <Text style={[theme.typography.caption, { color: colors.textMuted }]} aria-hidden>
          ›
        </Text>
        <Pressable onPress={() => navigation.navigate("LibrarySearch", { q: doc.courseCode })} hitSlop={8}>
          <Text style={[theme.typography.captionBold, { color: colors.brand }]}>{doc.courseCode}</Text>
        </Pressable>
        <Text style={[theme.typography.caption, { color: colors.textMuted }]} aria-hidden>
          ›
        </Text>
        <Text
          numberOfLines={1}
          style={[theme.typography.caption, { color: colors.textSecondary, flexShrink: 1 }]}
        >
          {doc.title}
        </Text>
      </View>

      {/* Read CTA — prominent */}
      <View
        style={{
          borderRadius: theme.radii.lg,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        {/* Preview band */}
        <View
          style={{
            height: 140,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.surfaceAlt,
          }}
        >
          {doc.previewUrl && doc.isImage ? (
            <Text style={[theme.typography.caption, { color: colors.textMuted }]}>Preview available</Text>
          ) : (
            <Icon name={doc.type === "past_question" ? "layers" : "book"} size={38} color={colors.brand} />
          )}
        </View>
        <View style={{ padding: 18 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: colors.brand + "1A" }}>
              <Text style={[theme.typography.small, { color: colors.brand, fontWeight: "800" }]}>
                {doc.courseCode}
              </Text>
            </View>
            {doc.courseTitle ? (
              <Text style={[theme.typography.small, { color: colors.textMuted, flex: 1 }]} numberOfLines={1}>
                {doc.courseTitle}
              </Text>
            ) : null}
          </View>
          <Text style={[theme.typography.h2, { color: colors.textPrimary, marginTop: 8 }]}>
            {doc.title}
          </Text>

          {/* Meta line */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {metaChip(theme.typography, colors, doc.institution?.name ?? "Community")}
            {doc.level ? metaChip(theme.typography, colors, `L${doc.level}`) : null}
            {doc.session ? metaChip(theme.typography, colors, doc.session) : null}
            {metaChip(theme.typography, colors, bytesLabel(doc.sizeBytes))}
          </View>

          {/* Actions */}
          <Pressable
            onPress={() => void openReader()}
            style={{
              marginTop: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              paddingVertical: 14,
              borderRadius: theme.radii.md,
              backgroundColor: colors.accent,
              ...(theme.mode === "pop" ? { borderWidth: 2, borderColor: colors.borderStrong } : {}),
            }}
          >
            <Icon name="book" size={17} color="#170B26" />
            <Text style={{ fontFamily: "PlusJakartaSans_700Bold", fontSize: 15, color: "#170B26" }}>
              {doc.opens > 0 ? "Continue reading" : "Read now"}
            </Text>
          </Pressable>

          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <Pressable
              onPress={() => void toggleSave()}
              disabled={saveBusy}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                paddingVertical: 12,
                borderRadius: theme.radii.md,
                backgroundColor: saved ? colors.accent : colors.surfaceAlt,
                borderWidth: 1.5,
                borderColor: saved ? colors.accent : colors.borderStrong,
              }}
            >
              <Icon name="book" size={14} color={saved ? "#170B26" : colors.textPrimary} />
              <Text style={[theme.typography.captionBold, { color: saved ? "#170B26" : colors.textPrimary }]}>
                {saved ? "Saved" : "Save"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setReportOpen(true)}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                paddingVertical: 12,
                borderRadius: theme.radii.md,
                borderWidth: 1.5,
                borderColor: colors.error + "55",
              }}
            >
              <Icon name="alert" size={14} color={colors.error} />
              <Text style={[theme.typography.captionBold, { color: colors.error }]}>Report</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Description */}
      {doc.description ? (
        <Surface style={{ padding: 16, marginTop: 16 }}>
          <Text style={[theme.typography.captionBold, { color: colors.textSecondary, marginBottom: 6 }]}>About</Text>
          <Text style={[theme.typography.body, { color: colors.textPrimary, lineHeight: 24 }]}>
            {doc.description}
          </Text>
        </Surface>
      ) : null}

      {/* Stats */}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
        <View style={{ flex: 1, borderRadius: theme.radii.md, backgroundColor: colors.surfaceAlt, padding: 12, alignItems: "center" }}>
          <Text style={[theme.typography.h3, { color: colors.textPrimary }]}>{doc.opens}</Text>
          <Text style={[theme.typography.small, { color: colors.textMuted }]}>reads</Text>
        </View>
        <View style={{ flex: 1, borderRadius: theme.radii.md, backgroundColor: colors.surfaceAlt, padding: 12, alignItems: "center" }}>
          <Text style={[theme.typography.h3, { color: colors.textPrimary }]}>{doc.savesCount}</Text>
          <Text style={[theme.typography.small, { color: colors.textMuted }]}>saved</Text>
        </View>
      </View>

      {/* Related */}
      {detail.related.length > 0 ? (
        <View style={{ marginTop: 24 }}>
          <Text style={[theme.typography.h3, { color: colors.textPrimary, marginBottom: 12 }]}>
            More on {doc.courseCode}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {detail.related.map((r) => (
              <DocumentCard
                key={r.id}
                doc={r}
                onPress={() =>
                  navigation.navigate("LibraryDetail", {
                    itemId: r.id,
                    title: r.title,
                    courseCode: r.courseCode,
                  })
                }
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Report sheet */}
      <ConfirmSheet
        visible={reportOpen}
        title="Report this resource"
        body={reportDone ? "Thanks — our team will review it." : "Why is this resource a problem?"}
        confirmLabel={reportBusy ? "Submitting…" : "Submit report"}
        destructive
        onConfirm={() => void submitReport()}
        onClose={() => {
          if (!reportBusy) setReportOpen(false);
        }}
      >
        {!reportDone ? (
          <View style={{ gap: 8, marginTop: 14 }}>
            {REPORT_REASONS.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => {
                  setReportReason(r.id);
                  setReportError(null);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  padding: 12,
                  borderRadius: theme.radii.md,
                  backgroundColor: reportReason === r.id ? colors.error + "18" : colors.surfaceAlt,
                  borderWidth: 1.5,
                  borderColor: reportReason === r.id ? colors.error : colors.border,
                }}
              >
                <Text style={[theme.typography.body, { color: colors.textPrimary, flex: 1 }]}>
                  {r.label}
                </Text>
                <Icon name="check" size={14} color={reportReason === r.id ? colors.error : "transparent"} />
              </Pressable>
            ))}
            {reportError ? (
              <Text style={[theme.typography.captionBold, { color: colors.error }]}>{reportError}</Text>
            ) : null}
          </View>
        ) : null}
      </ConfirmSheet>
    </KeyboardScreen>
  );
}

function metaChip(typography: any, colors: any, label: string) {
  return (
    <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border }}>
      <Text style={[typography.small, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}