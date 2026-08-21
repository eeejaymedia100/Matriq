import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  ActivityIndicator,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardScreen } from "../../components/KeyboardScreen";
import { Icon } from "../../components/icons";
import { api } from "../../api/client";
import { formatApiError } from "../../utils/errors";
import {
  MAX_UPLOAD_BYTES,
  optimizeImageForUpload,
} from "../../utils/imageOptimize";
import {
  isOfflineOcrAvailable,
  recognizeImageOffline,
} from "../../offline/ocr";

/**
 * Image to Text (OCR) — spec §8. Runs through the backend so Android and the
 * web build behave identically. Honesty check: if almost no text was
 * detected, we say "No readable text found — try a clearer photo" instead of
 * returning garbage.
 */
export function OcrScreen() {
  const { theme } = useTheme();
  const colors = theme.colors;

  // Bundled on-device engine (ML Kit) — when present, recognition runs locally
  // with zero internet; the server path stays as the fallback (web, or if the
  // native engine ever fails on a photo).
  const offlineAvailable = isOfflineOcrAvailable();

  const [image, setImage] = useState<{
    uri: string;
    fileName?: string;
    bytes?: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    text: string;
    confidence: number;
    readable: boolean;
    engine: "offline" | "server";
  } | null>(null);
  const [error, setError] = useState<{ title: string; message: string; action: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
    });
    if (res.canceled || res.assets.length === 0) return;
    const asset = res.assets[0];
    // Resize to ≤1200px + JPEG 0.7 so the upload never hits the payload limit
    // and the server never chokes on a 3000×4000 photo.
    const optimized = await optimizeImageForUpload(
      asset.uri,
      asset.fileName ?? "photo.jpg",
      { knownSize: { width: asset.width, height: asset.height } },
    );
    setImage({
      uri: optimized.uri,
      fileName: optimized.fileName,
      bytes: optimized.bytes,
    });
    setResult(null);
    setError(null);
  };

  const capture = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchCameraAsync({ quality: 0.9 });
    if (res.canceled || res.assets.length === 0) return;
    const asset = res.assets[0];
    const optimized = await optimizeImageForUpload(
      asset.uri,
      "camera.jpg",
      { knownSize: { width: asset.width, height: asset.height } },
    );
    setImage({
      uri: optimized.uri,
      fileName: optimized.fileName,
      bytes: optimized.bytes,
    });
    setResult(null);
    setError(null);
  };

  const copyText = async () => {
    if (!result?.text) return;
    await Clipboard.setStringAsync(result.text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const readText = async () => {
    if (!image) return;
    setBusy(true);
    setResult(null);
    setError(null);
    setCopied(false);

    // 1) Offline-first: the bundled on-device engine. No upload, no internet,
    // no quota — works in the exam hall with zero signal.
    if (offlineAvailable) {
      try {
        const res = await recognizeImageOffline(image.uri);
        const text = (res.text ?? "").trim();
        const readable = text.length >= 4;
        setResult({
          text: readable ? text.slice(0, 5000) : "",
          confidence: 0,
          readable,
          engine: "offline",
        });
        setBusy(false);
        return;
      } catch {
        // Native engine hiccup (e.g. undecodable image) — fall through to the
        // server path below rather than leaving the student stuck.
      }
    }

    // 2) Server fallback (web, or when the on-device engine failed).
    try {
      // Hard guard: even compressed, an image over the backend cap would just
      // come back as a 413 — tell the user before uploading.
      if (image.bytes && image.bytes > MAX_UPLOAD_BYTES) {
        setError({
          title: "That photo is still too large",
          message: "Even after compressing, this photo is over the upload limit.",
          action: "Try a clearer, closer shot — or a screenshot with bigger text.",
        });
        return;
      }
      const formData = new FormData();
      if (Platform.OS === "web") {
        const blob = await (await fetch(image.uri)).blob();
        formData.append("image", blob, image.fileName ?? "photo.jpg");
      } else {
        formData.append("image", {
          uri: image.uri,
          name: image.fileName ?? "photo.jpg",
          type: "image/jpeg",
        } as unknown as Blob);
      }
      const data = await api.upload<{
        text: string;
        confidence: number;
        readable: boolean;
      }>("/tools/ocr", formData);
      setResult({ ...data, engine: "server" });
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardScreen paddingBottom={40}>

          <Text style={[theme.typography.display, { color: colors.textPrimary }]}>Image to Text</Text>
          <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 4 }]}>
            Read text out of a photo — a whiteboard, a printed note, a screenshot.
          </Text>

          {offlineAvailable ? (
            <View
              style={{
                alignSelf: "flex-start",
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginTop: 12,
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: theme.radii.pill,
                backgroundColor: colors.successBg,
                borderWidth: 1,
                borderColor: colors.success + "44",
              }}
            >
              <Icon name="wifiOff" size={13} color={colors.success} />
              <Text style={[theme.typography.captionBold, { color: colors.success }]}>
                Offline — recognized on your phone, no internet needed
              </Text>
            </View>
          ) : null}

          {!image ? (
            <View
              style={{
                marginTop: 20,
                paddingVertical: 36,
                borderRadius: theme.radii.lg,
                borderWidth: 1.5,
                borderColor: colors.accent + "77",
                borderStyle: "dashed",
                backgroundColor: colors.surface,
                alignItems: "center",
              }}
            >
              <Icon name="image" size={30} color={colors.accent} />
              <Text style={[theme.typography.bodyBold, { color: colors.textPrimary, marginTop: 12 }]}>
                Pick a photo with text
              </Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                <Pressable
                  onPress={() => void pick()}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 18,
                    borderRadius: theme.radii.pill,
                    backgroundColor: colors.accent,
                  }}
                >
                  <Text style={{ fontFamily: "PlusJakartaSans_700Bold", fontSize: 13, color: "#170B26" }}>
                    From gallery
                  </Text>
                </Pressable>
                {Platform.OS !== "web" ? (
                  <Pressable
                    onPress={() => void capture()}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 18,
                      borderRadius: theme.radii.pill,
                      borderWidth: 1.5,
                      borderColor: colors.borderStrong,
                    }}
                  >
                    <Text style={[theme.typography.bodyBold, { fontSize: 13, color: colors.textPrimary }]}>
                      Camera
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : (
            <>
              <View style={{ marginTop: 20, borderRadius: theme.radii.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
                <Image source={{ uri: image.uri }} style={{ width: "100%", height: 240 }} resizeMode="contain" />
              </View>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                <Pressable
                  onPress={() => void readText()}
                  disabled={busy}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    paddingVertical: 14,
                    borderRadius: theme.radii.md,
                    backgroundColor: colors.accent,
                    borderWidth: theme.mode === "pop" ? 2 : 0,
                    borderColor: colors.borderStrong,
                  }}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#170B26" />
                  ) : (
                    <Text style={{ fontFamily: "PlusJakartaSans_700Bold", fontSize: 14, color: "#170B26" }}>
                      Read the text
                    </Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => {
                    setImage(null);
                    setResult(null);
                  }}
                  style={{
                    paddingVertical: 14,
                    paddingHorizontal: 18,
                    borderRadius: theme.radii.md,
                    borderWidth: 1.5,
                    borderColor: colors.borderStrong,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="refresh" size={18} color={colors.textPrimary} />
                </Pressable>
              </View>
            </>
          )}

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

          {busy ? (
            <View style={{ alignItems: "center", marginTop: 24 }}>
              <ActivityIndicator color={colors.brand} />
              <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 10 }]}>
                {offlineAvailable
                  ? "Reading on your device…"
                  : "Reading the text… (first run takes a few seconds)"}
              </Text>
            </View>
          ) : null}

          {result && !busy ? (
            <View
              style={{
                marginTop: 20,
                padding: 18,
                borderRadius: theme.radii.lg,
                backgroundColor: colors.surface,
                borderWidth: 1.5,
                borderColor: result.readable ? colors.accent + "66" : colors.warning + "55",
              }}
            >
              {result.readable ? (
                <>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <Icon name="check" size={15} color={colors.success} />
                    <Text style={[theme.typography.captionBold, { color: colors.success }]}>
                      {result.engine === "offline"
                        ? "Text detected · recognized on your device"
                        : `Text detected · ${result.confidence}% confidence`}
                    </Text>
                  </View>
                  <Text selectable style={[theme.typography.body, { color: colors.textPrimary, lineHeight: 24 }]}>
                    {result.text}
                  </Text>
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
                    <Icon
                      name={copied ? "check" : "copy"}
                      size={14}
                      color={copied ? colors.success : colors.textSecondary}
                    />
                    <Text
                      style={[
                        theme.typography.captionBold,
                        { color: copied ? colors.success : colors.textSecondary },
                      ]}
                    >
                      {copied ? "Copied to clipboard" : "Copy text"}
                    </Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Icon name="alert" size={16} color={colors.warning} />
                    <Text style={[theme.typography.bodyBold, { color: colors.warning }]}>
                      No readable text found
                    </Text>
                  </View>
                  <Text style={[theme.typography.caption, { color: colors.textSecondary, marginTop: 8, lineHeight: 19 }]}>
                    We couldn't make out clear text in this photo. Try a clearer, closer,
                    better-lit shot — or a screenshot with bigger text.
                  </Text>
                </>
              )}
            </View>
          ) : null}
    </KeyboardScreen>
  );
}
