import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { api } from "../api/client";
import { appendFileToFormData } from "../utils/upload";
import {
  isOfflineOcrAvailable,
  recognizeImageOffline,
} from "./ocr";

/**
 * Turn a picked study file into plain text for the offline AI.
 *
 * - .txt / .md → read straight from disk (fully offline).
 * - images → recognized on-device via the bundled ML Kit engine (offline);
 *   falls back to the server OCR on web or when the native engine fails.
 * - PDF / DOCX → extracted server-side once (pdf-parse / mammoth), then the
 *   text is cached on the device so the AI can use it forever, fully offline.
 *
 * Returns `{ text, source, offline }` or `{ text: "", source: "none" }`.
 */
export interface ExtractResult {
  text: string;
  source: "text" | "ocr" | "pdf" | "docx" | "none";
  /** True when this extraction needed no internet. */
  offline: boolean;
}

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".log"]);

export async function extractFileText(
  uri: string,
  fileName: string,
  mimeType: string,
): Promise<ExtractResult> {
  const name = (fileName ?? uri.split("/").pop() ?? "").toLowerCase();

  // Plain text / markdown: read locally — always offline-capable.
  if (
    mimeType.startsWith("text/") ||
    TEXT_EXTENSIONS.has(name.slice(name.lastIndexOf("."))) ||
    name.endsWith(".txt") ||
    name.endsWith(".md")
  ) {
    try {
      const raw = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const text = raw.replace(/\r\n/g, "\n").trim();
      return {
        text: text.slice(0, 50_000),
        source: text ? "text" : "none",
        offline: true,
      };
    } catch {
      return { text: "", source: "none", offline: true };
    }
  }

  // Images: offline ML Kit OCR first, then the server.
  if (mimeType.startsWith("image/") || /\.(jpe?g|png|webp)$/.test(name)) {
    if (isOfflineOcrAvailable() && Platform.OS !== "web") {
      try {
        const res = await recognizeImageOffline(uri);
        const text = (res.text ?? "").trim();
        return {
          text: text.slice(0, 50_000),
          source: text ? "ocr" : "none",
          offline: true,
        };
      } catch {
        // Fall through to the server path.
      }
    }
    return extractViaServer(uri, fileName, mimeType);
  }

  // PDF / DOCX / anything else: server extraction (needs a connection once).
  if (mimeType === "application/pdf" || name.endsWith(".pdf")) {
    return extractViaServer(uri, fileName, mimeType);
  }
  if (
    mimeType.includes("wordprocessingml") ||
    name.endsWith(".docx") ||
    name.endsWith(".doc")
  ) {
    return extractViaServer(uri, fileName, mimeType);
  }

  return { text: "", source: "none", offline: true };
}

async function extractViaServer(
  uri: string,
  fileName: string,
  mimeType: string,
): Promise<ExtractResult> {
  try {
    const formData = new FormData();
    await appendFileToFormData(
      formData,
      "file",
      uri,
      fileName || "file",
      mimeType || "application/octet-stream",
    );
    const data = await api.upload<{
      text: string;
      source: "pdf" | "docx" | "text" | "ocr" | "none";
    }>("/tools/extract-text", formData);
    return {
      text: data.text ?? "",
      source: data.source,
      offline: false,
    };
  } catch {
    return { text: "", source: "none", offline: false };
  }
}
