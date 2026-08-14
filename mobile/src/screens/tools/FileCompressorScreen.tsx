import React, { useState } from "react";
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { zipSync } from "fflate";
import { useTheme } from "../../theme/ThemeContext";
import { ThemedScreen } from "../../components/Surface";
import { Icon } from "../../components/icons";
import {
  readUriAsBase64,
  base64ToBytes,
  bytesToBase64,
  saveGeneratedFile,
  bytesLabel,
} from "../../utils/files";

interface Picked {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
  file?: File;
}

interface Result {
  fileName: string;
  mimeType: string;
  base64: string;
  beforeBytes: number;
  afterBytes: number;
}

/**
 * File Compressor (spec §8) — the general-purpose version of the Vault's
 * auto-compression, usable on any file. Images are re-encoded to a smaller
 * JPEG; any other file gets zipped. Honest sizes before and after — if the
 * "compressed" result wouldn't be smaller, we keep the original.
 */
export function FileCompressorScreen() {
  const { theme } = useTheme();
  const colors = theme.colors;

  const [picked, setPicked] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || res.assets.length === 0) return;
    const a = res.assets[0];
    setPicked({
      uri: a.uri,
      name: a.name ?? "file",
      mimeType: a.mimeType ?? "application/octet-stream",
      size: a.size,
      file: a.file,
    });
    setResult(null);
    setError(null);
  };

  const compress = async () => {
    if (!picked || busy) return;
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const isImage = picked.mimeType.startsWith("image/");

      let outputBase64: string;
      let outputMime: string;
      let outputName: string;
      let afterBytes: number;

      if (isImage) {
        // Images: re-encode to a lean JPEG (60% quality).
        const context = ImageManipulator.ImageManipulator.manipulate(picked.uri);
        const image = await context.renderAsync();
        const saved = await image.saveAsync({
          compress: 0.6,
          format: ImageManipulator.SaveFormat.JPEG,
        });
        outputBase64 = await readUriAsBase64(saved.uri);
        outputMime = "image/jpeg";
        const base = picked.name.replace(/\.[^.]*$/, "");
        outputName = `${base}-compressed.jpg`;
        afterBytes = Math.floor(outputBase64.length * 0.75);
      } else {
        // Everything else: zip (level 9).
        const source = picked.file
          ? await (await fetch(picked.uri)).arrayBuffer()
          : base64ToBytes(await readUriAsBase64(picked.uri));
        const zipped = zipSync({
          [picked.name]: [new Uint8Array(source), { level: 9 }],
        });
        outputBase64 = bytesToBase64(zipped);
        outputMime = "application/zip";
        outputName = `${picked.name}.zip`;
        afterBytes = zipped.length;
      }

      const beforeBytes = picked.size ?? Math.floor((await readUriAsBase64(picked.uri)).length * 0.75);
      const smaller = afterBytes < beforeBytes;

      setResult(
        smaller
          ? { fileName: outputName, mimeType: outputMime, base64: outputBase64, beforeBytes, afterBytes }
          : {
              fileName: picked.name,
              mimeType: picked.mimeType,
              base64: await readUriAsBase64(picked.uri),
              beforeBytes,
              afterBytes: beforeBytes,
            },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't compress that file — please try again.");
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!result || busy) return;
    setBusy(true);
    setError(null);
    try {
      await saveGeneratedFile(result.fileName, result.base64, result.mimeType);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the file.");
    } finally {
      setBusy(false);
    }
  };

  const savedPct =
    result && result.afterBytes < result.beforeBytes
      ? Math.round((1 - result.afterBytes / result.beforeBytes) * 100)
      : 0;

  return (
    <ThemedScreen>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[theme.typography.display, { color: colors.textPrimary }]}>File Compressor</Text>
          <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 4 }]}>
            Shrink any file: images get re-encoded, everything else gets zipped.
          </Text>

          {!picked ? (
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
              <Icon name="layers" size={26} color={colors.accent} />
              <Text style={[theme.typography.bodyBold, { color: colors.textPrimary, marginTop: 10 }]}>
                Choose a file
              </Text>
              <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 4 }]}>
                PDF, images, documents, anything
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
                <Icon name={picked.mimeType.startsWith("image/") ? "image" : "fileText"} size={20} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]} numberOfLines={1}>
                  {picked.name}
                </Text>
                <Text style={[theme.typography.caption, { color: colors.textMuted }]}>
                  {picked.size ? bytesLabel(picked.size) : "Ready"}
                </Text>
              </View>
              <Pressable onPress={() => setPicked(null)} hitSlop={10}>
                <Icon name="x" size={17} color={colors.textMuted} />
              </Pressable>
            </View>
          )}

          <Pressable
            onPress={() => void compress()}
            disabled={!picked || busy}
            style={{
              marginTop: 20,
              alignItems: "center",
              paddingVertical: 15,
              borderRadius: theme.radii.md,
              backgroundColor: picked ? colors.accent : colors.surfaceAlt,
              borderWidth: theme.mode === "pop" && picked ? 2 : 1,
              borderColor: picked ? colors.borderStrong : colors.border,
              opacity: picked ? 1 : 0.6,
            }}
          >
            {busy ? (
              <View style={{ alignItems: "center" }}>
                <ActivityIndicator size="small" color="#170B26" />
                <Text style={{ fontFamily: "PlusJakartaSans_600SemiBold", fontSize: 12, color: "#170B26", marginTop: 6 }}>
                  Compressing…
                </Text>
              </View>
            ) : (
              <Text style={{ fontFamily: "PlusJakartaSans_700Bold", fontSize: 15, color: picked ? "#170B26" : colors.textMuted }}>
                Compress file
              </Text>
            )}
          </Pressable>

          {result ? (
            <View
              style={{
                marginTop: 20,
                padding: 18,
                borderRadius: theme.radii.lg,
                backgroundColor: colors.surface,
                borderWidth: 1.5,
                borderColor: savedPct > 0 ? colors.accent + "66" : colors.warning + "55",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Icon name={savedPct > 0 ? "check" : "info"} size={16} color={savedPct > 0 ? colors.success : colors.warning} />
                <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>
                  {savedPct > 0 ? `${savedPct}% smaller` : "Already optimal"}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 20, marginTop: 10 }}>
                <View>
                  <Text style={[theme.typography.small, { color: colors.textMuted }]}>Before</Text>
                  <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>
                    {bytesLabel(result.beforeBytes)}
                  </Text>
                </View>
                <View>
                  <Text style={[theme.typography.small, { color: colors.textMuted }]}>After</Text>
                  <Text style={[theme.typography.bodyBold, { color: savedPct > 0 ? colors.accent : colors.textPrimary }]}>
                    {bytesLabel(result.afterBytes)}
                  </Text>
                </View>
              </View>
              {savedPct === 0 ? (
                <Text style={[theme.typography.caption, { color: colors.textSecondary, marginTop: 8, lineHeight: 18 }]}>
                  Compressing couldn't make this file smaller, so we kept your original untouched.
                </Text>
              ) : null}
              <Pressable
                onPress={() => void share()}
                disabled={busy}
                style={{
                  marginTop: 14,
                  alignItems: "center",
                  paddingVertical: 12,
                  borderRadius: theme.radii.md,
                  backgroundColor: colors.accent,
                  borderWidth: theme.mode === "pop" ? 2 : 0,
                  borderColor: colors.borderStrong,
                }}
              >
                <Text style={{ fontFamily: "PlusJakartaSans_700Bold", fontSize: 13, color: "#170B26" }}>
                  {Platform.OS === "web" ? "Download file" : "Save / share"}
                </Text>
              </Pressable>
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
        </ScrollView>
      </SafeAreaView>
    </ThemedScreen>
  );
}
