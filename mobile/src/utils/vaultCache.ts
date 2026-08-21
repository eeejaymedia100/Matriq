import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";

/**
 * Vault offline cache.
 *
 * Two layers, both stored in the app's persistent document directory so they
 * survive restarts and work with no internet:
 *   1. The last search/list results (item metadata) — so the Vault paints
 *      instantly and keeps showing items when the network drops.
 *   2. Previously downloaded files — so re-opening a download shares the
 *      saved copy without hitting the network (real offline access).
 *
 * The web build has no persistent filesystem for this, so every function
 * degrades to a no-op / null — the web Vault path downloads via the JSON
 * endpoint and the browser save sheet instead.
 */

const CACHE_DIR_NAME = "matriq-vault";
const SEARCH_FILE = "vault-search.json";
const INDEX_FILE = "vault-index.json";

const NATIVE = Platform.OS !== "web";

export interface CachedVaultFile {
  /** Persistent local file uri. */
  uri: string;
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
  cachedAt: number;
}

type VaultIndex = Record<string, CachedVaultFile>;

function vaultDir(): Directory | null {
  if (!NATIVE) return null;
  try {
    const dir = new Directory(Paths.document, CACHE_DIR_NAME);
    if (!dir.exists) {
      dir.create({ idempotent: true, intermediates: true });
    }
    return dir;
  } catch {
    return null;
  }
}

// ── Metadata cache (search results) ───────────────────────────

export async function cacheVaultSearch(items: unknown[]): Promise<void> {
  if (!NATIVE) return;
  const dir = vaultDir();
  if (!dir) return;
  try {
    const file = new File(dir, SEARCH_FILE);
    file.write(JSON.stringify(items)); // append:false — overwrites by default
  } catch {
    // Best-effort — a failed cache write never breaks the app.
  }
}

export async function readCachedVaultSearch(): Promise<unknown[] | null> {
  if (!NATIVE) return null;
  const dir = vaultDir();
  if (!dir) return null;
  try {
    const file = new File(dir, SEARCH_FILE);
    if (!file.exists) return null;
    const parsed = JSON.parse(await file.text());
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ── Downloaded-file cache ─────────────────────────────────────

function indexFile(): File | null {
  const dir = vaultDir();
  if (!dir) return null;
  return new File(dir, INDEX_FILE);
}

async function readIndex(): Promise<VaultIndex> {
  const file = indexFile();
  if (!file || !file.exists) return {};
  try {
    const parsed = JSON.parse(await file.text()) as VaultIndex;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeIndex(index: VaultIndex): Promise<void> {
  const file = indexFile();
  if (!file) return;
  try {
    file.write(JSON.stringify(index)); // overwrites by default
  } catch {
    // Best-effort.
  }
}

function cacheKey(itemId: string, variant: string): string {
  return `${itemId}:${variant}`;
}

/** Persistent destination for a vault file (null on web). */
export function vaultFileDestination(
  itemId: string,
  variant: string,
  fileName: string,
): File | null {
  if (!NATIVE) return null;
  const dir = vaultDir();
  if (!dir) return null;
  // Strip anything that isn't a safe filename char (server names can carry
  // slashes/spaces that break a file path).
  const safe = fileName.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return new File(dir, `${itemId}-${variant}-${safe}`);
}

/** The saved copy for an item+variant, if one exists locally. */
export async function cachedVaultFile(
  itemId: string,
  variant: string,
): Promise<CachedVaultFile | null> {
  const index = await readIndex();
  return index[cacheKey(itemId, variant)] ?? null;
}

/** Record a freshly downloaded file so it can be reopened offline. */
export async function rememberVaultFile(
  itemId: string,
  variant: string,
  entry: CachedVaultFile,
): Promise<void> {
  const index = await readIndex();
  index[cacheKey(itemId, variant)] = entry;
  await writeIndex(index);
}
