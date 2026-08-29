import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { api } from "../api/client";

/**
 * Chunked upload for large documents (Vault, spec: a student may upload a
 * ~200 MB file). The whole file is NEVER loaded into JavaScript memory:
 *
 *  - native: each ~4 MB chunk is read straight off disk as base64
 *    (FileSystem.readAsStringAsync with position/length), converted to a
 *    Blob and sent as its own multipart request.
 *  - web: the picked blob: URI is fetched once and sliced per chunk (a real
 *    browser File.slice — no base64, no memory spike).
 *
 * Each chunk POSTs to /vault/upload/chunk with the same uploadId; the server
 * overwrites a chunk when the same index is re-sent, so retrying after a
 * failure naturally resumes from where it stopped. Returns the uploadId to
 * hand to /vault/upload/complete.
 */

export const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB
/** Files over this size use the chunked path instead of the single upload. */
export const CHUNKED_UPLOAD_THRESHOLD = 12 * 1024 * 1024; // 12 MB

export interface ChunkedUploadResult {
  uploadId: string;
  totalChunks: number;
}

export interface ChunkedUploadOptions {
  uri: string;
  fileName: string;
  mimeType: string;
  totalBytes: number;
  /** Fired after each chunk with the fraction complete (0..1). */
  onProgress?: (fraction: number) => void;
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function uploadInChunks(
  options: ChunkedUploadOptions,
): Promise<ChunkedUploadResult> {
  const { uri, fileName, mimeType, totalBytes, onProgress } = options;
  const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const totalChunks = Math.max(1, Math.ceil(totalBytes / CHUNK_SIZE));

  let webBlob: Blob | null = null;
  if (Platform.OS === "web") {
    webBlob = await (await fetch(uri)).blob();
  }

  for (let i = 0; i < totalChunks; i += 1) {
    const start = i * CHUNK_SIZE;
    const length = Math.min(CHUNK_SIZE, totalBytes - start);

    const formData = new FormData();
    if (Platform.OS === "web" && webBlob) {
      const part = webBlob.slice(start, start + length);
      formData.append("file", part, `${fileName}.part${i}`);
    } else {
      // Read only this chunk from disk — the rest of the file never enters memory.
      const b64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
        position: start,
        length,
      });
      const bytes = base64ToUint8Array(b64);
      // Copy into a plain ArrayBuffer — Blob parts must be a real ArrayBuffer,
      // not a SharedArrayBuffer-typed view.
      const ab = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(ab).set(bytes);
      formData.append(
        "file",
        new Blob([ab], { type: mimeType }),
        `${fileName}.part${i}`,
      );
    }
    formData.append("uploadId", uploadId);
    formData.append("index", String(i));
    formData.append("total", String(totalChunks));

    await api.upload("/vault/upload/chunk", formData);
    onProgress?.((i + 1) / totalChunks);
  }

  return { uploadId, totalChunks };
}
