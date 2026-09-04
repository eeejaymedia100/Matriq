import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";

/**
 * Reflow highlights + reading position — private, on-device, offline-first
 * (same storage contract as notes.ts: one JSON file per concern, best-effort
 * every call, web falls back to localStorage).
 *
 * Highlights reference their source document by id and carry the block index
 * + quoted text, so they survive re-extraction (quote matching) and can be
 * converted to a note with citation ("CHM 101 — Lecture 3, block 12").
 */

export interface ReflowHighlight {
  id: string;
  /** Vault item id (or library item id / deep-read job id). */
  docId: string;
  /** Reflow block index the highlight sits on. */
  blockIndex: number;
  /** The exact highlighted text. */
  quote: string;
  /** Bookkeeping for quote-matching after re-extraction. */
  blockTextStart: number;
  createdAt: number;
  color: "lime" | "brand" | "warning";
}

export interface ReflowPosition {
  blockIndex: number;
  updatedAt: number;
}

const NATIVE = Platform.OS !== "web";
const DIR_NAME = "matriq-reflow";
const FILE_NAME = "highlights.json";
const WEB_KEY = "matriq_reflow_highlights";

interface StoreShape {
  highlights: ReflowHighlight[];
  positions: Record<string, ReflowPosition>;
}

function emptyStore(): StoreShape {
  return { highlights: [], positions: {} };
}

function storeFile(): File | null {
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

async function readStore(): Promise<StoreShape> {
  try {
    if (NATIVE) {
      const file = storeFile();
      if (!file?.exists) return emptyStore();
      const parsed = JSON.parse(await file.text()) as StoreShape;
      return parsed;
    }
    const raw = localStorage.getItem(WEB_KEY);
    return raw ? (JSON.parse(raw) as StoreShape) : emptyStore();
  } catch {
    return emptyStore();
  }
}

async function writeStore(store: StoreShape): Promise<void> {
  try {
    if (NATIVE) {
      const file = storeFile();
      if (!file) return;
      file.write(JSON.stringify(store));
      return;
    }
    localStorage.setItem(WEB_KEY, JSON.stringify(store));
  } catch {
    // Storage failure must never break reading.
  }
}

export function newHighlightId(): string {
  return `hl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getHighlights(docId: string): Promise<ReflowHighlight[]> {
  const store = await readStore();
  return store.highlights
    .filter((h) => h.docId === docId)
    .sort((a, b) => a.blockIndex - b.blockIndex || a.blockTextStart - b.blockTextStart);
}

export async function addHighlight(
  highlight: Omit<ReflowHighlight, "id" | "createdAt">,
): Promise<ReflowHighlight> {
  const store = await readStore();
  const full: ReflowHighlight = {
    ...highlight,
    id: newHighlightId(),
    createdAt: Date.now(),
  };
  store.highlights.push(full);
  await writeStore(store);
  return full;
}

export async function removeHighlight(id: string): Promise<void> {
  const store = await readStore();
  store.highlights = store.highlights.filter((h) => h.id !== id);
  await writeStore(store);
}

export async function savePosition(docId: string, blockIndex: number): Promise<void> {
  const store = await readStore();
  store.positions[docId] = { blockIndex, updatedAt: Date.now() };
  await writeStore(store);
}

export async function getPosition(docId: string): Promise<ReflowPosition | null> {
  const store = await readStore();
  return store.positions[docId] ?? null;
}

/** All highlight rows for a document — joined into note text with citations. */
export function highlightsToNoteBody(
  highlights: ReflowHighlight[],
  sourceLabel: string,
): string {
  return highlights
    .map((h, i) => `${i + 1}. "${h.quote}"\n   — ${sourceLabel}`)
    .join("\n\n");
}

// ── Reader settings (font scale) ───────────────────────────

const FONT_KEY = "matriq_reflow_font_scale";
export const FONT_SCALE_MIN = 15;
export const FONT_SCALE_MAX = 26;
export const FONT_SCALE_DEFAULT = 17;

export async function getReaderFontScale(): Promise<number> {
  try {
    let raw: string | null = null;
    if (NATIVE) {
      const { getItem } = await import("./storage");
      raw = await getItem(FONT_KEY);
    } else {
      raw = localStorage.getItem(FONT_KEY);
    }
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n >= FONT_SCALE_MIN && n <= FONT_SCALE_MAX
      ? n
      : FONT_SCALE_DEFAULT;
  } catch {
    return FONT_SCALE_DEFAULT;
  }
}

export async function saveReaderFontScale(scale: number): Promise<void> {
  try {
    const clamped = Math.max(FONT_SCALE_MIN, Math.min(FONT_SCALE_MAX, Math.round(scale)));
    if (NATIVE) {
      const { setItem } = await import("./storage");
      await setItem(FONT_KEY, String(clamped));
    } else {
      localStorage.setItem(FONT_KEY, String(clamped));
    }
  } catch {
    /* never break reading over a setting */
  }
}
