import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useTheme } from "../../theme/ThemeContext";
import { ThemedScreen } from "../../components/Surface";
import { Icon } from "../../components/icons";
import {
  getMaterials,
  addMaterial,
  removeMaterial,
  type Material,
} from "../../utils/materials";
import { markTodoDone } from "../../utils/todos";
import { checkTodoBadge } from "../../utils/badges";

/**
 * My materials (spec §9 #4) — this student's own saved books & notes,
 * distinct from the shared Vault. Local-first; cloud sync arrives with the
 * Vault backend work.
 */
export function MyMaterialsScreen() {
  const { theme } = useTheme();
  const colors = theme.colors;

  const [materials, setMaterials] = useState<Material[]>([]);
  const [title, setTitle] = useState("");

  useEffect(() => {
    void getMaterials().then(setMaterials);
  }, []);

  const save = async (kind: Material["kind"], uri: string | undefined, sizeLabel?: string) => {
    if (!title.trim()) {
      setTitle("");
      // Fall back to a placeholder title derived from the kind.
    }
    const next = await addMaterial({
      title: title.trim() || (kind === "image" ? "Photo" : "Document"),
      kind,
      uri,
      sizeLabel,
    });
    setMaterials(next);
    setTitle("");
    await markTodoDone("materials");
    await checkTodoBadge();
  };

  const pickDocument = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      copyToCacheDirectory: true,
    });
    if (res.canceled || res.assets.length === 0) return;
    const asset = res.assets[0];
    const mb = asset.size !== undefined && asset.size > 0 ? (asset.size / 1_048_576).toFixed(1) : undefined;
    await save("document", asset.uri, mb ? `${mb} MB` : undefined);
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    if (res.canceled || res.assets.length === 0) return;
    const asset = res.assets[0];
    const mb = asset.fileSize && asset.fileSize > 0 ? (asset.fileSize / 1_048_576).toFixed(1) : undefined;
    await save("image", asset.uri, mb ? `${mb} MB` : undefined);
  };

  const remove = async (id: string) => {
    setMaterials(await removeMaterial(id));
  };

  return (
    <ThemedScreen>
      <SafeAreaView style={{ flex: 1 }} edges={["bottom", "left", "right"]}>
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[theme.typography.display, { color: colors.textPrimary }]}>My materials</Text>
          <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 4 }]}>
            Your own books &amp; notes — separate from the shared Vault.
          </Text>

          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Give it a name (e.g. CHM 101 lecture notes)"
            placeholderTextColor={colors.textMuted}
            style={{
              marginTop: 18,
              backgroundColor: colors.surface,
              borderRadius: theme.radii.md,
              borderWidth: 1,
              borderColor: colors.border,
              color: colors.textPrimary,
              fontFamily: theme.typography.body.fontFamily,
              fontSize: 15,
              paddingHorizontal: 14,
              paddingVertical: 12,
            }}
          />

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <Pressable
              onPress={() => void pickDocument()}
              style={{
                flex: 1,
                alignItems: "center",
                gap: 6,
                paddingVertical: 14,
                borderRadius: theme.radii.md,
                backgroundColor: colors.surface,
                borderWidth: 1.5,
                borderColor: colors.accent + "88",
              }}
            >
              <Icon name="fileText" size={20} color={colors.accent} />
              <Text style={[theme.typography.captionBold, { color: colors.textPrimary }]}>Add document</Text>
            </Pressable>
            <Pressable
              onPress={() => void pickImage()}
              style={{
                flex: 1,
                alignItems: "center",
                gap: 6,
                paddingVertical: 14,
                borderRadius: theme.radii.md,
                backgroundColor: colors.surface,
                borderWidth: 1.5,
                borderColor: colors.accent + "88",
              }}
            >
              <Icon name="image" size={20} color={colors.accent} />
              <Text style={[theme.typography.captionBold, { color: colors.textPrimary }]}>Add photo</Text>
            </Pressable>
          </View>

          {materials.length > 0 ? (
            <View style={{ marginTop: 22, gap: 10 }}>
              {materials.map((m) => (
                <View
                  key={m.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    padding: 14,
                    borderRadius: theme.radii.md,
                    backgroundColor: colors.surfaceAlt,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      backgroundColor: colors.surface,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Icon name={m.kind === "image" ? "image" : "book"} size={19} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>{m.title}</Text>
                    <Text style={[theme.typography.caption, { color: colors.textMuted }]}>
                      {m.kind === "image" ? "Photo" : "Document"}
                      {m.sizeLabel ? ` · ${m.sizeLabel}` : ""}
                    </Text>
                  </View>
                  <Pressable onPress={() => void remove(m.id)} hitSlop={8}>
                    <Icon name="trash" size={17} color={colors.error} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <View style={{ marginTop: 28, alignItems: "center" }}>
              <Icon name="book" size={34} color={colors.textMuted} />
              <Text style={[theme.typography.body, { color: colors.textMuted, marginTop: 12, textAlign: "center", maxWidth: 260 }]}>
                Nothing saved yet. Add your notes or books to start building your library.
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedScreen>
  );
}
