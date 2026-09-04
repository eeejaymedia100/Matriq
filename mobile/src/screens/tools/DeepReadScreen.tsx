import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardScreen } from "../../components/KeyboardScreen";
import { Icon } from "../../components/icons";
import { api } from "../../api/client";
import { formatApiError } from "../../utils/errors";
import { optimizeImageForUpload } from "../../utils/imageOptimize";
import { appendFileToFormData } from "../../utils/upload";
import { newNoteId, upsertNote } from "../../utils/notes";

/**
 * Deep Read — premium handwriting OCR (Magic Plus).
 *
 * UX contract for the ≤30s Pro transcription window: the student picks pages,
 * submits, and the app POLLS — a per-page progress list with honest states
 * (waiting → transcribing → done/failed), never a frozen spinner. Results can
 * be edited inline (93% ≠ 100% — the review screen is the trust mechanism),
 * saved as a real Matriq note, or copied out.
 */

interface JobPage {
  id: string;
  pageNumber: number;
  status: "pending" | "processing" | "done" | "empty" | "failed";
  engine: string | null;
  confidence: number | null;
  text: string | null;
  edited: boolean;
  errorMessage: string | null;
}

interface DeepReadJob {
  id: string;
  status: "queued" | "processing" | "done" | "partially_failed" | "failed";
  pageCount: number;
  completedPages: number;
  failedPages: number;
  bestEngine: string | null;
  pages: JobPage[];
  queuePosition?: number;
}

interface PickedPage {
  localUri: string;
  fileName: string;
}

const MAX_PAGES = 15;

