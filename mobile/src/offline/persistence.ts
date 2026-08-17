import * as FileSystem from "expo-file-system/legacy";
import { CONFIG_FILE, MODELS_DIR } from "./models";

/**
 * Small JSON persistence for offline-AI state. Stored under the app's
 * document directory (survives restarts, not cleared like the cache).
 *
 * Config shape:
 * {
 *   activeModelId: string | null,     // model the chat engine uses
 *   preferOffline: boolean,           // "always use offline AI" toggle
 *   downloaded: { [modelId]: { sizeBytes: number; downloadedAt: number } }
 * }
 */
export interface DownloadedInfo {
  sizeBytes: number;
  downloadedAt: number;
}

export interface OfflineConfig {
  activeModelId: string | null;
  preferOffline: boolean;
  downloaded: Record<string, DownloadedInfo>;
}

export const DEFAULT_CONFIG: OfflineConfig = {
  activeModelId: null,
  preferOffline: false,
  downloaded: {},
};

const EMPTY_CONFIG = JSON.stringify(DEFAULT_CONFIG);

function baseDir(): string {
  if (!FileSystem.documentDirectory) {
    throw new Error("Storage is unavailable on this device");
  }
  return FileSystem.documentDirectory;
}

export function modelsDir(): string {
  return `${baseDir()}${MODELS_DIR}`;
}

export function modelFileUri(modelId: string): string {
  return `${modelsDir()}${modelId}.gguf`;
}

/**
 * In-progress download target. Downloads stream into a `.part` file so a
 * dropped connection leaves a resumable partial on disk (never a truncated
 * file that could be mistaken for a complete model). On success the `.part`
 * is renamed to the final `modelFileUri`. `reconcileDownloads` ignores
 * `.part` files, so a resumed download is never double-counted.
 */
export function modelPartFileUri(modelId: string): string {
  return `${modelsDir()}${modelId}.gguf.part`;
}

/**
 * Ensure the models directory exists. MUST be called before any download:
 * the Android native downloader rejects targets whose parent directory
 * doesn't exist yet ("Directory for '...' doesn't exist") — the download
 * would otherwise fail instantly at 0%.
 */
export async function ensureModelsDir(): Promise<void> {
  await FileSystem.makeDirectoryAsync(modelsDir(), {
    intermediates: true,
  }).catch(() => {
    // Directory already exists — fine.
  });
}

export async function loadConfig(): Promise<OfflineConfig> {
  try {
    const raw = await FileSystem.readAsStringAsync(
      `${baseDir()}${CONFIG_FILE}`,
    );
    const parsed = JSON.parse(raw) as Partial<OfflineConfig>;
    return {
      activeModelId: parsed.activeModelId ?? null,
      preferOffline: parsed.preferOffline ?? false,
      downloaded: parsed.downloaded ?? {},
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(config: OfflineConfig): Promise<void> {
  await FileSystem.makeDirectoryAsync(`${baseDir()}matriq-offline-ai/`, {
    intermediates: true,
  }).catch(() => {});
  await FileSystem.writeAsStringAsync(
    `${baseDir()}${CONFIG_FILE}`,
    JSON.stringify(config),
  );
}

/**
 * Detect leftover model files that aren't in the config (e.g. after a reinstall
 * where config.json was lost) and adopt them back.
 */
export async function reconcileDownloads(
  config: OfflineConfig,
): Promise<OfflineConfig> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(modelsDir());
    if (!dirInfo.exists || !dirInfo.isDirectory) return config;
    const entries = await FileSystem.readDirectoryAsync(modelsDir());
    for (const entry of entries) {
      // Only complete `.gguf` files count — a `.gguf.part` in progress must
      // never be adopted as a finished model.
      if (!entry.endsWith(".gguf")) continue;
      const id = entry.replace(/\.gguf$/, "");
      if (!id || config.downloaded[id]) continue;
      const info = await FileSystem.getInfoAsync(`${modelsDir()}${entry}`);
      if (info.exists && info.size) {
        config.downloaded[id] = {
          sizeBytes: info.size,
          downloadedAt: Date.now(),
        };
      }
    }
    if (config.activeModelId && !config.downloaded[config.activeModelId]) {
      config.activeModelId = null;
    }
  } catch {
    // Nothing to reconcile — ignore.
  }
  return config;
}

export async function deleteModelFile(modelId: string): Promise<void> {
  await FileSystem.deleteAsync(modelFileUri(modelId), {
    idempotent: true,
  }).catch(() => {});
  // Also remove any in-progress partial download.
  await FileSystem.deleteAsync(modelPartFileUri(modelId), {
    idempotent: true,
  }).catch(() => {});
}

export async function getFreeSpaceBytes(): Promise<number | null> {
  try {
    return await FileSystem.getFreeDiskStorageAsync();
  } catch {
    return null;
  }
}

