import React, { useCallback, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardScreen } from "../../components/KeyboardScreen";
import { Icon } from "../../components/icons";
import { api } from "../../api/client";
import { formatApiError } from "../../utils/errors";
import { DocumentCard } from "./DocumentCard";
import type { LibraryDoc } from "./types";

/**
 * The student's saved collection — bookmarks that reference public documents
 * (never duplicate the file). Fully private to the student.
 */
export function LibrarySavedScreen({
  navigation,
}: {
  navigation: { navigate: (s: string, p?: object) => void };
}) {
  const { theme } = useTheme();
  const colors = theme.colors;

  const [items, setItems] = useState<LibraryDoc[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ title: string; message: string; action: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get<LibraryDoc[]>("/library/saved");
      setItems(d);
      setError(null);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const open = (doc: LibraryDoc) =>
    navigation.navigate("LibraryDetail", {
      itemId: doc.id,
      title: doc.title,
      courseCode: doc.courseCode,
    });

  return (
    <KeyboardScreen paddingBottom={40}>
      <Text style={[theme.typography.display, { color: colors.textPrimary }]}>My saved library</Text>
      <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 2 }]}>
        Your bookmarks — a reference, never a paid-for copy.
      </Text>

      {error ? (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 14, backgroundColor: colors.errorBg, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.error + "44" }}>
          <Icon name="alert" size={16} color={colors.error} />
          <View style={{ flex: 1 }}>
            <Text style={[theme.typography.captionBold, { color: colors.error }]}>{error.title}</Text>
            <Text style={[theme.typography.caption, { color: colors.textSecondary, marginTop: 2, lineHeight: 17 }]}>{error.message} {error.action}</Text>
          </View>
        </View>
      ) : null}

      {loading ? (
        <View style={{ alignItems: "center", paddingVertical: 50 }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : !items || items.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: 50 }}>
          <Icon name="book" size={36} color={colors.textMuted} />
          <Text style={[theme.typography.body, { color: colors.textMuted, marginTop: 12, textAlign: "center", maxWidth: 280, lineHeight: 22 }]}>
            Nothing saved yet. Tap the save button on any library document to keep it here.
          </Text>
          <Pressable
            onPress={() => navigation.navigate("Library", {})}
            style={{ marginTop: 16, paddingVertical: 10, paddingHorizontal: 18, borderRadius: theme.radii.pill, backgroundColor: colors.accent }}
          >
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: "#17181A" }}>Browse the library</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {items.map((doc) => (
            <View key={doc.id} style={{ marginBottom: 14 }}>
              <DocumentCard doc={doc} onPress={() => open(doc)} width={320} />
            </View>
          ))}
        </>
      )}
    </KeyboardScreen>
  );
}