import React, { useEffect, useRef, useState } from "react";
import { View, Text, Image, Pressable, ActivityIndicator, Platform, ScrollView, Alert } from "react-native";
import { File } from "expo-file-system";
import * as Clipboard from "expo-clipboard";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardScreen } from "../../components/KeyboardScreen";
import { Surface } from "../../components/Surface";
import { Icon } from "../../components/icons";
import { ReflowReader } from "../../components/ReflowReader";
import { AgentSheet } from "../../components/AgentSheet";
import { api, API_BASE, authHeaders } from "../../api/client";
import { formatApiError } from "../../utils/errors";
import { newNoteId, upsertNote } from "../../utils/notes";
import { vaultFileDestination, rememberVaultFile } from "../../utils/vaultCache";

interface ReaderResult {
  text: string;
  source: "pdf" | "pptx" | "docx" | "ocr" | "none";
}

/**
 * In-app document reader with two reading modes:
 *
 *  - Reflow ("mobile view", the default): extracted text re-typeset into
 *    full-width block cards — vertical swipe, big controllable type,
 *    long-press highlights that convert to a cited note. The scroll students
 *    already live in, no pinch-zoom on A4 slabs.
 *  - A4: the faithful original view — page-faithful text (or the photo
 *    itself for image uploads), for when layout matters (slides, diagrams,
 *    tables).
 *
 * Reading never counts as a download; extraction is cached on-device after
 * first open so re-reading is fully offline.
 */
