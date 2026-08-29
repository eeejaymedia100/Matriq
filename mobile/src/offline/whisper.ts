import {
  Platform,
  NativeModules,
  TurboModuleRegistry,
  type TurboModule,
} from "react-native";
import * as FileSystem from "expo-file-system/legacy";

/**
 * Offline voice-note transcription (native builds).
 *
 * Whisper (whisper.cpp via whisper.rn) runs entirely on the phone: the
 * student downloads a small voice model once over Wi-Fi (same pattern as the
 * offline AI models), and after that voice notes are transcribed with zero
 * internet. The web build can't run native Whisper — see whisper.web.ts —
 * and falls back to the server transcription endpoint.
 *
 * Everything here is guarded: if whisper.rn isn't linked into this build
 * (the native rebuild hasn't shipped yet) the functions report
 * `available: false` instead of crashing.
 */

export interface VoiceModel {
  id: string;
  name: string;
  sizeBytes: number;
  downloadUrl: string;
  description: string;
}

/** whisper-tiny.en — the fastest, lightest Whisper model (English only). */
export const VOICE_MODEL: VoiceModel = {
  id: "whisper-tiny-en",
  name: "Whisper Tiny (English)",
  sizeBytes: 75_246_072, // ggml-tiny.en.bin (~72 MB)
  downloadUrl:
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
  description:
    "Fast on-device voice transcription (~72 MB). Good enough for clear speech; download once over Wi-Fi.",
};

const MODELS_DIR = "matriq-offline-ai/voice/";
const MODEL_FILE = "ggml-tiny.en.bin";

export interface TranscribeResult {
  text: string;
  /** "offline" (on-device Whisper) or "unavailable". */
  source: "offline" | "unavailable";
}

/** True when whisper.rn is linked into this build (native only). */
export function isWhisperAvailable(): boolean {
  if (Platform.OS === "web") return false;
  // whisper.rn is a TurboModule; check both the registry and the legacy
  // NativeModules view (the library's own index.ts reads the latter).
  return (
    (NativeModules.RNWhisper !== null &&
      NativeModules.RNWhisper !== undefined) ||
    TurboModuleRegistry.get<TurboModule>("RNWhisper") !== null
  );
}

export function voiceModelUri(): string {
  const dir = FileSystem.documentDirectory;
  return `${dir}${MODELS_DIR}${MODEL_FILE}`;
}

/** True when the voice model has been downloaded to this device. */
export async function hasVoiceModel(): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(voiceModelUri());
    return info.exists && (info.size ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Download the voice model (resumable; flaky connections don't restart). */
export async function downloadVoiceModel(
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const dir = FileSystem.documentDirectory;
  const targetDir = `${dir}${MODELS_DIR}`;
  await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });

  const finalUri = voiceModelUri();
  const partUri = `${finalUri}.part`;

  let resumeData: string | undefined;
  try {
    const info = await FileSystem.getInfoAsync(partUri);
    if (info.exists && info.size && info.size > 0) {
      resumeData = String(info.size);
    }
  } catch {
    // start fresh
  }

  const resumable = FileSystem.createDownloadResumable(
    VOICE_MODEL.downloadUrl,
    partUri,
    { headers: { "User-Agent": "Matriq/0.7 (voice-model)" } },
    (p) => {
      const total =
        p.totalBytesExpectedToWrite > 0
          ? p.totalBytesExpectedToWrite
          : VOICE_MODEL.sizeBytes;
      onProgress?.(total > 0 ? p.totalBytesWritten / total : 0);
    },
    resumeData,
  );

  await resumable.downloadAsync();
  await FileSystem.moveAsync({ from: partUri, to: finalUri });
}

/** Transcribe an audio file fully offline. Throws when unavailable. */
export async function transcribeOffline(
  audioUri: string,
): Promise<TranscribeResult> {
  if (!isWhisperAvailable()) {
    throw new Error("Offline voice transcription isn't available in this build yet.");
  }
  if (!(await hasVoiceModel())) {
    throw new Error("voice-model-missing");
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const whisper = require("whisper.rn") as typeof import("whisper.rn");
  const context = await whisper.initWhisper({
    filePath: voiceModelUri(),
    useGpu: false,
  });
  try {
    const { promise } = context.transcribe(audioUri, {
      language: "en",
      verbose: false,
      timestamps: false,
    });
    const result = await promise;
    const text = (result.segments ?? [])
      .map((s) => s.text ?? "")
      .join(" ")
      .trim();
    return { text: text.slice(0, 5000), source: "offline" };
  } finally {
    try {
      await context.release();
    } catch {
      // ignore
    }
  }
}
