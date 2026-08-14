import { getItem, setItem } from "./storage";

/**
 * My materials (spec §9 #4) — the student's own saved books & notes,
 * distinct from the shared Vault. This stage stores lightweight local
 * entries (title/course/kind + a file reference when the picker provides
 * one); cloud sync for the Vault lands with the backend upload work.
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
    { ...m, id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, addedAt: Date.now() },
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
