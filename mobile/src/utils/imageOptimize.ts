import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "react-native";

/**
 * Client-side image optimization for uploads (spec: never push a raw phone
 * photo to the backend).
 *
 * Phone photos are often 3000×4000 and several MB. Uploading them raw hits
 * the backend payload limit and can cause out-of-memory crashes on low-end
 * Androids when the server decodes them. So before any upload we:
 *  - resize so the longest side is at most 1200px (small photos are NOT
 *    upscaled — that would only add bytes and blur),
 *  - re-encode as JPEG at 0.7 quality (a 1200px JPEG is usually ~100-400KB).
 *
 * The result URI is a real file:// path in the app cache (expo-image-manipulator
 * guarantees this on Android), which is exactly what FormData needs — no
 * content:// or ph:// weirdness.
 *
 * Best-effort by design: if optimization fails for any reason we return the
 * original URI so OCR still works — a slightly heavier upload beats a broken
 * feature. The only hard stop is the pre-upload size guard in the screens.
 */

export const MAX_UPLOAD_WIDTH = 1200;
export const JPEG_QUALITY = 0.7;
/** Must stay under the backend multer cap for the tools routes (11 MB). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Long-edge cap for OCR uploads. Handwriting is thin-stroke detail — a
 * 1200px cap (the general upload default) smears pen strokes before the
 * server ever sees them, so Deep Read uses a higher-fidelity profile.
 */
export const MAX_OCR_WIDTH = 2048;

export interface OptimizedImage {
  uri: string;
  fileName: string;
  /** Size on disk in bytes; 0 when it couldn't be read (e.g. web). */
  bytes: number;
}

function getImageSize(
  uri: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Could not read image size (timeout)")),
      8000,
    );
    Image.getSize(
      uri,
      (width, height) => {
        clearTimeout(timer);
        resolve({ width, height });
      },
      (err) => {
        clearTimeout(timer);
        reject(err ?? new Error("Could not read image size"));
      },
    );
  });
}

export interface OptimizeOptions {
  /** Known dimensions (expo-image-picker returns them) — skips Image.getSize. */
  knownSize?: { width: number; height: number };
  /**
   * When set, files under this many bytes are returned untouched. Use where
   * the "original file" matters (e.g. the Vault keeps originals pristine and
   * makes a light copy itself) so small uploads aren't needlessly re-encoded.
   */
  skipUnderBytes?: number;
}

/**
 * Resize (longest side ≤ 1200px) + re-encode to JPEG 0.7. Pass the asset's
 * known width/height (expo-image-picker returns them) to skip the extra
 * Image.getSize round-trip.
 *
 * `maxDimension` overrides the long-edge cap: Deep Read captures pass 2048
 * to preserve handwriting stroke detail (see MAX_OCR_WIDTH).
 */
export async function optimizeImageForUpload(
  uri: string,
  fileName: string,
  options: OptimizeOptions & { maxDimension?: number } = {},
): Promise<OptimizedImage> {
  const { knownSize, skipUnderBytes, maxDimension } = options;
  const cap = maxDimension ?? MAX_UPLOAD_WIDTH;
  try {
    // Keep small originals untouched (e.g. Vault's "original is kept
    // pristine" promise) — only compress files that actually need it.
    if (skipUnderBytes && skipUnderBytes > 0) {
      const info = await FileSystem.getInfoAsync(uri).catch(() => null);
      if (
        info?.exists === true &&
        typeof info.size === "number" &&
        info.size < skipUnderBytes
      ) {
        return { uri, fileName, bytes: info.size };
      }
    }

    const size = knownSize ?? (await getImageSize(uri).catch(() => null));
    const width = size?.width ?? 0;
    const height = size?.height ?? 0;

    const actions: ImageManipulator.Action[] = [];
    if (width > cap) {
      actions.push({ resize: { width: cap } });
    } else if (height > cap) {
      // Pathological tall crops (e.g. 900×4000) — bound the long side too.
      actions.push({ resize: { height: cap } });
    }

    const result = await ImageManipulator.manipulateAsync(uri, actions, {
      compress: JPEG_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    });

    const info = await FileSystem.getInfoAsync(result.uri).catch(() => null);
    const base = (fileName ?? "photo.jpg").replace(/\.[^.]+$/, "") || "photo";
    return {
      uri: result.uri,
      fileName: `${base}.jpg`,
      bytes: info?.exists === true && typeof info.size === "number" ? info.size : 0,
    };
  } catch {
    // Best-effort fallback: send the original so the feature never breaks.
    return { uri, fileName, bytes: 0 };
  }
}
