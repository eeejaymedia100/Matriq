/**
 * Catalog of downloadable on-device AI models (llama.cpp GGUF).
 *
 * IMPORTANT: these models are deliberately NOT bundled with the app. Students
 * choose one and download it once over Wi-Fi; after that the AI works with no
 * internet connection. URLs + sizes were verified against Hugging Face.
 */
export interface OfflineModel {
  id: string;
  name: string;
  tier: "Tiny" | "Small" | "Medium";
  description: string;
  /** Exact file size in bytes (from Hugging Face HEAD) */
  sizeBytes: number;
  downloadUrl: string;
  /** RAM estimate for the phone while the model is loaded */
  ramNote: string;
  speedNote: string;
  recommended?: boolean;
}

export const OFFLINE_MODELS: OfflineModel[] = [
  {
    id: "smollm2-135m",
    name: "SmolLM2 135M",
    tier: "Tiny",
    description:
      "The quickest to download (~100 MB) — good for fast definitions and simple questions on a bad connection.",
    sizeBytes: 105_454_432, // ~100 MB
    downloadUrl:
      "https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct-Q4_K_M.gguf",
    ramNote: "~400 MB of RAM while answering",
    speedNote: "Fastest — answers in seconds",
  },
  {
    id: "smollm2-360m",
    name: "SmolLM2 360M",
    tier: "Tiny",
    description:
      "A little smarter than 135M and still fast to download. Good for quick definitions and simple questions.",
    sizeBytes: 270_590_880, // ~258 MB
    downloadUrl:
      "https://huggingface.co/bartowski/SmolLM2-360M-Instruct-GGUF/resolve/main/SmolLM2-360M-Instruct-Q4_K_M.gguf",
    ramNote: "~600 MB of RAM while answering",
    speedNote: "Fast — answers in seconds",
  },
  {
    id: "qwen2.5-0.5b",
    name: "Qwen 2.5 0.5B",
    tier: "Small",
    description:
      "The best balance of size and quality. Recommended for most students — decent answers on almost any phone.",
    sizeBytes: 491_400_032, // ~469 MB
    downloadUrl:
      "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf",
    ramNote: "~900 MB of RAM while answering",
    speedNote: "Fast — a few seconds per answer",
    recommended: true,
  },
  {
    id: "llama-3.2-1b",
    name: "Llama 3.2 1B",
    tier: "Medium",
    description:
      "Best answer quality of the lineup — noticeably better at explaining concepts. Needs a newer phone with enough RAM and storage.",
    sizeBytes: 807_694_368, // ~770 MB
    downloadUrl:
      "https://huggingface.co/unsloth/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf",
    ramNote: "~1.6 GB of RAM while answering",
    speedNote: "Slower — up to 20s per answer",
  },
];

export const MODELS_DIR = "matriq-offline-ai/models/";
export const CONFIG_FILE = "matriq-offline-ai/config.json";

/** "258 MB" / "1.2 GB" style formatting */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) {
    return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1)} MB`;
  }
  return `${(mb / 1024).toFixed(1)} GB`;
}

export function getModel(id: string): OfflineModel | undefined {
  return OFFLINE_MODELS.find((m) => m.id === id);
}
