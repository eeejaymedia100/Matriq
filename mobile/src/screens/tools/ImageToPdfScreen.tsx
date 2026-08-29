import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  Platform,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { useTheme } from "../../theme/ThemeContext";
import { ThemedScreen } from "../../components/Surface";
import { Icon } from "../../components/icons";
import { readUriAsBase64, saveGeneratedFile, bytesLabel } from "../../utils/files";
import {
  buildPdfFromJpegs,
  pdfFileName,
  PDF_PAGE_SIZES,
  type PdfImageFit,
  type PdfPageSize,
} from "../../utils/pdf";

/**
 * Image to PDF — photos of notes, handouts and board work into one clean PDF.
 * Built entirely on-device with a tiny dependency-free PDF writer: no upload,
 * no internet, no server. Supports multi-select, reorder, tap-to-preview and
 * basic page presentation (size + fit), then saves or shares the result.
 */
export function ImageToPdfScreen() {
  const { theme } = useTheme();
  const colors = theme.colors;

  const [images, setImages] = useState<Array<{ uri: string; name: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<PdfPageSize>("a4");
  const [fit, setFit] = useState<PdfImageFit>("contain");
  const [previewUri, setPreviewUri] = useState<string | null>(null);

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

  /** Move an image one position in the page order (wraps at the ends). */
  const move = (index: number, direction: -1 | 1) => {
    setImages((prev) => {
      const next = [...prev];
      const target = (index + direction + next.length) % next.length;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

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
      const pdfBase64 = buildPdfFromJpegs(jpegs, { pageSize, fit });
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

  const sizeLabel = PDF_PAGE_SIZES[pageSize].label;

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
            Turn photos of notes, handouts or board work into one clean PDF. Built on your phone.
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
            <>
              <Text style={[theme.typography.captionBold, { color: colors.textSecondary, marginTop: 20, marginBottom: 10 }]}>
                Pages — tap a photo to preview · arrows change the order
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {images.map((img, idx) => (
                  <View key={img.uri} style={{ width: 104 }}>
                    <Pressable onPress={() => setPreviewUri(img.uri)}>
                      <View
                        style={{
                          borderRadius: theme.radii.md,
                          overflow: "hidden",
                          borderWidth: 1,
                          borderColor: colors.border,
                          backgroundColor: colors.surfaceAlt,
                        }}
                      >
                        <Image source={{ uri: img.uri }} style={{ width: 104, height: 96 }} resizeMode="cover" />
                        <View
                          style={{
                            position: "absolute",
                            top: 4,
                            left: 4,
                            borderRadius: 6,
                            paddingHorizontal: 6,
                            paddingVertical: 1,
                            backgroundColor: "rgba(0,0,0,0.55)",
                          }}
                        >
                          <Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "700" }}>
                            {idx + 1}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Pressable onPress={() => move(idx, -1)} hitSlop={6} accessibilityLabel={`Move page ${idx + 1} left`}>
                          <Icon name="chevronLeft" size={16} color={colors.textSecondary} />
                        </Pressable>
                        <Pressable onPress={() => move(idx, 1)} hitSlop={6} accessibilityLabel={`Move page ${idx + 1} right`}>
                          <Icon name="chevronRight" size={16} color={colors.textSecondary} />
                        </Pressable>
                      </View>
                      <Pressable onPress={() => remove(img.uri)} hitSlop={8} accessibilityLabel={`Remove page ${idx + 1}`}>
                        <Icon name="x" size={14} color={colors.error} />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {images.length > 1 ? (
            <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 12 }]}>
              Tip: the arrows move a photo one position at a time. Your order is exactly the page order.
            </Text>
          ) : null}

          {/* Page presentation */}
          <Text style={[theme.typography.captionBold, { color: colors.textSecondary, marginTop: 22, marginBottom: 8 }]}>
            Page presentation
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            {(Object.keys(PDF_PAGE_SIZES) as PdfPageSize[]).map((key) => (
              <Pressable
                key={key}
                onPress={() => setPageSize(key)}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 10,
                  borderRadius: theme.radii.md,
                  backgroundColor: pageSize === key ? colors.accent : colors.surface,
                  borderWidth: 1,
                  borderColor: pageSize === key ? "transparent" : colors.border,
                }}
              >
                <Text
                  style={{
                    fontFamily: "PlusJakartaSans_600SemiBold",
                    fontSize: 13,
                    color: pageSize === key ? "#170B26" : colors.textPrimary,
                  }}
                >
                  {PDF_PAGE_SIZES[key].label}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(
              [
                { id: "contain", label: "Fit page", hint: "whole photo, clean margins" },
                { id: "cover", label: "Fill page", hint: "no margins, edges may crop" },
              ] as const
            ).map((f) => (
              <Pressable
                key={f.id}
                onPress={() => setFit(f.id)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  paddingHorizontal: 8,
                  borderRadius: theme.radii.md,
                  backgroundColor: fit === f.id ? colors.accent + "22" : colors.surface,
                  borderWidth: 1.5,
                  borderColor: fit === f.id ? colors.accent : colors.border,
                }}
              >
                <Text
                  style={{
                    fontFamily: "PlusJakartaSans_600SemiBold",
                    fontSize: 12,
                    textAlign: "center",
                    color: fit === f.id ? colors.accent : colors.textPrimary,
                  }}
                >
                  {f.label}
                </Text>
                <Text
                  style={[
                    theme.typography.small,
                    { color: colors.textMuted, textAlign: "center", marginTop: 2 },
                  ]}
                >
                  {f.hint}
                </Text>
              </Pressable>
            ))}
          </View>

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
                Create PDF ({images.length} page{images.length === 1 ? "" : "s"} · {sizeLabel})
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

        {/* Full-page preview */}
        <Modal
          visible={!!previewUri}
          transparent
          animationType="fade"
          onRequestClose={() => setPreviewUri(null)}
        >
          <Pressable
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center" }}
            onPress={() => setPreviewUri(null)}
          >
            {previewUri ? (
              <Image
                source={{ uri: previewUri }}
                style={{ width: "92%", height: "80%" }}
                resizeMode="contain"
              />
            ) : null}
            <View
              style={{
                position: "absolute",
                bottom: 48,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingVertical: 10,
                paddingHorizontal: 18,
                borderRadius: 999,
                backgroundColor: "rgba(255,255,255,0.16)",
              }}
            >
              <Icon name="x" size={14} color="#FFFFFF" />
              <Text style={{ color: "#FFFFFF", fontFamily: "PlusJakartaSans_600SemiBold", fontSize: 13 }}>
                Tap anywhere to close
              </Text>
            </View>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </ThemedScreen>
  );
}
