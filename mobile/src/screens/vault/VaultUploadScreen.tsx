import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Linking,
  Platform,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardScreen } from "../../components/KeyboardScreen";
import { Icon } from "../../components/icons";
import { ConfirmSheet } from "../../components/ConfirmSheet";
import { api } from "../../api/client";
import { formatApiError } from "../../utils/errors";
import { bytesLabel } from "../../utils/files";
import { optimizeImageForUpload } from "../../utils/imageOptimize";
import { appendFileToFormData } from "../../utils/upload";
import {
  uploadInChunks,
  CHUNKED_UPLOAD_THRESHOLD,
} from "../../utils/chunkedUpload";
import { TERMS_URL } from "../../constants/legal";
import type { VaultItemDto } from "./VaultScreen";

const TERMS_VERSION = "1.0";
const MAX_SINGLE_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_UPLOAD_BYTES = 200 * 1024 * 1024;

/**
 * Upload flow (spec §7 + §14). Every upload is a deliberate choice:
 *  - PUBLIC — a community contribution: visible to your school after a quick
 *    admin review, discoverable by other students, and (per the Terms) usable
 *    to improve Matriq. Public resources are part of the shared academic
 *    library — no quota, because their value grows with every contributor.
 *  - PRIVATE — yours only: only you can see or download it.
 * Smart storage: the original is kept untouched and a lightweight companion is
 * generated automatically. Large files (>12 MB) upload in ~4 MB chunks so a
 * 200 MB document never crashes the phone or the server.
 */
