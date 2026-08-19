import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useTheme } from "../../theme/ThemeContext";
import { ThemedScreen } from "../../components/Surface";
import { Icon } from "../../components/icons";
import { api } from "../../api/client";
import { formatApiError } from "../../utils/errors";

/**
 * Image to Text (OCR) — spec §8. Runs through the backend so Android and the
 * web build behave identically. Honesty check: if almost no text was
 * detected, we say "No readable text found — try a clearer photo" instead of
 * returning garbage.
 */
export function OcrScreen() {
  const { theme } = useTheme();
  const colors = theme.colors;

  const [image, setImage] = useState<{ uri: string; fileName?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    text: string;
    confidence: number;
    readable: boolean;
  } | null>(null);
  const [error, setError] = useState<{ title: string; message: string; action: string } | null>(null);

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
    });
    if (res.canceled || res.assets.length === 0) return;
    setImage({
      uri: res.assets[0].uri,
      fileName: res.assets[0].fileName ?? "photo.jpg",
    });
    setResult(null);
    setError(null);
  };

  const capture = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchCameraAsync({ quality: 0.9 });
    if (res.canceled || res.assets.length === 0) return;
    setImage({ uri: res.assets[0].uri, fileName: "camera.jpg" });
    setResult(null);
    setError(null);
  };

  const readText = async () => {
    if (!image) return;
    setBusy(true);
    setResult(null);
    setError(null);
    try {
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
      setResult(data);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedScreen>
      <SafeAreaView style={{ flex: 1 }} edges={["bottom", "left", "right"]}>
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[theme.typography.display, { color: colors.textPrimary }]}>Image to Text</Text>
          <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 4 }]}>
            Read text out of a photo — a whiteboard, a printed note, a screenshot.
          </Text>

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
                Reading the text… (first run takes a few seconds)
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
                      Text detected · {result.confidence}% confidence
                    </Text>
                  </View>
                  <Text selectable style={[theme.typography.body, { color: colors.textPrimary, lineHeight: 24 }]}>
                    {result.text}
                  </Text>
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
        </ScrollView>
      </SafeAreaView>
    </ThemedScreen>
  );
}
