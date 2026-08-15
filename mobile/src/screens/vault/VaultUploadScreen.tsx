import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Linking,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useTheme } from "../../theme/ThemeContext";
import { ThemedScreen } from "../../components/Surface";
import { Icon } from "../../components/icons";
import { ConfirmSheet } from "../../components/ConfirmSheet";
import { api } from "../../api/client";
import { formatApiError } from "../../utils/errors";
import { bytesLabel } from "../../utils/files";
import { TERMS_URL } from "../../constants/legal";
import type { VaultItemDto } from "./VaultScreen";

const TERMS_VERSION = "1.0";

/**
 * Upload flow (spec §7 + §14). Every upload is Public (scoped to your school,
 * after a quick admin review) or Private (yours only). Smart storage: the
 * original is kept untouched and a lightweight companion is generated
 * automatically. First upload specifically surfaces the Terms of Use — a
 * separate trigger point from the registration checkbox.
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
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [firstUpload, setFirstUpload] = useState(true);
  const [uploading, setUploading] = useState(false);
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
    setAsset({
      uri: a.uri,
      name: a.name ?? "file",
      mimeType: a.mimeType ?? "application/pdf",
      size: a.size,
      file: a.file,
    });
    setError(null);
  };

  const canSubmit =
    !!asset &&
    courseCode.trim().length >= 2 &&
    title.trim().length > 0 &&
    (firstUpload ? termsAccepted : true) &&
    !uploading;

  const submit = async () => {
    if (!asset) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      if (Platform.OS === "web" && asset.file) {
        formData.append("file", asset.file, asset.name);
      } else if (Platform.OS === "web") {
        const blob = await (await fetch(asset.uri)).blob();
        formData.append("file", blob, asset.name);
      } else {
        formData.append("file", {
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType,
        } as unknown as Blob);
      }
      formData.append("courseCode", courseCode.trim().toUpperCase());
      formData.append("title", title.trim());
      formData.append("type", type);
      formData.append("visibility", visibility);
      formData.append("termsVersion", TERMS_VERSION);

      const result = await api.upload<{
        id: string;
        moderationStatus: string;
        message: string;
      }>("/vault/upload", formData);

      setDone(result.message);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <ThemedScreen>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
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
                PDF, JPG or PNG · up to 20 MB
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
                borderColor: colors.accent + "66",
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
                </Text>
              </View>
              <Pressable onPress={() => setAsset(null)} hitSlop={10}>
                <Icon name="x" size={17} color={colors.textMuted} />
              </Pressable>
            </View>
          )}

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

          {/* Visibility */}
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
                <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>Public</Text>
                <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 1 }]}>
                  Visible to your school after a quick admin review
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
                <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>Private</Text>
                <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 1 }]}>
                  Only you can see and download it
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
              Your original file is kept untouched — a lightweight companion is made
              automatically, so students with bad data can grab the light copy.
              Contributions may help train a Matriq model for your school.
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
              <ActivityIndicator size="small" color="#170B26" />
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
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <ConfirmSheet
        visible={!!done}
        title="Uploaded"
        body={done ?? ""}
        confirmLabel="Done"
        onConfirm={() => navigation.goBack()}
        onClose={() => navigation.goBack()}
      />
    </ThemedScreen>
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
