import React, { useEffect, useRef, useState } from "react";
import { View, Text, Image, Pressable, ActivityIndicator, Platform, ScrollView } from "react-native";
import { File } from "expo-file-system";
import * as Clipboard from "expo-clipboard";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardScreen } from "../../components/KeyboardScreen";
import { Surface } from "../../components/Surface";
import { Icon } from "../../components/icons";
import { api, API_BASE, authHeaders } from "../../api/client";
import { formatApiError } from "../../utils/errors";
import { vaultFileDestination, rememberVaultFile } from "../../utils/vaultCache";

interface ReaderResult {
  text: string;
  source: "pdf" | "ocr" | "none";
}

/**
 * In-app document reader. Fetches the extracted text of a vault file — the
 * PDF's text layer, or Tesseract OCR for photo uploads — and shows an image
 * preview when the file is a photo. Reading never counts as a download.
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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ title: string; message: string; action: string } | null>(null);
  const [result, setResult] = useState<ReaderResult | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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

  const sourceLabel =
    result?.source === "pdf"
      ? "Text layer · extracted from the PDF"
      : result?.source === "ocr"
        ? "Read from your photo · on-device style OCR"
        : "No readable text found";

  return (
    <KeyboardScreen paddingBottom={40}>
      {/* File header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          padding: 14,
          borderRadius: theme.radii.lg,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
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
          <Icon name={isImage ? "image" : "fileText"} size={20} color={colors.brand} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: colors.brand + "1A" }}>
              <Text style={[theme.typography.small, { color: colors.brand, fontWeight: "700" }]}>{courseCode}</Text>
            </View>
          </View>
          <Text style={[theme.typography.captionBold, { color: colors.textPrimary, marginTop: 4 }]} numberOfLines={1}>
            {originalName || title}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={{ alignItems: "center", paddingVertical: 44 }}>
          <ActivityIndicator color={colors.brand} />
          <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 10 }]}>
            {isImage ? "Reading the text…" : "Extracting the text…"}
          </Text>
        </View>
      ) : error ? (
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
      ) : (
        <>
          {/* Image preview for photo uploads */}
          {imageUri ? (
            <View
              style={{
                marginTop: 16,
                borderRadius: theme.radii.lg,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Image source={{ uri: imageUri }} style={{ width: "100%", height: 260 }} resizeMode="contain" />
            </View>
          ) : null}

          {/* Source / status line */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginTop: 18 }}>
            <Icon
              name={result?.source === "none" ? "alert" : "check"}
              size={15}
              color={result?.source === "none" ? colors.warning : colors.success}
            />
            <Text
              style={[
                theme.typography.captionBold,
                { color: result?.source === "none" ? colors.warning : colors.success },
              ]}
            >
              {sourceLabel}
            </Text>
          </View>

          {result?.source === "none" ? (
            <Surface style={{ padding: 16, marginTop: 12 }}>
              <Text style={[theme.typography.body, { color: colors.textPrimary, lineHeight: 24 }]}>
                {isImage
                  ? "We couldn't make out clear text in this photo. Try a clearer, closer, better-lit shot — or a screenshot with bigger text."
                  : "This PDF has no text layer — its pages are likely scanned images. Run it through Image to Text in Tools to read the pages."}
              </Text>
              <Pressable
                onPress={() => navigation.navigate("Ocr", {})}
                style={{
                  alignSelf: "flex-start",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 14,
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderRadius: theme.radii.pill,
                  backgroundColor: colors.accent,
                }}
              >
                <Icon name="image" size={15} color="#170B26" />
                <Text style={{ fontFamily: "PlusJakartaSans_700Bold", fontSize: 12, color: "#170B26" }}>
                  Go to Image to Text
                </Text>
              </Pressable>
            </Surface>
          ) : (
            <ScrollView
              style={{ marginTop: 12 }}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              <Surface style={{ padding: 18 }}>
                <Text selectable style={[theme.typography.body, { color: colors.textPrimary, lineHeight: 25 }]}>
                  {result?.text}
                </Text>
              </Surface>
            </ScrollView>
          )}

          {result?.text ? (
            <Pressable
              onPress={() => void copyText()}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                alignSelf: "flex-start",
                marginTop: 12,
                paddingVertical: 8,
                paddingHorizontal: 14,
                borderRadius: theme.radii.pill,
                backgroundColor: copied ? colors.success + "22" : colors.surfaceAlt,
                borderWidth: 1,
                borderColor: copied ? colors.success + "66" : colors.border,
              }}
            >
              <Icon name={copied ? "check" : "copy"} size={14} color={copied ? colors.success : colors.textSecondary} />
              <Text style={[theme.typography.captionBold, { color: copied ? colors.success : colors.textSecondary }]}>
                {copied ? "Copied to clipboard" : "Copy text"}
              </Text>
            </Pressable>
          ) : null}
        </>
      )}
    </KeyboardScreen>
  );
}
