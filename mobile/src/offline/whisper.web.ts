/**
 * Web build of the voice transcription service. The browser can't run native
 * Whisper, so on-device transcription is unavailable here — the AI chat uses
 * the server transcription endpoint instead (see the transcribe helper in the
 * chat screen). All functions are stubs that report "unavailable" so the UI
 * branch behaves identically to a native build without the model.
 */

export const VOICE_MODEL = {
  id: "whisper-tiny-en",
  name: "Whisper Tiny (English)",
  sizeBytes: 75_246_072,
  downloadUrl: "",
  description: "",
};

export function isWhisperAvailable(): boolean {
  return false;
}

export async function hasVoiceModel(): Promise<boolean> {
  return false;
}

export async function downloadVoiceModel(): Promise<void> {
  throw new Error("On-device voice transcription isn't available on the web.");
}

export async function transcribeOffline(): Promise<never> {
  throw new Error("On-device voice transcription isn't available on the web.");
}
