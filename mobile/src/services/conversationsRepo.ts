import { getDb } from "./db";
import type { Conversation } from "../offline/history";

/**
 * AI conversation history repository. One row per conversation instead of a
 * single JSON file that is fully rewritten (and fully re-read) on every chat
 * exchange — transcripts are exactly the kind of content that grows past the
 * point where whole-file JSON round-trips stay cheap.
 *
 * Same shape and ordering contract as offline/history (newest first, capped).
 */

const MAX_CONVERSATIONS = 50;

function rowToConversation(row: {
  id: string;
  title: string;
  updated_at: number;
  messages_json: string;
}): Conversation {
  let messages: Conversation["messages"] = [];
  try {
    const parsed = JSON.parse(row.messages_json) as Conversation["messages"];
    if (Array.isArray(parsed)) messages = parsed;
  } catch {
    // A corrupt transcript degrades to an empty conversation, never a crash.
  }
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at,
    messages,
  };
}

export async function listConversations(): Promise<Conversation[]> {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<{
      id: string;
      title: string;
      updated_at: number;
      messages_json: string;
    }>("SELECT id, title, updated_at, messages_json FROM conversations ORDER BY updated_at DESC");
    return rows.map(rowToConversation);
  } catch {
    const { loadHistory } = await import("../offline/history");
    return loadHistory();
  }
}

export async function getConversation(
  id: string,
): Promise<Conversation | null> {
  const all = await listConversations();
  return all.find((c) => c.id === id) ?? null;
}

/** Upsert a conversation (newest first, capped). */
export async function saveConversation(conv: Conversation): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO conversations (id, title, updated_at, messages_json)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       updated_at = excluded.updated_at,
       messages_json = excluded.messages_json`,
    [conv.id, conv.title, conv.updatedAt, JSON.stringify(conv.messages)],
  );
  // Keep growth bounded — same cap semantics as the legacy file store.
  await db.runAsync(
    `DELETE FROM conversations WHERE id IN (
       SELECT id FROM conversations ORDER BY updated_at DESC LIMIT -1 OFFSET ?
     )`,
    [MAX_CONVERSATIONS],
  );
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM conversations WHERE id = ?", [id]);
}

/**
 * One-time importer from the legacy JSON file (document dir). Copy-only —
 * the legacy file stays in place until the rows are confirmed written.
 */
export async function importConversationsFromLegacy(
  db: Awaited<ReturnType<typeof getDb>>,
): Promise<number> {
  const { loadHistory } = await import("../offline/history");
  const legacyConversations = await loadHistory();
  let imported = 0;
  for (const c of legacyConversations) {
    const existing = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM conversations WHERE id = ?",
      [c.id],
    );
    if (existing) continue;
    await db.runAsync(
      `INSERT INTO conversations (id, title, updated_at, messages_json)
       VALUES (?, ?, ?, ?)`,
      [c.id, c.title, c.updatedAt, JSON.stringify(c.messages)],
    );
    imported += 1;
  }
  return imported;
}
