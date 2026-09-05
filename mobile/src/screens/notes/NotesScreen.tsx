import React, { useCallback, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardScreen } from "../../components/KeyboardScreen";
import { Surface } from "../../components/Surface";
import { Icon } from "../../components/icons";
import { ConfirmSheet } from "../../components/ConfirmSheet";
import { listNotes, deleteNote, type Note } from "../../utils/notes";
import { timeAgo } from "../../utils/relativeTime";

/**
 * Notes — private, on-device note-taking launched from the Home page. Notes
 * never leave the phone (no upload, no API); the editor autosaves as you type.
 */
export function NotesScreen({
  navigation,
}: {
  navigation: { navigate: (s: string, p?: object) => void };
}) {
  const { theme } = useTheme();
  const colors = theme.colors;

  const [notes, setNotes] = useState<Note[] | null>(null);
  const [deleting, setDeleting] = useState<Note | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const reload = useCallback(async () => {
    setNotes(await listNotes());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    await deleteNote(deleting.id);
    setDeletingBusy(false);
    setDeleting(null);
    void reload();
  };

  return (
    <KeyboardScreen paddingBottom={40}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <Text style={[theme.typography.display, { color: colors.textPrimary }]}>Notes</Text>
          <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 2 }]}>
            Your private notes — saved on this phone.
          </Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate("NoteEditor", {})}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: theme.radii.pill,
            backgroundColor: colors.accent,
            borderWidth: theme.mode === "pop" ? 2 : 0,
            borderColor: colors.borderStrong,
          }}
        >
          <Icon name="plus" size={15} color="#17181A" />
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: "#17181A" }}>
            New note
          </Text>
        </Pressable>
      </View>

      {notes === null ? (
        <View style={{ alignItems: "center", paddingVertical: 40 }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : notes.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: 40 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              backgroundColor: colors.surfaceAlt,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="pen" size={28} color={colors.brand} />
          </View>
          <Text style={[theme.typography.bodyBold, { color: colors.textPrimary, marginTop: 14 }]}>
            Nothing here yet
          </Text>
          <Text
            style={[
              theme.typography.caption,
              { color: colors.textMuted, marginTop: 4, textAlign: "center", maxWidth: 280, lineHeight: 20 },
            ]}
          >
            Jot down lecture points, ideas or a to-study list. Your notes stay on this device — no
            internet needed.
          </Text>
          <Pressable
            onPress={() => navigation.navigate("NoteEditor", {})}
            style={{
              marginTop: 18,
              paddingVertical: 10,
              paddingHorizontal: 18,
              borderRadius: theme.radii.pill,
              backgroundColor: colors.accent,
            }}
          >
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: "#17181A" }}>
              Write your first note
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ marginTop: 20, gap: 10 }}>
          {notes.map((note) => (
            <Pressable key={note.id} onPress={() => navigation.navigate("NoteEditor", { id: note.id })}>
              <Surface style={{ padding: 16 }} variant="card">
                <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 11,
                      backgroundColor: colors.surfaceAlt,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="pen" size={17} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text
                      style={[theme.typography.bodyBold, { color: colors.textPrimary }]}
                      numberOfLines={1}
                    >
                      {note.title.trim() || "Untitled note"}
                    </Text>
                    <Text
                      style={[theme.typography.caption, { color: colors.textSecondary, marginTop: 2, lineHeight: 18 }]}
                      numberOfLines={2}
                    >
                      {note.body.trim() || "No text yet"}
                    </Text>
                    <Text style={[theme.typography.small, { color: colors.textMuted, marginTop: 6 }]}>
                      {timeAgo(new Date(note.updatedAt).toISOString())}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setDeleting(note)}
                    hitSlop={10}
                    style={{ padding: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete note ${note.title || "untitled"}`}
                  >
                    <Icon name="trash" size={17} color={colors.textMuted} />
                  </Pressable>
                </View>
              </Surface>
            </Pressable>
          ))}
        </View>
      )}

      <ConfirmSheet
        visible={!!deleting}
        title="Delete this note?"
        body={`“${deleting?.title.trim() || "Untitled note"}” will be gone for good.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => void confirmDelete()}
        onClose={() => {
          if (!deletingBusy) setDeleting(null);
        }}
      >
        {deletingBusy ? (
          <View style={{ marginTop: 12 }}>
            <ActivityIndicator size="small" color={colors.brand} />
          </View>
        ) : null}
      </ConfirmSheet>
    </KeyboardScreen>
  );
}