export function VaultUploadScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { theme } = useTheme();
  const colors = theme.colors;

  const [asset, setAsset] = useState<{
    uri: string;
    name: string;
    mimeType: string;
    size?: number;
    file?: File;
  } | null>(null);
  const [courseCode, setCourseCode] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"past_question" | "material">("past_question");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [level, setLevel] = useState("");
  const [session, setSession] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [firstUpload, setFirstUpload] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<{ title: string; message: string; action: string } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<{ items: VaultItemDto[] }>("/me/vault");
        // Only treat this as a returning upload when we can confirm prior
        // uploads; on any error we keep the safe default (show the Terms
        // checkbox) so the submit button is never silently disabled.
        setFirstUpload(data.items.length === 0);
      } catch {
        // Leave firstUpload as true.
      }
    })();
  }, []);

  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || res.assets.length === 0) return;
    const a = res.assets[0];
    const isImage = (a.mimeType ?? "").startsWith("image/");
    if (isImage) {
      // Large photos are resized to ≤1200px + JPEG 0.7 before upload so they
      // never hit the cap or crash low-end devices. Small images are left
      // untouched — the Vault keeps the original pristine by design.
      const optimized = await optimizeImageForUpload(a.uri, a.name ?? "photo.jpg", {
        skipUnderBytes: 1.5 * 1024 * 1024,
      });
      setAsset({
        uri: optimized.uri,
        name: optimized.fileName,
        mimeType: "image/jpeg",
        size: optimized.bytes > 0 ? optimized.bytes : undefined,
        file: undefined,
      });
    } else {
      setAsset({
        uri: a.uri,
        name: a.name ?? "file",
        mimeType: a.mimeType ?? "application/pdf",
        size: a.size,
        file: a.file,
      });
    }
    setProgress(0);
    setError(null);
  };

  const largeFile = !!asset?.size && asset.size > CHUNKED_UPLOAD_THRESHOLD;
  const overLimit = !!asset?.size && asset.size > MAX_TOTAL_UPLOAD_BYTES;

  const canSubmit =
    !!asset &&
    !overLimit &&
    courseCode.trim().length >= 2 &&
    title.trim().length > 0 &&
    (firstUpload ? termsAccepted : true) &&
    !uploading;

  const submit = async () => {
    if (!asset) return;
    setUploading(true);
    setProgress(0);
    setError(null);
    try {
      const meta = {
        courseCode: courseCode.trim().toUpperCase(),
        title: title.trim(),
        type,
        visibility,
        termsVersion: TERMS_VERSION,
        ...(level.trim() ? { level: level.trim().toUpperCase() } : {}),
        ...(session.trim() ? { session: session.trim() } : {}),
      };

      if (largeFile && asset.size) {
        // Large document → chunked path (never load the whole file in memory).
        const { uploadId, totalChunks } = await uploadInChunks({
          uri: asset.uri,
          fileName: asset.name,
          mimeType: asset.mimeType,
          totalBytes: asset.size,
          onProgress: setProgress,
        });
        const result = await api.post<{ message: string }>("/vault/upload/complete", {
          ...meta,
          uploadId,
          originalName: asset.name,
          mimeType: asset.mimeType,
          totalChunks,
          sizeBytes: asset.size,
        });
        setDone(result.message);
      } else {
        const formData = new FormData();
        if (Platform.OS === "web" && asset.file) {
          formData.append("file", asset.file, asset.name);
        } else {
          await appendFileToFormData(
            formData,
            "file",
            asset.uri,
            asset.name,
            asset.mimeType,
          );
        }
        formData.append("courseCode", meta.courseCode);
        formData.append("title", meta.title);
        formData.append("type", meta.type);
        formData.append("visibility", meta.visibility);
        formData.append("termsVersion", meta.termsVersion);
        if (meta.level) formData.append("level", meta.level);
        if (meta.session) formData.append("session", meta.session);

        const result = await api.upload<{
          id: string;
          moderationStatus: string;
          message: string;
        }>("/vault/upload", formData);

        setDone(result.message);
      }
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <KeyboardScreen paddingBottom={40}>

          <Text style={[theme.typography.display, { color: colors.textPrimary }]}>Add to the Vault</Text>
          <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 4, lineHeight: 22 }]}>
            Share a past question or material with students in your school —
            or keep it private for yourself.
          </Text>

          {/* File picker */}
          {!asset ? (
            <Pressable
              onPress={() => void pickFile()}
              style={{
                marginTop: 20,
                paddingVertical: 34,
                borderRadius: theme.radii.lg,
                borderWidth: 1.5,
                borderColor: colors.accent + "77",
                borderStyle: "dashed",
                backgroundColor: colors.surface,
                alignItems: "center",
              }}
            >
              <Icon name="upload" size={28} color={colors.accent} />
              <Text style={[theme.typography.bodyBold, { color: colors.textPrimary, marginTop: 10 }]}>
                Choose a file
              </Text>
              <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 4 }]}>
                PDF, JPG or PNG · up to 200 MB (large files upload in parts)
              </Text>
            </Pressable>
          ) : (
            <View
              style={{
                marginTop: 20,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 16,
                borderRadius: theme.radii.lg,
                backgroundColor: colors.surface,
                borderWidth: 1.5,
                borderColor: overLimit ? colors.error : colors.accent + "66",
              }}
            >
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 13,
                  backgroundColor: colors.surfaceAlt,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="fileText" size={20} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]} numberOfLines={1}>
                  {asset.name}
                </Text>
                <Text style={[theme.typography.caption, { color: colors.textMuted }]}>
                  {asset.size ? bytesLabel(asset.size) : "Ready"}
                  {largeFile ? " · will upload in parts" : ""}
                </Text>
              </View>
              <Pressable onPress={() => setAsset(null)} hitSlop={10}>
                <Icon name="x" size={17} color={colors.textMuted} />
              </Pressable>
            </View>
          )}

          {overLimit ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 8,
                marginTop: 12,
                backgroundColor: colors.errorBg,
                borderRadius: 12,
                padding: 12,
                borderWidth: 1,
                borderColor: colors.error + "44",
              }}
            >
              <Icon name="alert" size={16} color={colors.error} />
              <Text style={[theme.typography.caption, { color: colors.textSecondary, flex: 1, lineHeight: 18 }]}>
                That file is over the 200 MB limit. Try a smaller file.
              </Text>
            </View>
          ) : null}

          {/* Course code + title */}
          <Text style={[theme.typography.captionBold, { color: colors.textSecondary, marginTop: 20, marginBottom: 6 }]}>
            Course code
          </Text>
          <TextInput
            value={courseCode}
            onChangeText={(t) => setCourseCode(t.toUpperCase().slice(0, 12))}
            placeholder="e.g. CHM 101"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            style={inputStyle(colors, theme.radii.md)}
          />
          <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 6 }]}>
            The Vault is organised course-code first — this is how students find it.
          </Text>

          <Text style={[theme.typography.captionBold, { color: colors.textSecondary, marginTop: 18, marginBottom: 6 }]}>
            Title
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. 2019/2020 past questions with answers"
            placeholderTextColor={colors.textMuted}
            style={inputStyle(colors, theme.radii.md)}
          />

          {/* Discovery metadata (optional) */}
          <Text style={[theme.typography.captionBold, { color: colors.textSecondary, marginTop: 18, marginBottom: 6 }]}>
            Level (optional)
          </Text>
          <TextInput
            value={level}
            onChangeText={(t) => setLevel(t.toUpperCase().slice(0, 12))}
            placeholder="e.g. 200 — who is this for?"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            style={inputStyle(colors, theme.radii.md)}
          />
          <Text style={[theme.typography.captionBold, { color: colors.textSecondary, marginTop: 18, marginBottom: 6 }]}>
            Session (optional)
          </Text>
          <TextInput
            value={session}
            onChangeText={setSession}
            placeholder="e.g. 2023/2024"
            placeholderTextColor={colors.textMuted}
            style={inputStyle(colors, theme.radii.md)}
          />
          <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 6 }]}>
            These help other students find exactly the right material.
          </Text>

          {/* Type */}
          <Text style={[theme.typography.captionBold, { color: colors.textSecondary, marginTop: 18, marginBottom: 8 }]}>
            What is it?
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(
              [
                { id: "past_question", label: "Past question" },
                { id: "material", label: "Material" },
              ] as const
            ).map((t) => (
              <Pressable
                key={t.id}
                onPress={() => setType(t.id)}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 11,
                  borderRadius: theme.radii.md,
                  backgroundColor: type === t.id ? colors.accent : colors.surface,
                  borderWidth: 1,
                  borderColor: type === t.id ? "transparent" : colors.border,
                }}
              >
                <Text
                  style={{
                    fontFamily: "PlusJakartaSans_600SemiBold",
                    fontSize: 13,
                    color: type === t.id ? "#170B26" : colors.textPrimary,
                  }}
                >
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Visibility — explicit, understandable privacy choice */}
          <Text style={[theme.typography.captionBold, { color: colors.textSecondary, marginTop: 18, marginBottom: 8 }]}>
            Who can see it?
          </Text>
          <View style={{ gap: 8 }}>
            <Pressable
              onPress={() => setVisibility("public")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 14,
                borderRadius: theme.radii.md,
                backgroundColor: visibility === "public" ? colors.accent + "22" : colors.surface,
                borderWidth: 1.5,
                borderColor: visibility === "public" ? colors.accent : colors.border,
              }}
            >
              <Icon name="globe" size={18} color={visibility === "public" ? colors.accent : colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>
                  Public — a community contribution
                </Text>
                <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 1, lineHeight: 18 }]}>
                  Visible to your school after a quick admin review. It helps other students find
                  past questions and materials — and (per the Terms) may be used to improve Matriq.
                </Text>
              </View>
              {visibility === "public" ? <Icon name="check" size={17} color={colors.accent} /> : null}
            </Pressable>
            <Pressable
              onPress={() => setVisibility("private")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 14,
                borderRadius: theme.radii.md,
                backgroundColor: visibility === "private" ? colors.accent + "22" : colors.surface,
                borderWidth: 1.5,
                borderColor: visibility === "private" ? colors.accent : colors.border,
              }}
            >
              <Icon name="lock" size={18} color={visibility === "private" ? colors.accent : colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>Private — only you</Text>
                <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 1, lineHeight: 18 }]}>
                  Only you can see and download it. Nothing is shared, uploaded publicly or used for anything else.
                </Text>
              </View>
              {visibility === "private" ? <Icon name="check" size={17} color={colors.accent} /> : null}
            </Pressable>
          </View>

          {/* Smart storage explainer */}
          <View
            style={{
              flexDirection: "row",
              gap: 10,
              marginTop: 18,
              padding: 14,
              borderRadius: theme.radii.md,
              backgroundColor: colors.surfaceAlt,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Icon name="layers" size={17} color={colors.textMuted} />
            <Text style={[theme.typography.caption, { color: colors.textSecondary, flex: 1, lineHeight: 19 }]}>
              Your original file is kept untouched — a lightweight companion is made automatically,
              so students with bad data can grab the light copy. Videos aren't accepted in the Vault.
            </Text>
          </View>

          {/* Terms — surfaced on first upload (spec §14) */}
          {firstUpload ? (
            <Pressable
              onPress={() => setTermsAccepted((v) => !v)}
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 10,
                marginTop: 16,
                padding: 14,
                borderRadius: theme.radii.md,
                borderWidth: 1.5,
                borderColor: termsAccepted ? colors.accent : colors.borderStrong,
                backgroundColor: termsAccepted ? colors.accent + "11" : colors.surface,
              }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 7,
                  borderWidth: 1.5,
                  borderColor: termsAccepted ? colors.accent : colors.borderStrong,
                  backgroundColor: termsAccepted ? colors.accent : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 1,
                }}
              >
                {termsAccepted ? <Icon name="check" size={13} color="#170B26" /> : null}
              </View>
              <Text style={[theme.typography.caption, { color: colors.textSecondary, flex: 1, lineHeight: 19 }]}>
                First upload: by contributing, you agree to the{" "}
                <Text
                  style={{ color: colors.brand, fontWeight: "700" }}
                  onPress={(e) => {
                    e.stopPropagation();
                    Linking.openURL(TERMS_URL).catch(() => {});
                  }}
                >
                  Terms of Use
                </Text>{" "}
                — including that your contributions may be used to improve Matriq.
              </Text>
            </Pressable>
          ) : null}

          {error ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 8,
                marginTop: 16,
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

          <Pressable
            onPress={() => void submit()}
            disabled={!canSubmit}
            style={{
              marginTop: 22,
              alignItems: "center",
              paddingVertical: 15,
              borderRadius: theme.radii.md,
              backgroundColor: canSubmit ? colors.accent : colors.surfaceAlt,
              borderWidth: theme.mode === "pop" && canSubmit ? 2 : 1,
              borderColor: canSubmit ? colors.borderStrong : colors.border,
              opacity: canSubmit ? 1 : 0.7,
            }}
          >
            {uploading ? (
              <View style={{ alignItems: "center" }}>
                <ActivityIndicator size="small" color="#170B26" />
                {largeFile ? (
                  <Text style={{ fontFamily: "PlusJakartaSans_600SemiBold", fontSize: 11, color: "#170B26", marginTop: 6 }}>
                    Uploading {Math.round(progress * 100)}%
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text
                style={{
                  fontFamily: "PlusJakartaSans_700Bold",
                  fontSize: 15,
                  color: canSubmit ? "#170B26" : colors.textMuted,
                }}
              >
                {firstUpload ? "Accept terms & upload" : "Upload to the Vault"}
              </Text>
            )}
          </Pressable>

          {uploading && largeFile ? (
            <View style={{ marginTop: 10, height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: "hidden" }}>
              <View
                style={{
                  height: 6,
                  width: `${Math.max(4, Math.round(progress * 100))}%`,
                  borderRadius: 3,
                  backgroundColor: colors.accent,
                }}
              />
            </View>
          ) : null}

          {uploading && largeFile ? (
            <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 8, textAlign: "center" }]}>
              Uploading in ~4 MB parts — if your connection drops, just tap upload again to resume.
            </Text>
          ) : null}
      <ConfirmSheet
        visible={!!done}
        title="Uploaded"
        body={done ?? ""}
        confirmLabel="Done"
        onConfirm={() => navigation.goBack()}
        onClose={() => navigation.goBack()}
      />
    </KeyboardScreen>
  );
}

function inputStyle(
  colors: import("../../theme/themes").MatriqThemeColors,
  radius: number,
) {
  return {
    backgroundColor: colors.surface,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    fontFamily: "PlusJakartaSans_400Regular",
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  };
}
