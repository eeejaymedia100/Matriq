import { getDb } from "./db";
import type { Note } from "../utils/notes";

/**
 * Notes repository — SQLite-backed successor to the single notes.json file.
 * One row per note: bodies are user-typed prose (a semester of notes easily
 * outgrows comfortable JSON round-trips), and per-row writes mean saving one
 * note no longer serializes the whole collection.
 *
 * Same shape and ordering contract as utils/notes (newest-updated first).
 */

function rowToNote(row: {
  id: string;
  title: string;
  body: string;
  created_at: number;
  updated_at: number;
  meta_json: string | null;
}): Note {
  let meta: Note["meta"];
  if (row.meta_json) {
    try {
      meta = JSON.parse(row.meta_json) as Note["meta"];
    } catch {
      meta = undefined;
    }
  }
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    meta,
  };
}

export async function listNotes(): Promise<Note[]> {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<{
      id: string;
      title: string;
      body: string;
      created_at: number;
      updated_at: number;
      meta_json: string | null;
    }>("SELECT * FROM notes ORDER BY updated_at DESC");
    return rows.map(rowToNote);
  } catch {
    const { listNotes: legacy } = await import("../utils/notes");
    return legacy();
  }
}

export async function getNote(id: string): Promise<Note | null> {
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{
      id: string;
      title: string;
      body: string;
      created_at: number;
      updated_at: number;
      meta_json: string | null;
    }>("SELECT * FROM notes WHERE id = ?", [id]);
    return row ? rowToNote(row) : null;
  } catch {
    const { getNote: legacy } = await import("../utils/notes");
    return legacy(id);
  }
}

/** Create or update a note (matched by id). */
export async function upsertNote(note: Note): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO notes (id, title, body, created_at, updated_at, meta_json)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       body = excluded.body,
       updated_at = excluded.updated_at,
       meta_json = excluded.meta_json`,
    [
      note.id,
      note.title,
      note.body,
      note.createdAt,
      note.updatedAt,
      note.meta ? JSON.stringify(note.meta) : null,
    ],
  );
}

export async function deleteNote(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM notes WHERE id = ?", [id]);
}

/** Fresh id for a new note (same format as utils/notes). */
export function newNoteId(): string {
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * One-time importer from the legacy notes.json file. Copy-only: the legacy
 * file remains until rows are confirmed written; re-runs skip existing ids.
 */
export async function importNotesFromLegacy(
  db: Awaited<ReturnType<typeof getDb>>,
): Promise<number> {
  const { listNotes: legacy } = await import("../utils/notes");
  const legacyNotes = await legacy();
  let imported = 0;
  for (const n of legacyNotes) {
    const existing = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM notes WHERE id = ?",
      [n.id],
    );
    if (existing) continue;
    await db.runAsync(
      `INSERT INTO notes (id, title, body, created_at, updated_at, meta_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        n.id,
        n.title,
        n.body,
        n.createdAt,
        n.updatedAt,
        n.meta ? JSON.stringify(n.meta) : null,
      ],
    );
    imported += 1;
  }
  return imported;
}
