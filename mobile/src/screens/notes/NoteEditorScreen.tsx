import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardScreen } from "../../components/KeyboardScreen";
import { Icon } from "../../components/icons";
import { ConfirmSheet } from "../../components/ConfirmSheet";
import {
  getNote,
  upsertNote,
  deleteNote,
  newNoteId,
  type Note,
} from "../../utils/notes";
import { logStudyActivity } from "../../utils/streak";

/**
 * Note editor — autosaves as the student types (debounced), flushes on
 * unmount, and keeps everything local. Trash only appears for existing notes.
 */
export function NoteEditorScreen({
  navigation,
  route,
}: {
  navigation: { goBack: () => void };
  route: { params?: { id?: string } };
}) {
  const { theme } = useTheme();
  const colors = theme.colors;

  const noteRef = useRef<Note | null>(null);
  const [ready, setReady] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Load the note (or start a fresh one).
  useEffect(() => {
    (async () => {
      const id = route.params?.id;
      if (id) {
        const existing = await getNote(id);
        noteRef.current = existing;
        if (existing) {
          setTitle(existing.title);
          setBody(existing.body);
        }
      }
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback(async (t: string, b: string) => {
    const now = Date.now();
    const current = noteRef.current;
    const next: Note = {
      id: current?.id ?? newNoteId(),
      title: t,
      body: b,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };
    noteRef.current = next;
    await upsertNote(next);
    // Writing a real note counts as a study day for the streak (deduped per
    // day, so autosaves while typing don't inflate it).
    if (t.trim() || b.trim()) {
      void logStudyActivity();
    }
  }, []);

  // Debounced autosave while typing.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  const scheduleSave = (t: string, b: string) => {
    dirtyRef.current = true;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persist(t, b).then(() => {
        dirtyRef.current = false;
        setSaveState("saved");
      });
    }, 700);
  };

  // Flush any pending save when leaving the screen.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (dirtyRef.current && noteRef.current) {
        void persist(noteRef.current.title, noteRef.current.body);
      }
    };
  }, [persist]);

  const doDelete = async () => {
    if (!noteRef.current) return;
    setDeleteBusy(true);
    await deleteNote(noteRef.current.id);
    setDeleteBusy(false);
    navigation.goBack();
  };

  if (!ready) {
    return (
      <KeyboardScreen center>
        <ActivityIndicator color={colors.brand} />
      </KeyboardScreen>
    );
  }

  const existing = !!route.params?.id && !!noteRef.current;

  return (
    <KeyboardScreen
      paddingTop={16}
      paddingBottom={40}
      keyboardShouldPersistTaps="handled"
      footer={
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 24,
            paddingBottom: 8,
          }}
        >
          <Text style={[theme.typography.small, { color: colors.textMuted }]}>
            {saveState === "saved"
              ? "Saved on this phone"
              : saveState === "saving"
                ? "Saving…"
                : "Private · never uploaded"}
          </Text>
          {existing ? (
            <Pressable
              onPress={() => setConfirmDelete(true)}
              hitSlop={8}
              style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
              accessibilityRole="button"
              accessibilityLabel="Delete note"
            >
              <Icon name="trash" size={15} color={colors.error} />
              <Text style={[theme.typography.captionBold, { color: colors.error }]}>Delete</Text>
            </Pressable>
          ) : null}
        </View>
      }
    >
      <TextInput
        value={title}
        onChangeText={(t) => {
          setTitle(t);
          scheduleSave(t, body);
        }}
        placeholder="Title"
        placeholderTextColor={colors.textMuted}
        style={{
          fontFamily: "PlusJakartaSans_700Bold",
          fontSize: 22,
          color: colors.textPrimary,
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: theme.radii.md,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      />
      <TextInput
        value={body}
        onChangeText={(b) => {
          setBody(b);
          scheduleSave(title, b);
        }}
        placeholder="Start typing your note…"
        placeholderTextColor={colors.textMuted}
        multiline
        textAlignVertical="top"
        style={{
          flexGrow: 1,
          minHeight: 320,
          marginTop: 12,
          padding: 14,
          fontFamily: "PlusJakartaSans_400Regular",
          fontSize: 16,
          lineHeight: 26,
          color: colors.textPrimary,
          borderRadius: theme.radii.md,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      />

      <ConfirmSheet
        visible={confirmDelete}
        title="Delete this note?"
        body="It will be gone for good — this can't be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => void doDelete()}
        onClose={() => {
          if (!deleteBusy) setConfirmDelete(false);
        }}
      >
        {deleteBusy ? (
          <View style={{ marginTop: 12 }}>
            <ActivityIndicator size="small" color={colors.brand} />
          </View>
        ) : null}
      </ConfirmSheet>
    </KeyboardScreen>
  );
}
