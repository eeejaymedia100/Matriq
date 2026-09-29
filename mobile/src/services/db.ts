import * as SQLite from "expo-sqlite";

/**
 * Project-wide local database (SQLite via expo-sqlite).
 *
 * SQLite is embedded in every native app build — it is the durable,
 * queryable store for user data that outgrew single JSON values:
 *  - rows instead of whole-collection rewrites (write only what changed)
 *  - indexed lookups + capped growth instead of unbounded JSON parse/serialize
 *  - multi-MB text (extracted material text, AI transcripts) that must not sit
 *    in key-value storage (SecureStore is Keystore-backed on Android and
 *    rejects/loses oversized values silently)
 *
 * Policy (what goes where):
 *  - utils/storage.ts (SecureStore / localStorage) → small config + secrets.
 *  - services/db.ts (SQLite) → structured user data + large text.
 *  - files on disk (expo-file-system) → large binaries (models, uploads).
 *
 * Web build: expo-sqlite runs on SQLite-WASM (Origin Private File System),
 * so the same schema and queries work everywhere. All calls stay async.
 */

const DB_NAME = "matriq.db";

let instance: SQLite.SQLiteDatabase | null = null;
let openPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * The DB file lives in the app's private storage and holds no secrets
 * (tokens and the passcode stay in SecureStore) — so it opens unencrypted.
 * expo-sqlite's SDK 57 API has no SQLCipher hook; if at-rest encryption of
 * this data is ever required, add expo-filesystem's per-path protection or
 * swap in a SQLCipher-based fork deliberately.
 */
async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  return SQLite.openDatabaseAsync(DB_NAME, { enableChangeListener: false });
}

/**
 * The shared app database. Lazily opened once per app session, WAL mode for
 * concurrent reads during writes, and migrations applied idempotently.
 * Throws only when the platform genuinely has no storage — screens already
 * treat persistence as best-effort.
 */
export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (instance) return instance;
  if (!openPromise) {
    openPromise = (async () => {
      const db = await openDatabase();
      await db.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
      await migrate(db);
      instance = db;
      return db;
    })().catch((err) => {
      // Reset so a transient failure (e.g. disk briefly busy) can retry.
      openPromise = null;
      throw err;
    });
  }
  return openPromise;
}

let migrated = false;

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  if (migrated) return;
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      course TEXT,
      kind TEXT NOT NULL,
      uri TEXT,
      sizeLabel TEXT,
      added_at INTEGER NOT NULL,
      text_status TEXT,
      text_content TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_materials_added ON materials (added_at DESC);

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      messages_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations (updated_at DESC);

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      meta_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes (updated_at DESC);
  `);
  await migrateLegacyData(db);
  migrated = true;
}

/** Schema version marker — bump and add an idempotent block per change. */
const SCHEMA_VERSION = 1;

// Reserved for future migrations: read meta.schema_version, apply blocks in
// order, write back. v1 tables are CREATE IF NOT EXISTS so the initial run is
// safe on both fresh and existing installs.
void SCHEMA_VERSION;

/**
 * One-time import from the legacy stores (JSON-in- SecureStore / a file):
 * runs inside a transaction the first time the DB opens on a device that has
 * old data, then sets the done-flag so it never runs again. Non-fatal on any
 * error — the legacy modules still work, so worst case we retry next launch.
 */
async function migrateLegacyData(db: SQLite.SQLiteDatabase): Promise<void> {
  const done = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM meta WHERE key = 'legacy_import_done'",
  );
  if (done) return;

  try {
    const { importMaterialsFromLegacy } = await import("./repositories");
    const { importConversationsFromLegacy } = await import("./repositories");
    const { importNotesFromLegacy } = await import("./repositories");
    await db.withTransactionAsync(async () => {
      await importMaterialsFromLegacy(db);
      await importConversationsFromLegacy(db);
      await importNotesFromLegacy(db);
      await db.runAsync(
        "INSERT INTO meta (key, value) VALUES ('legacy_import_done', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [new Date().toISOString()],
      );
    });
  } catch {
    // Import is best-effort; legacy modules remain the fallback readers.
  }
}
