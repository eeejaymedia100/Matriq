import { getItem, setItem } from "./storage";

/**
 * My materials (spec §9 #4) — the student's own saved books & notes,
 * distinct from the shared Vault. Stored entirely on-device: the offline AI
 * reads these files (with the student's explicit picker permission) to answer
 * questions about their own study material — no upload, no internet.
 *
 * `text` holds the extracted plain text (from a .txt/.md file directly, or a
 * PDF/DOCX/photo via the extraction/OCR paths). `textStatus` says whether the
 * text is usable by the AI yet:
 *  - "ready"   → the AI can use it right now, offline
 *  - "pending" → saved, but text extraction still needs a connection
 *  - "failed"  → extraction was attempted and couldn't be read
 */
export interface Material {
  id: string;
  title: string;
  course?: string;
  kind: "document" | "image" | "note";
  /** Optional file reference returned by the picker. */
  uri?: string;
  sizeLabel?: string;
  addedAt: number;
  /** Extracted plain text the offline AI can read (empty until extracted). */
  text?: string;
  textStatus?: "ready" | "pending" | "failed";
}

const MATERIALS_KEY = "my_materials";

export async function getMaterials(): Promise<Material[]> {
  try {
    const raw = await getItem(MATERIALS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Material[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function addMaterial(
  m: Omit<Material, "id" | "addedAt">,
): Promise<Material[]> {
  const next = [
    {
      ...m,
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      addedAt: Date.now(),
    },
    ...(await getMaterials()),
  ];
  await setItem(MATERIALS_KEY, JSON.stringify(next));
  return next;
}

export async function removeMaterial(id: string): Promise<Material[]> {
  const next = (await getMaterials()).filter((m) => m.id !== id);
  await setItem(MATERIALS_KEY, JSON.stringify(next));
  return next;
}

/** Update one material in place (e.g. attach extracted text after OCR). */
export async function updateMaterial(
  id: string,
  patch: Partial<Omit<Material, "id" | "addedAt">>,
): Promise<Material[]> {
  const next = (await getMaterials()).map((m) =>
    m.id === id ? { ...m, ...patch } : m,
  );
  await setItem(MATERIALS_KEY, JSON.stringify(next));
  return next;
}

/** Convenience: mark a material's extracted text as ready (or failed). */
export async function setMaterialText(
  id: string,
  text: string,
  status: "ready" | "failed",
): Promise<Material[]> {
  return updateMaterial(id, {
    text,
    textStatus: status,
  });
}
