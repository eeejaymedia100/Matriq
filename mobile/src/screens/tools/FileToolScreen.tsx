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
import * as ImagePicker from "expo-image-picker";
import { useTheme } from "../../theme/ThemeContext";
import { ThemedScreen } from "../../components/Surface";
import { Icon, type IconName } from "../../components/icons";
import { api } from "../../api/client";
import { formatApiError } from "../../utils/errors";
import { saveGeneratedFile, bytesLabel } from "../../utils/files";

export interface ToolResult {
  fileName: string;
  mimeType: string;
  base64: string;
}

interface PickedFile {
  uri: string;
  name: string;
  type: string;
  size?: number;
}

export interface FileToolScreenProps {
  title: string;
  subtitle: string;
  icon: IconName;
  endpoint: string;
  fieldName: string;
  mode: "document" | "image";
  multiple?: boolean;
  mimeTypes?: string[];
  pickLabel: string;
  runLabel: string;
  emptyHint: string;
  successHint?: string;
  extraFields?: Record<string, string>;
  renderExtras?: () => React.ReactNode;
}

async function appendFile(formData: FormData, field: string, f: PickedFile) {
  if (Platform.OS === "web") {
    const blob = await (await fetch(f.uri)).blob();
    formData.append(field, blob, f.name);
  } else {
    formData.append(field, {
      uri: f.uri,
      name: f.name,
      type: f.type,
    } as unknown as Blob);
  }
}

