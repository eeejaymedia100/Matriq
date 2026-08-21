import { NativeModules, Platform } from "react-native";

/**
 * Offline OCR — the bundled Google ML Kit text-recognition model
 * (`com.google.mlkit:text-recognition`, statically linked via
 * `@react-native-ml-kit/text-recognition`).
 *
 * The model ships inside the APK (~4 MB), so unlike the offline AI models
 * there is NOTHING to download: recognition runs entirely on-device with no
 * internet and no Google Play Services requirement. We talk to the native
 * module directly (instead of importing the package's index.ts, which ships
 * without type declarations) so the surface here is typed and web-safe.
 */

export interface OfflineOcrElement {
  text: string;
}

export interface OfflineOcrLine {
  text: string;
  elements: OfflineOcrElement[];
}

export interface OfflineOcrBlock {
  text: string;
  lines: OfflineOcrLine[];
}

export interface OfflineOcrResult {
  /** Full recognized text, line breaks preserved. */
  text: string;
  blocks: OfflineOcrBlock[];
}

interface NativeTextRecognition {
  /** @param imageURL file:// URI of the image to process. */
  recognize(imageURL: string): Promise<OfflineOcrResult>;
}

function nativeOcr(): NativeTextRecognition | null {
  if (Platform.OS === "web") return null;
  const mod = NativeModules.TextRecognition as
    | NativeTextRecognition
    | undefined;
  return mod ?? null;
}

/** True when the on-device engine is linked into this build (Android native). */
export function isOfflineOcrAvailable(): boolean {
  return nativeOcr() !== null;
}

/**
 * Recognize text on-device. Throws when the engine isn't linked or the image
 * can't be decoded — callers should fall back to the server OCR.
 */
export async function recognizeImageOffline(
  uri: string,
): Promise<OfflineOcrResult> {
  const mod = nativeOcr();
  if (!mod) {
    throw new Error("Offline OCR engine is not available in this build");
  }
  return mod.recognize(uri);
}