export function DocumentReaderScreen({
  navigation,
  route,
}: {
  navigation: { navigate: (s: string, p?: object) => void };
  route: {
    params: {
      itemId: string;
      originalName: string;
      title: string;
      courseCode: string;
      mimeType: string;
    };
  };
}) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const { itemId, originalName, title, courseCode, mimeType } = route.params;

  const [mode, setMode] = useState<"reflow" | "a4">("reflow");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ title: string; message: string; action: string } | null>(null);
  const [result, setResult] = useState<ReaderResult | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentPassage, setAgentPassage] = useState<string | undefined>(undefined);
  const attempted = useRef(false);

  const isImage = mimeType.startsWith("image/");

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    (async () => {
      setLoading(true);
      try {
        const data = await api.get<ReaderResult>(`/vault/${itemId}/text`);
        setResult(data);
        setError(null);
      } catch (err) {
        setError(formatApiError(err));
      } finally {
        setLoading(false);
      }
    })();

    // Photo uploads also get a live preview: stream the original into the
    // vault's offline folder (web keeps the text-only view).
    if (isImage && Platform.OS !== "web") {
      (async () => {
        try {
          const headers = await authHeaders();
          if (!headers) return;
          const destination = vaultFileDestination(itemId, "original", originalName);
          if (!destination) return;
          const downloaded = await File.downloadFileAsync(
            `${API_BASE}/vault/${itemId}/file?variant=original`,
            destination,
            { idempotent: true, headers },
          );
          void rememberVaultFile(itemId, "original", {
            uri: downloaded.uri,
            fileName: originalName,
            mimeType,
            cachedAt: Date.now(),
          });
          setImageUri(downloaded.uri);
        } catch {
          // Preview is a nice-to-have — the text still loads.
        }
      })();
    }
  }, [itemId, isImage, mimeType, originalName]);

  const copyText = async () => {
    if (!result?.text) return;
    await Clipboard.setStringAsync(result.text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  /** Save the extracted/OCR text as a real, editable Matriq note. */
  const saveAsNote = async () => {
    if (!result?.text) return;
    const now = Date.now();
    const id = newNoteId();
    const label = `${courseCode}${title ? ` — ${title}` : ""}`;
    await upsertNote({
      id,
      title: label.slice(0, 80),
      body: result.text,
      createdAt: now,
      updatedAt: now,
      meta: { source: "ocr", label },
    });
    setSavedNote(true);
    Alert.alert("Saved to Notes", "The text is now a note you can edit anytime.", [
      { text: "Not now", style: "cancel" },
      {
        text: "Open note",
        onPress: () => navigation.navigate("NoteEditor", { id }),
      },
    ]);
  };

  const sourceLabel = `${courseCode}${title ? ` — ${title}` : originalName ? ` — ${originalName}` : ""}`;
  const hasText = !!result?.text && result.source !== "none";

  return (
    <KeyboardScreen scroll={false} paddingBottom={0}>
      <View style={{ flex: 1 }}>
        {/* File header + mode toggle */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            padding: 14,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              backgroundColor: colors.surfaceAlt,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name={isImage ? "image" : "fileText"} size={18} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: colors.brand + "1A" }}>
                <Text style={[theme.typography.small, { color: colors.brand, fontWeight: "700" }]}>{courseCode}</Text>
              </View>
            </View>
            <Text style={[theme.typography.captionBold, { color: colors.textPrimary, marginTop: 3 }]} numberOfLines={1}>
              {originalName || title}
            </Text>
          </View>

          {/* Reflow ↔ A4 toggle — only when there is text to reflow */}
          {hasText ? (
            <View
              style={{
                flexDirection: "row",
                backgroundColor: colors.surfaceAlt,
                borderRadius: 999,
                padding: 2,
              }}
            >
              {(["reflow", "a4"] as const).map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setMode(m)}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    backgroundColor: mode === m ? colors.accent : "transparent",
                  }}
                  accessibilityLabel={m === "reflow" ? "Mobile reading view" : "Original document view"}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "700",
                      color: mode === m ? "#170B26" : colors.textSecondary,
                    }}
                  >
                    {m === "reflow" ? "Mobile" : "A4"}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        {loading ? (
          <View style={{ alignItems: "center", paddingVertical: 44, flex: 1, justifyContent: "center" }}>
            <ActivityIndicator color={colors.brand} />
            <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 10 }]}>
              {isImage ? "Reading the text…" : "Extracting the text…"}
            </Text>
          </View>
        ) : error ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 8,
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
          </ScrollView>
        ) : !hasText ? (
          /* No readable text — same guidance as before, now with Deep Read for photos */
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
            {imageUri ? (
              <View
                style={{
                  borderRadius: theme.radii.lg,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: colors.border,
                  marginBottom: 14,
                }}
              >
                <Image source={{ uri: imageUri }} style={{ width: "100%", height: 260 }} resizeMode="contain" />
              </View>
            ) : null}
            <Surface style={{ padding: 16 }}>
              <Text style={[theme.typography.body, { color: colors.textPrimary, lineHeight: 24 }]}>
                {isImage
                  ? "We couldn't make out clear text in this photo. Try a clearer, closer, better-lit shot — or let Deep Read transcribe it properly."
                  : "This PDF has no text layer — its pages are likely scanned images. Run it through Image to Text, or send it to Deep Read (Magic Plus) for a full transcription."}
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                <Pressable
                  onPress={() => navigation.navigate("Ocr", {})}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: theme.radii.pill,
                    backgroundColor: colors.surfaceAlt,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Icon name="image" size={15} color={colors.textSecondary} />
                  <Text style={{ fontFamily: "PlusJakartaSans_700Bold", fontSize: 12, color: colors.textSecondary }}>
                    Image to Text
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => navigation.navigate("DeepRead", {})}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: theme.radii.pill,
                    backgroundColor: colors.accent,
                  }}
                >
                  <Icon name="sparkle" size={15} color="#170B26" />
                  <Text style={{ fontFamily: "PlusJakartaSans_700Bold", fontSize: 12, color: "#170B26" }}>
                    Deep Read
                  </Text>
                </Pressable>
              </View>
            </Surface>
          </ScrollView>
        ) : mode === "reflow" ? (
          /* ── Reflow: the mobile reading view ── */
          <View style={{ flex: 1 }}>
            <ReflowReader
              text={result!.text}
              docId={`vault-${itemId}`}
              sourceLabel={sourceLabel}
              firstLineIsTitle={result!.source === "pptx"}
              onAskAgent={(passage) => {
                setAgentPassage(passage);
                setAgentOpen(true);
              }}
            />
          </View>
        ) : (
          /* ── A4: the faithful original view ── */
          <View style={{ flex: 1 }}>
            {imageUri ? (
              <ScrollView contentContainerStyle={{ padding: 16 }}>
                <Image source={{ uri: imageUri }} style={{ width: "100%", height: 380 }} resizeMode="contain" />
              </ScrollView>
            ) : (
              <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator>
                <Surface style={{ padding: 18 }}>
                  <Text selectable style={[theme.typography.body, { color: colors.textPrimary, lineHeight: 24 }]}>
                    {result!.text}
                  </Text>
                </Surface>
              </ScrollView>
            )}
            <View style={{ flexDirection: "row", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Pressable
                onPress={() => void copyText()}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  paddingVertical: 10,
                  borderRadius: theme.radii.pill,
                  backgroundColor: copied ? colors.success + "22" : colors.surfaceAlt,
                  borderWidth: 1,
                  borderColor: copied ? colors.success + "66" : colors.border,
                }}
              >
                <Icon name={copied ? "check" : "copy"} size={14} color={copied ? colors.success : colors.textSecondary} />
                <Text style={[theme.typography.captionBold, { color: copied ? colors.success : colors.textSecondary }]}>
                  {copied ? "Copied" : "Copy text"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void saveAsNote()}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  paddingVertical: 10,
                  borderRadius: theme.radii.pill,
                  backgroundColor: savedNote ? colors.success : colors.accent,
                }}
              >
                <Icon name="pen" size={14} color="#170B26" />
                <Text style={{ fontFamily: "PlusJakartaSans_700Bold", fontSize: 12, color: "#170B26" }}>
                  {savedNote ? "Saved to Notes" : "Save as note"}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {/* Agent v2 companion — answers grounded in this document + the
          student's own notes (Magic Plus, server-enforced). */}
      <AgentSheet
        visible={agentOpen}
        onClose={() => setAgentOpen(false)}
        baseRequest={{
          surface: "reader",
          itemId,
          docTitle: title || originalName,
          courseCode,
          ...(agentPassage ? { selection: agentPassage } : {}),
        }}
      />
    </KeyboardScreen>
  );
}