export function FileToolScreen(props: FileToolScreenProps) {
  const { theme } = useTheme();
  const colors = theme.colors;

  const [files, setFiles] = useState<PickedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ToolResult | null>(null);
  const [error, setError] = useState<{
    title: string;
    message: string;
    action: string;
  } | null>(null);
  const [saved, setSaved] = useState(false);

  const pick = async () => {
    if (props.mode === "image") {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.9,
      });
      if (res.canceled || res.assets.length === 0) return;
      const a = res.assets[0];
      setFiles([
        {
          uri: a.uri,
          name: a.fileName ?? "photo.jpg",
          type: a.mimeType ?? "image/jpeg",
          size: a.fileSize,
        },
      ]);
    } else {
      const res = await DocumentPicker.getDocumentAsync({
        type: props.mimeTypes ?? ["application/pdf"],
        multiple: props.multiple ?? false,
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      setFiles(
        res.assets.map((a) => ({
          uri: a.uri,
          name: a.name,
          type: a.mimeType ?? "application/octet-stream",
          size: a.size,
        })),
      );
    }
    setResult(null);
    setError(null);
    setSaved(false);
  };

  const run = async () => {
    if (files.length === 0) return;
    setBusy(true);
    setResult(null);
    setError(null);
    setSaved(false);
    try {
      const formData = new FormData();
      for (const f of files) await appendFile(formData, props.fieldName, f);
      if (props.extraFields) {
        for (const [k, v] of Object.entries(props.extraFields)) {
          formData.append(k, v);
        }
      }
      const data = await api.upload<ToolResult>(props.endpoint, formData);
      setResult(data);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!result) return;
    await saveGeneratedFile(result.fileName, result.base64, result.mimeType);
    setSaved(true);
  };

  return (
    <ThemedScreen>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[theme.typography.display, { color: colors.textPrimary }]}>
            {props.title}
          </Text>
          <Text
            style={[
              theme.typography.body,
              { color: colors.textSecondary, marginTop: 4 },
            ]}
          >
            {props.subtitle}
          </Text>

          {/* Dropzone / selected files */}
          {files.length === 0 ? (
            <Pressable
              onPress={() => void pick()}
              style={{
                marginTop: 20,
                paddingVertical: 36,
                borderRadius: theme.radii.lg,
                borderWidth: 1.5,
                borderColor: colors.accent + "77",
                borderStyle: "dashed",
                backgroundColor: colors.surface,
                alignItems: "center",
                paddingHorizontal: 16,
              }}
            >
              <Icon name={props.icon} size={30} color={colors.accent} />
              <Text
                style={[
                  theme.typography.bodyBold,
                  { color: colors.textPrimary, marginTop: 12, textAlign: "center" },
                ]}
              >
                {props.emptyHint}
              </Text>
              <View
                style={{
                  marginTop: 16,
                  paddingVertical: 10,
                  paddingHorizontal: 18,
                  borderRadius: theme.radii.pill,
                  backgroundColor: colors.accent,
                }}
              >
                <Text
                  style={{
                    fontFamily: "PlusJakartaSans_700Bold",
                    fontSize: 13,
                    color: "#170B26",
                  }}
                >
                  {props.pickLabel}
                </Text>
              </View>
            </Pressable>
          ) : (
            <View style={{ marginTop: 20, gap: 8 }}>
              {files.map((f, i) => (
                <View
                  key={`${f.name}-${i}`}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    padding: 12,
                    borderRadius: theme.radii.md,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Icon name={props.icon} size={18} color={colors.brand} />
                  <View style={{ flex: 1 }}>
                    <Text
                      numberOfLines={1}
                      style={[theme.typography.bodyMedium, { color: colors.textPrimary }]}
                    >
                      {f.name}
                    </Text>
                    {f.size ? (
                      <Text style={[theme.typography.caption, { color: colors.textMuted }]}>
                        {bytesLabel(f.size)}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
              <Pressable
                onPress={() => void pick()}
                style={{
                  alignSelf: "flex-start",
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: theme.radii.pill,
                  borderWidth: 1.5,
                  borderColor: colors.borderStrong,
                }}
              >
                <Text style={[theme.typography.captionBold, { color: colors.textPrimary }]}>
                  {props.multiple ? "Add / replace PDFs" : "Choose a different file"}
                </Text>
              </Pressable>
            </View>
          )}

          {props.renderExtras ? props.renderExtras() : null}

          {/* Run button */}
          <Pressable
            onPress={() => void run()}
            disabled={files.length === 0 || busy}
            style={{
              marginTop: 16,
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 14,
              borderRadius: theme.radii.md,
              backgroundColor: colors.accent,
              borderWidth: theme.mode === "pop" ? 2 : 0,
              borderColor: colors.borderStrong,
              opacity: files.length === 0 ? 0.5 : 1,
            }}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#170B26" />
            ) : (
              <Text
                style={{
                  fontFamily: "PlusJakartaSans_700Bold",
                  fontSize: 14,
                  color: "#170B26",
                }}
              >
                {props.runLabel}
              </Text>
            )}
          </Pressable>

          {busy ? (
            <View style={{ alignItems: "center", marginTop: 20 }}>
              <ActivityIndicator color={colors.brand} />
              <Text
                style={[
                  theme.typography.caption,
                  { color: colors.textMuted, marginTop: 10 },
                ]}
              >
                Working on it…
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
              <View style={{ flex: 1 }}>
                <Text style={[theme.typography.captionBold, { color: colors.error }]}>
                  {error.title}
                </Text>
                <Text
                  style={[
                    theme.typography.caption,
                    { color: colors.textSecondary, marginTop: 2, lineHeight: 17 },
                  ]}
                >
                  {error.message} {error.action}
                </Text>
              </View>
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
                borderColor: colors.success + "55",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Icon name="check" size={15} color={colors.success} />
                <Text style={[theme.typography.captionBold, { color: colors.success }]}>
                  Ready — {result.fileName}
                </Text>
              </View>
              {props.successHint ? (
                <Text
                  style={[
                    theme.typography.caption,
                    { color: colors.textSecondary, lineHeight: 18, marginBottom: 12 },
                  ]}
                >
                  {props.successHint}
                </Text>
              ) : null}
              <Pressable
                onPress={() => void save()}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  paddingVertical: 12,
                  borderRadius: theme.radii.md,
                  backgroundColor: colors.accent,
                }}
              >
                <Icon name="download" size={16} color="#170B26" />
                <Text
                  style={{
                    fontFamily: "PlusJakartaSans_700Bold",
                    fontSize: 14,
                    color: "#170B26",
                  }}
                >
                  {saved ? "Saved — save again" : "Save / share"}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedScreen>
  );
}
