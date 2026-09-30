import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

/**
 * Build a multipart file part that the current runtime actually accepts.
 *
 * Expo SDK 57's fetch is the WinterCG implementation, whose FormData
 * converter (`convertFormDataAsync`) only accepts three part shapes:
 *   - a string
 *   - a real `Blob`
 *   - an object implementing `bytes()` (e.g. expo-file-system's `File`)
 *
 * The legacy React Native pattern — appending a plain `{ uri, name, type }`
 * object — hits the `else` branch and throws
 * "Unsupported FormDataPart implementation" on every upload (profile photo,
 * verification document, vault file, OCR image, transcription audio…).
 *
 * This helper is the single place that builds a valid part:
 *   - native: wraps the file in expo-file-system's `File` (its `bytes()`
 *     method is exactly what the WinterCG converter calls). `File` also
 *     derives `name` + `type` from the URI, so the multipart part carries
 *     the correct filename and MIME type without browser-only APIs.
 *   - web: fetches the (blob:) URI and appends a real `File` for the
 *     browser's native FormData.
 *
 * Android `content://` / iOS `ph://` URIs are copied into the app cache
 * first (content URIs can't always be read back by the native file API), so
 * the part is always backed by a real `file://` path.
 */
export async function appendFileToFormData(
  formData: FormData,
  field: string,
  uri: string,
  fileName: string,
  mimeType: string,
): Promise<void> {
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    const file = new File([blob], sanitizeFileName(fileName), {
      type: mimeType || blob.type || "application/octet-stream",
    });
    formData.append(field, file);
    return;
  }

  const { File: ExpoFile } = await import("expo-file-system");
  // ALWAYS stage a copy under the caller's filename. `File` derives the
  // multipart part's filename from the URI basename, and Android document
  // pickers hand out cache names like "document" (no extension) — passing a
  // picked URI through stored every vault file as "document" with no type.
  // The staged copy guarantees the part carries the real name + extension
  // (and thus the right MIME), which is what extraction/pdf-preview key off.
  const fileUri = await stageFileForUpload(uri, fileName);
  formData.append(field, new ExpoFile(fileUri));
}

function sanitizeFileName(name: string): string {
  return (name || "file").replace(/[^\w.\-]+/g, "_");
}

/**
 * Returns a `file://` URI that ends with the caller's filename. Provider
 * URIs (Android `content://`, iOS `ph://`) are copied into the app cache;
 * plain `file://` paths are ALSO copied when their basename doesn't match
 * the intended filename (the derived multipart name must be right).
 */
async function stageFileForUpload(uri: string, fileName: string): Promise<string> {
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!dir) return uri; // No writable dir — let the upload surface the error.

  const base = uri.split("?")[0].split("/").pop() ?? "";
  const wanted = sanitizeFileName(fileName);
  const alreadyRight = uri.startsWith("file://") && base === wanted;
  if (alreadyRight) return uri;

  const target = `${dir}${Date.now().toString(36)}-${wanted}`;
  await FileSystem.copyAsync({ from: uri, to: target }).catch(() => {
    // Some provider URIs (e.g. iOS ph://) can't be copied directly; the
    // caller's error path reports the failure.
    throw new Error("Couldn't read that file for upload.");
  });
  return target;
}
