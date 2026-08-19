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
import * as ImageManipulator from "expo-image-manipulator";
import { useTheme } from "../../theme/ThemeContext";
import { ThemedScreen } from "../../components/Surface";
import { Icon } from "../../components/icons";
import { readUriAsBase64, saveGeneratedFile, bytesLabel } from "../../utils/files";
import { buildPdfFromJpegs, pdfFileName } from "../../utils/pdf";

/**
 * Image to PDF (spec §8) — photos into one document, built on-device with a
 * tiny dependency-free PDF writer. PNGs are converted to JPEG first so every
 * page embeds cleanly.
 */
export function ImageToPdfScreen() {
  const { theme } = useTheme();
  const colors = theme.colors;

  const [images, setImages] = useState<Array<{ uri: string; name: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
      allowsMultipleSelection: true,
      selectionLimit: 20,
    });
    if (res.canceled || res.assets.length === 0) return;
    setImages((prev) => [
      ...prev,
      ...res.assets.map((a, i) => ({
        uri: a.uri,
        name: a.fileName ?? `photo-${Date.now()}-${i}.jpg`,
      })),
    ]);
    setNote(null);
    setError(null);
  };

  const remove = (uri: string) => setImages((prev) => prev.filter((i) => i.uri !== uri));

  const toJpegBase64 = async (uri: string): Promise<string> => {
    // Re-encode anything that isn't already a JPEG so the PDF embeds it as a
    // DCTDecode image XObject.
    const context = ImageManipulator.ImageManipulator.manipulate(uri);
    const image = await context.renderAsync();
    const saved = await image.saveAsync({
      compress: 0.88,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return readUriAsBase64(saved.uri);
  };

  const createPdf = async () => {
    if (images.length === 0 || busy) return;
    setBusy(true);
    setNote(null);
    setError(null);
    try {
      const jpegs: string[] = [];
      for (const img of images) {
        jpegs.push(await toJpegBase64(img.uri));
      }
      const pdfBase64 = buildPdfFromJpegs(jpegs);
      const fileName = pdfFileName(`Matriq-${images.length}-pages`);
      const result = await saveGeneratedFile(fileName, pdfBase64, "application/pdf");
      setNote(
        result.shared
          ? `PDF ready — ${images.length} page${images.length === 1 ? "" : "s"} (${bytesLabel(pdfBase64.length * 0.75)}). Saved via the share sheet.`
          : "PDF generated and saved to Matriq's files.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't build the PDF — please try again.");
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
          <Text style={[theme.typography.display, { color: colors.textPrimary }]}>Image to PDF</Text>
          <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 4 }]}>
            Turn photos of notes, handouts or receipts into one clean PDF. Built on your phone.
          </Text>

          <Pressable
            onPress={() => void pick()}
            style={{
              marginTop: 20,
              paddingVertical: 26,
              borderRadius: theme.radii.lg,
              borderWidth: 1.5,
              borderColor: colors.accent + "77",
              borderStyle: "dashed",
              backgroundColor: colors.surface,
              alignItems: "center",
            }}
          >
            <Icon name="plus" size={24} color={colors.accent} />
            <Text style={[theme.typography.bodyBold, { color: colors.textPrimary, marginTop: 8 }]}>
              {images.length === 0 ? "Add photos" : "Add more photos"}
            </Text>
            <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 4 }]}>
              Pick several — they become PDF pages in order
            </Text>
          </Pressable>

          {images.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
              {images.map((img, idx) => (
                <View key={img.uri} style={{ width: 96 }}>
                  <View
                    style={{
                      borderRadius: theme.radii.md,
                      overflow: "hidden",
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Image source={{ uri: img.uri }} style={{ width: 96, height: 96 }} resizeMode="cover" />
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                    <Text style={[theme.typography.small, { color: colors.textMuted, fontWeight: "700" }]}>
                      Page {idx + 1}
                    </Text>
                    <Pressable onPress={() => remove(img.uri)} hitSlop={8}>
                      <Icon name="x" size={14} color={colors.error} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          <Pressable
            onPress={() => void createPdf()}
            disabled={images.length === 0 || busy}
            style={{
              marginTop: 24,
              alignItems: "center",
              paddingVertical: 15,
              borderRadius: theme.radii.md,
              backgroundColor: images.length > 0 ? colors.accent : colors.surfaceAlt,
              borderWidth: theme.mode === "pop" && images.length > 0 ? 2 : 1,
              borderColor: images.length > 0 ? colors.borderStrong : colors.border,
              opacity: images.length > 0 ? 1 : 0.6,
            }}
          >
            {busy ? (
              <View style={{ alignItems: "center" }}>
                <ActivityIndicator size="small" color="#170B26" />
                <Text style={{ fontFamily: "PlusJakartaSans_600SemiBold", fontSize: 12, color: "#170B26", marginTop: 6 }}>
                  Building the PDF…
                </Text>
              </View>
            ) : (
              <Text style={{ fontFamily: "PlusJakartaSans_700Bold", fontSize: 15, color: images.length > 0 ? "#170B26" : colors.textMuted }}>
                Create PDF ({images.length} page{images.length === 1 ? "" : "s"})
              </Text>
            )}
          </Pressable>

          {note ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 8,
                marginTop: 16,
                backgroundColor: colors.successBg,
                borderRadius: 12,
                padding: 12,
                borderWidth: 1,
                borderColor: colors.success + "44",
              }}
            >
              <Icon name="check" size={15} color={colors.success} />
              <Text style={[theme.typography.caption, { color: colors.textSecondary, flex: 1, lineHeight: 18 }]}>
                {note}
              </Text>
            </View>
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
              <Text style={[theme.typography.caption, { color: colors.textSecondary, flex: 1, lineHeight: 18 }]}>
                {error}
              </Text>
            </View>
          ) : null}

          {Platform.OS === "web" ? (
            <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 14, textAlign: "center" }]}>
              On web, the PDF downloads straight to your browser.
            </Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedScreen>
  );
}