export function DeepReadScreen({
  navigation,
}: {
  navigation?: { goBack: () => void; navigate: (s: string, p?: object) => void };
}) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const styles = makeStyles(colors);

  const [pages, setPages] = useState<PickedPage[]>([]);
  const [title, setTitle] = useState("");
  const [job, setJob] = useState<DeepReadJob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [savedNote, setSavedNote] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const startPolling = useCallback(
    (jobId: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const res = await api.get<{ job: DeepReadJob }>(`/deepread/jobs/${jobId}`);
          setJob(res.job);
          if (["done", "failed", "partially_failed"].includes(res.job.status)) {
            stopPolling();
          }
        } catch {
          // Transient poll failure — keep trying until the job times out
          // server-side (15 min sweep). Never strand the student on a blip.
        }
      }, 3500);
    },
    [stopPolling],
  );

  const addPages = async (fromCamera: boolean) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError({ title: "Permission needed", message: "Allow Matriq to access your photos to add pages." });
      return;
    }
    const res = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.9 })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsMultipleSelection: true,
          selectionLimit: MAX_PAGES - pages.length,
          quality: 0.9,
        });
    if (res.canceled || res.assets.length === 0) return;

    // High-fidelity profile: 2048px long edge preserves pen strokes (the
    // default 1200px upload cap smears handwriting before the server sees it).
    const optimized: PickedPage[] = [];
    for (const asset of res.assets) {
      const o = await optimizeImageForUpload(
        asset.uri,
        asset.fileName ?? `page-${pages.length + optimized.length + 1}.jpg`,
        { knownSize: { width: asset.width, height: asset.height }, maxDimension: 2048 },
      );
      optimized.push({ localUri: o.uri, fileName: o.fileName });
    }
    setPages((prev) => [...prev, ...optimized].slice(0, MAX_PAGES));
    setError(null);
  };

  const removePage = (index: number) => {
    setPages((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = async () => {
    if (pages.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    setSavedNote(false);
    try {
      const formData = new FormData();
      if (title.trim()) formData.append("title", title.trim());
      for (const p of pages) {
        await appendFileToFormData(formData, "pages", p.localUri, p.fileName, "image/jpeg");
      }
      const res = await api.upload<{ id: string; queuePosition: number }>(
        "/deepread/jobs",
        formData,
      );
      setJob({
        id: res.id,
        status: "queued",
        pageCount: pages.length,
        completedPages: 0,
        failedPages: 0,
        bestEngine: null,
        pages: pages.map((_, i) => ({
          id: `local-${i}`,
          pageNumber: i + 1,
          status: "pending" as const,
          engine: null,
          confidence: null,
          text: null,
          edited: false,
          errorMessage: null,
        })),
        queuePosition: res.queuePosition,
      });
      // Uploads done — the phone copies can be released.
      setPages([]);
      startPolling(res.id);
    } catch (err) {
      const friendly = formatApiError(err);
      setError({ title: friendly.title, message: friendly.message });
    } finally {
      setSubmitting(false);
    }
  };

  const saveAsNote = async () => {
    if (!job) return;
    const text = job.pages
      .filter((p) => p.text)
      .map((p) => p.text)
      .join("\n\n")
      .trim();
    if (!text) return;
    const now = Date.now();
    await upsertNote({
      id: newNoteId(),
      title: title.trim() || `Deep Read — ${new Date(now).toLocaleDateString()}`,
      body: text,
      createdAt: now,
      updatedAt: now,
      meta: { source: "ocr", label: "Deep Read" },
    });
    setSavedNote(true);
    setTimeout(() => setSavedNote(false), 2400);
  };

  const copyAll = async () => {
    if (!job) return;
    const text = job.pages
      .filter((p) => p.text)
      .map((p) => p.text)
      .join("\n\n");
    if (!text) return;
    await Clipboard.setStringAsync(text).catch(() => {});
    Alert.alert("Copied", "All transcribed text copied to the clipboard.");
  };

  const editPageText = async (pageId: string, text: string) => {
    if (!job || pageId.startsWith("local-")) return;
    // Optimistic update; the server re-parses blocks on its side.
    setJob({
      ...job,
      pages: job.pages.map((p) => (p.id === pageId ? { ...p, text, edited: true } : p)),
    });
    try {
      await api.patch(`/deepread/jobs/${job.id}/pages/${pageId}`, { text });
    } catch {
      // Keep the local edit; the note-saving path works from local state.
    }
  };

  const activeJob = job && !["done", "failed", "partially_failed"].includes(job.status);
  const readableCount = job?.pages.filter((p) => p.text).length ?? 0;

  // ── Job progress / results view ─────────────────────────────
  if (job) {
    return (
      <KeyboardScreen>
        <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
          <View style={styles.statusCard}>
            <View style={styles.statusRow}>
              {activeJob ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Icon
                  name={job.status === "failed" ? "x" : "check"}
                  size={22}
                  color={job.status === "failed" ? colors.error : colors.success}
                />
              )}
              <Text style={styles.statusTitle}>
                {activeJob
                  ? job.status === "queued"
                    ? `Waiting in queue${job.queuePosition ? ` — ${job.queuePosition} ahead of you` : ""}`
                    : "Reading your pages…"
                  : job.status === "failed"
                    ? "Couldn't read those pages"
                    : "Your notes are ready"}
              </Text>
            </View>
            {activeJob ? (
              <Text style={styles.statusHint}>
                {job.completedPages} of {job.pageCount} pages done — you can leave this
                screen, we'll notify you.
              </Text>
            ) : (
              <Text style={styles.statusHint}>
                {readableCount > 0
                  ? `${readableCount} page${readableCount > 1 ? "s" : ""} transcribed. Review the text, fix anything the AI misread, then save it as a note.`
                  : "The photos were too unclear. Retake with good lighting, filling the frame."}
              </Text>
            )}
          </View>

          {job.pages.map((page, idx) => (
            <View key={page.id} style={styles.pageCard}>
              <View style={styles.pageHeader}>
                <Text style={styles.pageNumber}>Page {idx + 1}</Text>
                <View style={styles.pageMeta}>
                  {page.confidence != null && page.status === "done" ? (
                    <Text style={[styles.pageBadge, { color: colors.textSecondary }]}>
                      {page.confidence}% confidence
                    </Text>
                  ) : null}
                  {page.edited ? (
                    <Text style={[styles.pageBadge, { color: colors.brand }]}>edited</Text>
                  ) : null}
                  <Text
                    style={[
                      styles.pageBadge,
                      {
                        color:
                          page.status === "done"
                            ? colors.success
                            : page.status === "failed" || page.status === "empty"
                              ? colors.error
                              : colors.textSecondary,
                      },
                    ]}
                  >
                    {page.status === "pending"
                      ? "waiting"
                      : page.status === "processing"
                        ? "reading…"
                        : page.status === "done"
                          ? "done"
                          : page.status === "empty"
                            ? "no text found"
                            : "failed"}
                  </Text>
                </View>
              </View>
              {page.status === "done" || page.edited ? (
                <TextInput
                  style={styles.pageText}
                  value={page.text ?? ""}
                  multiline
                  onChangeText={(t) => editPageText(page.id, t)}
                  placeholder="Transcription will appear here…"
                  placeholderTextColor={colors.textMuted}
                />
              ) : page.status === "failed" || page.status === "empty" ? (
                <Text style={[styles.pageText, { color: colors.error }]}>
                  {page.errorMessage ?? "This page needs a retake."}
                </Text>
              ) : (
                <View style={styles.pageSkeleton}>
                  <ActivityIndicator size="small" color={colors.accent} />
                </View>
              )}
            </View>
          ))}

          {readableCount > 0 ? (
            <View style={styles.actionsRow}>
              <Pressable style={[styles.button, styles.buttonPrimary]} onPress={saveAsNote}>
                <Icon name={savedNote ? "check" : "pen"} size={18} color={colors.bg} />
                <Text style={[styles.buttonText, { color: colors.bg }]}>
                  {savedNote ? "Saved to Notes" : "Save as note"}
                </Text>
              </Pressable>
              <Pressable style={[styles.button, styles.buttonSecondary]} onPress={copyAll}>
                <Text style={[styles.buttonText, { color: colors.textPrimary }]}>Copy all</Text>
              </Pressable>
            </View>
          ) : null}

          {activeJob ? null : (
            <Pressable
              style={[styles.button, styles.buttonGhost]}
              onPress={() => {
                setJob(null);
                setPages([]);
                setTitle("");
              }}
            >
              <Text style={[styles.buttonText, { color: colors.textSecondary }]}>
                Read another batch
              </Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardScreen>
    );
  }

  // ── Capture view ────────────────────────────────────────────
  return (
    <KeyboardScreen>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Icon name="image" size={26} color={colors.accent} />
          <Text style={styles.heroTitle}>Turn handwritten notes into documents</Text>
          <Text style={styles.heroBody}>
            Photograph your written pages — Deep Read transcribes them into clean,
            editable text you can save as notes. Works best one full page per photo,
            in good light.
          </Text>
        </View>

        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={setTitle}
          placeholder='Name this batch (e.g. "BIO 201 notes, week 3")'
          placeholderTextColor={colors.textMuted}
          maxLength={120}
        />

        {pages.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbs}>
            {pages.map((p, i) => (
              <View key={`${p.localUri}-${i}`} style={styles.thumbWrap}>
                <Image source={{ uri: p.localUri }} style={styles.thumb} />
                <Pressable style={styles.thumbRemove} onPress={() => removePage(i)}>
                  <Icon name="x" size={12} color={colors.bg} />
                </Pressable>
                <Text style={styles.thumbIndex}>{i + 1}</Text>
              </View>
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.captureRow}>
          <Pressable
            style={[styles.button, styles.buttonPrimary, pages.length >= MAX_PAGES && styles.buttonDisabled]}
            disabled={pages.length >= MAX_PAGES}
            onPress={() => addPages(true)}
          >
            <Icon name="image" size={18} color={colors.bg} />
            <Text style={[styles.buttonText, { color: colors.bg }]}>Camera</Text>
          </Pressable>
          <Pressable
            style={[styles.button, styles.buttonSecondary, pages.length >= MAX_PAGES && styles.buttonDisabled]}
            disabled={pages.length >= MAX_PAGES}
            onPress={() => addPages(false)}
          >
            <Text style={[styles.buttonText, { color: colors.textPrimary }]}>Gallery</Text>
          </Pressable>
        </View>

        {error ? (
          <Text style={styles.errorText}>
            {error.title} — {error.message}
          </Text>
        ) : null}

        <Pressable
          style={[styles.button, styles.submitButton, (pages.length === 0 || submitting) && styles.buttonDisabled]}
          disabled={pages.length === 0 || submitting}
          onPress={submit}
        >
          {submitting ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text style={[styles.buttonText, { color: colors.bg }]}>
              Read {pages.length > 0 ? `${pages.length} page${pages.length > 1 ? "s" : ""}` : "pages"}
            </Text>
          )}
        </Pressable>

        <Text style={styles.footnote}>
          Up to {MAX_PAGES} pages per batch. Deep Read uses your daily allowance —
          check it in Magic Plus.
        </Text>
      </ScrollView>
    </KeyboardScreen>
  );
}

const makeStyles = (colors: {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  brand: string;
  error: string;
  success: string;
}) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { padding: 16, paddingBottom: 40, gap: 14 },
    hero: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      gap: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    heroTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "700" },
    heroBody: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
    titleInput: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      color: colors.textPrimary,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
    },
    thumbs: { flexGrow: 0 },
    thumbWrap: { marginRight: 10, position: "relative" },
    thumb: { width: 92, height: 120, borderRadius: 10, backgroundColor: colors.surfaceAlt },
    thumbRemove: {
      position: "absolute",
      top: -6,
      right: -6,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.error,
      alignItems: "center",
      justifyContent: "center",
    },
    thumbIndex: {
      position: "absolute",
      bottom: 4,
      left: 6,
      color: "#fff",
      fontSize: 11,
      fontWeight: "700",
      textShadowColor: "rgba(0,0,0,0.7)",
      textShadowRadius: 3,
    },
    captureRow: { flexDirection: "row", gap: 10 },
    actionsRow: { flexDirection: "row", gap: 10 },
    button: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 18,
      minHeight: 48,
      flex: 1,
    },
    buttonPrimary: { backgroundColor: colors.accent },
    buttonSecondary: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    buttonGhost: { backgroundColor: "transparent" },
    buttonDisabled: { opacity: 0.45 },
    submitButton: { marginTop: 4 },
    buttonText: { fontSize: 15, fontWeight: "700" },
    errorText: { color: colors.error, fontSize: 13, lineHeight: 18 },
    footnote: { color: colors.textMuted, fontSize: 12, lineHeight: 17, textAlign: "center" },
    statusCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      gap: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statusRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    statusTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", flex: 1 },
    statusHint: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
    pageCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pageHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    pageNumber: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
    pageMeta: { flexDirection: "row", gap: 10 },
    pageBadge: { fontSize: 12, fontWeight: "600" },
    pageText: {
      color: colors.textPrimary,
      fontSize: 15,
      lineHeight: 22,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 10,
      padding: 12,
      minHeight: 80,
      textAlignVertical: "top",
    },
    pageSkeleton: { minHeight: 80, alignItems: "center", justifyContent: "center" },
  });
