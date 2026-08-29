import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";

/**
 * Local note-taking (spec: "take notes on the home page").
 *
 * Notes are private, on-device, and never uploaded: stored as one JSON file
 * in the app's persistent document directory on native builds, and in
 * localStorage on the web build (which has no persistent filesystem). Every
 * function is best-effort — a storage failure degrades to an empty list, it
 * must never take the app down.
 */

export interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  /** Optional provenance — e.g. created from an OCR session. */
  meta?: { source?: "ocr"; label?: string };
}

const NATIVE = Platform.OS !== "web";
const DIR_NAME = "matriq-notes";
const FILE_NAME = "notes.json";
const WEB_KEY = "matriq_notes";

function notesFile(): File | null {
  if (!NATIVE) return null;
  try {
    const dir = new Directory(Paths.document, DIR_NAME);
    if (!dir.exists) {
      dir.create({ idempotent: true, intermediates: true });
    }
    return new File(dir, FILE_NAME);
  } catch {
    return null;
  }
}

async function readAll(): Promise<Note[]> {
  if (NATIVE) {
    const file = notesFile();
    if (!file) return [];
    try {
      if (!file.exists) return [];
      const parsed = JSON.parse(await file.text()) as unknown;
      return Array.isArray(parsed) ? (parsed as Note[]) : [];
    } catch {
      return [];
    }
  }
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(WEB_KEY) : null;
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Note[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(notes: Note[]): Promise<void> {
  if (NATIVE) {
    const file = notesFile();
    if (!file) return;
    try {
      file.write(JSON.stringify(notes));
    } catch {
      // Best-effort — a failed write never breaks the app.
    }
    return;
  }
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(WEB_KEY, JSON.stringify(notes));
    }
  } catch {
    // Quota/private-mode — non-fatal.
  }
}

/** All notes, newest first. */
export async function listNotes(): Promise<Note[]> {
  const notes = await readAll();
  return notes.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getNote(id: string): Promise<Note | null> {
  const notes = await readAll();
  return notes.find((n) => n.id === id) ?? null;
}

/** Create or update a note (matched by id). */
export async function upsertNote(note: Note): Promise<void> {
  const notes = await readAll();
  const idx = notes.findIndex((n) => n.id === note.id);
  if (idx >= 0) {
    notes[idx] = note;
  } else {
    notes.push(note);
  }
  await writeAll(notes);
}

export async function deleteNote(id: string): Promise<void> {
  const notes = await readAll();
  await writeAll(notes.filter((n) => n.id !== id));
}

/** Fresh id for a new note. */
export function newNoteId(): string {
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
