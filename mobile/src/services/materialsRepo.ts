import { getDb } from "./db";
import type { Material } from "../utils/materials";

/**
 * "My materials" repository — the student's own saved books & notes, distinct
 * from the shared Vault. Stored on-device in SQLite: one row per material so
 * multi-page extracted text no longer rewrites (or depends on the size limits
 * of) a single key-value JSON blob.
 *
 * `text` holds the extracted plain text (from a .txt/.md file directly, or a
 * PDF/DOCX/photo via the extraction/OCR paths). `textStatus` says whether the
 * text is usable by the AI yet:
 *  - "ready"   → the AI can use it right now, offline
 *  - "pending" → saved, but text extraction still needs a connection
 *  - "failed"  → extraction was attempted and couldn't be read
 *
 * The public API intentionally mirrors utils/materials (same Material shape,
 * array-returning mutators) so callers migrate by changing the import only.
 */

function rowToMaterial(row: {
  id: string;
  title: string;
  course: string | null;
  kind: string;
  uri: string | null;
  sizeLabel: string | null;
  added_at: number;
  text_status: string | null;
  text_content: string | null;
}): Material {
  return {
    id: row.id,
    title: row.title,
    course: row.course ?? undefined,
    kind: row.kind as Material["kind"],
    uri: row.uri ?? undefined,
    sizeLabel: row.sizeLabel ?? undefined,
    addedAt: row.added_at,
    text: row.text_content ?? undefined,
    textStatus:
      row.text_status === "ready" || row.text_status === "failed"
        ? row.text_status
        : row.text_status === "pending"
          ? "pending"
          : undefined,
  };
}

export async function getMaterials(): Promise<Material[]> {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<
      Parameters<typeof rowToMaterial>[0]
    >("SELECT * FROM materials ORDER BY added_at DESC");
    return rows.map(rowToMaterial);
  } catch {
    // DB unavailable — fall back to the legacy store so nothing is lost.
    const { getMaterials: legacy } = await import("../utils/materials");
    return legacy();
  }
}

export async function addMaterial(
  m: Omit<Material, "id" | "addedAt">,
): Promise<Material[]> {
  const db = await getDb();
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const addedAt = Date.now();
  await db.runAsync(
    `INSERT INTO materials (id, title, course, kind, uri, sizeLabel, added_at, text_status, text_content)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      m.title,
      m.course ?? null,
      m.kind,
      m.uri ?? null,
      m.sizeLabel ?? null,
      addedAt,
      m.textStatus ?? null,
      m.text ?? null,
    ],
  );
  return getMaterials();
}

export async function removeMaterial(id: string): Promise<Material[]> {
  const db = await getDb();
  await db.runAsync("DELETE FROM materials WHERE id = ?", [id]);
  return getMaterials();
}

/** Update one material in place (e.g. attach extracted text after OCR). */
export async function updateMaterial(
  id: string,
  patch: Partial<Omit<Material, "id" | "addedAt">>,
): Promise<Material[]> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE materials SET
       title = COALESCE(?, title),
       course = COALESCE(?, course),
       uri = COALESCE(?, uri),
       sizeLabel = COALESCE(?, sizeLabel),
       text_status = COALESCE(?, text_status),
       text_content = COALESCE(?, text_content)
     WHERE id = ?`,
    [
      patch.title ?? null,
      patch.course ?? null,
      patch.uri ?? null,
      patch.sizeLabel ?? null,
      patch.textStatus ?? null,
      patch.text ?? null,
      id,
    ],
  );
  return getMaterials();
}

/** Convenience: mark a material's extracted text as ready (or failed). */
export async function setMaterialText(
  id: string,
  text: string,
  status: "ready" | "failed",
): Promise<Material[]> {
  return updateMaterial(id, { text, textStatus: status });
}

/**
 * One-time importer from the legacy JSON-in-SecureStore store. Copy-only:
 * the legacy data stays untouched until every row is confirmed written, so
 * an interrupted migration simply re-runs from scratch on the next launch.
 */
export async function importMaterialsFromLegacy(
  db: Awaited<ReturnType<typeof getDb>>,
): Promise<number> {
  const { getMaterials: legacy } = await import("../utils/materials");
  const legacyMaterials = await legacy();
  let imported = 0;
  for (const m of legacyMaterials) {
    const existing = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM materials WHERE id = ?",
      [m.id],
    );
    if (existing) continue;
    await db.runAsync(
      `INSERT INTO materials (id, title, course, kind, uri, sizeLabel, added_at, text_status, text_content)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        m.id,
        m.title,
        m.course ?? null,
        m.kind,
        m.uri ?? null,
        m.sizeLabel ?? null,
        m.addedAt,
        m.textStatus ?? null,
        m.text ?? null,
      ],
    );
    imported += 1;
  }
  return imported;
}
