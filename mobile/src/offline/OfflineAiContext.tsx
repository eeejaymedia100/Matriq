import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as FileSystem from "expo-file-system/legacy";
import { initLlama, type LlamaContext, type TokenData } from "llama.rn";
import { getModel, OFFLINE_MODELS, type OfflineModel } from "./models";
import {
  deleteModelFile,
  ensureModelsDir,
  getFreeSpaceBytes,
  loadConfig,
  modelFileUri,
  modelPartFileUri,
  reconcileDownloads,
  saveConfig,
  type DownloadedInfo,
  type OfflineConfig,
} from "./persistence";

/** Token sequences each model emits at the end of its answer. */
const STOP_WORDS = [
  "</s>",
  "<|end|>",
  "<|eot_id|>",
  "<|end_of_text|>",
  "<|im_end|>",
  "<|EOT|>",
  "<|END_OF_TURN_TOKEN|>",
  "<|end_of_turn|>",
  "<|endoftext|>",
];

const SYSTEM_PROMPT =
  "You are the **AI Study Companion**, an intelligent, concise, and highly supportive academic assistant running locally on the student's device. " +
  "Your mission is to help students understand complex academic concepts, prepare for exams, break down past questions, and summarize study materials efficiently.\n\n" +
  "---\n\n" +
  "### Core Guidelines & Rules:\n\n" +
  "1. **Direct & Structured Responses:**\n" +
  "   - Always get straight to the point without filler phrases (e.g., avoid \"Certainly!\", \"As an AI...\", \"I hope this helps!\").\n" +
  "   - Use clear markdown formatting: bullet points, bold key terms, numbered steps, and short scannable paragraphs.\n" +
  "   - For mathematical equations, chemical formulas, or technical notation, use clear standard formatting or standard LaTeX syntax.\n" +
  "2. **Pedagogical Approach (Study Aid):**\n" +
  "   - **Explain, Don't Just Solve:** When answering questions or walking through past questions, break down the *concept* and *methodology* so the student learns the underlying principle.\n" +
  "   - **Step-by-Step Logic:** Present complex problem-solving in numbered sequential steps.\n" +
  "   - **Summarization:** When summarizing text, provide the main takeaway first, followed by key supporting points.\n" +
  "3. **Tone & Style:**\n" +
  "   - Clear, encouraging, academic, and engaging.\n" +
  "   - Maintain a conversational yet grounded peer-tutor persona.\n" +
  "   - Keep answers focused—prioritize clarity and precision over long-winded explanations.\n" +
  "4. **Offline & Knowledge Boundaries:**\n" +
  "   - Rely strictly on verified academic knowledge and the contextual course materials provided.\n" +
  "   - If a specific past paper, syllabus, or detail is missing or ambiguous, state what is missing briefly and offer the closest general academic principle rather than hallucinating details.";

export type EngineState = "idle" | "loading" | "ready" | "error";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

interface DownloadInfo {
  progress: number; // 0..1
  error: string | null;
  /** Rolling download speed in bytes/sec (PocketPal-style progress). */
  speedBps?: number;
  /** Estimated seconds remaining, or null while it's being computed. */
  etaSeconds?: number | null;
}

interface OfflineAiContextValue {
  models: OfflineModel[];
  downloaded: Record<string, DownloadedInfo>;
  activeModelId: string | null;
  preferOffline: boolean;
  engineState: EngineState;
  engineProgress: number;
  engineError: string | null;
  downloads: Record<string, DownloadInfo>;
  freeSpace: number | null;
  isDownloaded: (id: string) => boolean;
  isActive: (id: string) => boolean;
  startDownload: (id: string) => Promise<void>;
  cancelDownload: (id: string) => Promise<void>;
  deleteModel: (id: string) => Promise<void>;
  selectModel: (id: string) => Promise<void>;
  warmUp: () => Promise<void>;
  setPreferOffline: (value: boolean) => Promise<void>;
  refreshFreeSpace: () => Promise<void>;
  ask: (
    history: ChatTurn[],
    onToken?: (text: string) => void,
  ) => Promise<string>;
}

const OfflineAiContext = createContext<OfflineAiContextValue | null>(null);

export function useOfflineAi(): OfflineAiContextValue {
  const ctx = useContext(OfflineAiContext);
  if (!ctx) {
    throw new Error("useOfflineAi must be used inside <OfflineAiProvider>");
  }
  return ctx;
}

export function OfflineAiProvider({ children }: { children: ReactNode }) {
  // configRef is the source of truth for persistence; the state copy drives UI.
  const configRef = useRef<OfflineConfig>({
    activeModelId: null,
    preferOffline: false,
    downloaded: {},
  });
  const [config, setConfigState] = useState<OfflineConfig>(configRef.current);
  const [engineState, setEngineState] = useState<EngineState>("idle");
  const [engineProgress, setEngineProgress] = useState(0);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<Record<string, DownloadInfo>>({});
  const [freeSpace, setFreeSpace] = useState<number | null>(null);

  const engineRef = useRef<LlamaContext | null>(null);
  const engineModelIdRef = useRef<string | null>(null);
  const enginePromiseRef = useRef<Promise<void> | null>(null);
  const activeDownloadsRef = useRef<Record<string, AbortController>>({});
  // Active resumable download tasks, keyed by model id — used to cancel the
  // native network task (AbortController alone can't stop the legacy task).
  const activeResumablesRef = useRef<Record<string, FileSystem.DownloadResumable>>({});

  const applyConfig = useCallback((next: OfflineConfig) => {
    configRef.current = next;
    setConfigState(next);
    void saveConfig(next);
  }, []);

  const refreshFreeSpace = useCallback(async () => {
    const bytes = await getFreeSpaceBytes();
    setFreeSpace(bytes);
  }, []);

  // Load persisted state once at startup.
  useEffect(() => {
    (async () => {
      // Make sure the models directory exists up front — the Android native
      // downloader fails immediately when the target directory is missing.
      await ensureModelsDir();
      const loaded = await loadConfig();
      const reconciled = await reconcileDownloads(loaded);
      configRef.current = reconciled;
      setConfigState(reconciled);
      void saveConfig(reconciled);
      void refreshFreeSpace();
    })();
  }, [refreshFreeSpace]);

  const warmUp = useCallback(async () => {
    const modelId = configRef.current.activeModelId;
    if (!modelId || !configRef.current.downloaded[modelId]) {
      setEngineState("idle");
      return;
    }
    // Already loaded for the active model.
    if (engineRef.current && engineModelIdRef.current === modelId) {
      setEngineState("ready");
      return;
    }
    // An init may be in flight — possibly for a *different* model if the
    // user switched mid-load. Wait for it, then make sure the engine matches
    // the active model before returning.
    if (enginePromiseRef.current) {
      await enginePromiseRef.current;
      if (engineModelIdRef.current === modelId) {
        setEngineState("ready");
        return;
      }
      return warmUp();
    }

    setEngineState("loading");
    setEngineProgress(0);
    setEngineError(null);

    enginePromiseRef.current = (async () => {
      // Release any stale engine before loading a different model, so two
      // models are never resident in memory at once.
      if (engineRef.current) {
        try {
          await engineRef.current.release();
        } catch {
          // ignore
        }
        engineRef.current = null;
        engineModelIdRef.current = null;
      }
      const uri = modelFileUri(modelId);
      try {
        const ctx = await initLlama(
          {
            model: uri,
            n_ctx: 2048,
            n_threads: 4,
            n_batch: 512,
          },
          (progress) => setEngineProgress(progress),
        );
        // The model may have been deleted while it was loading.
        if (!configRef.current.downloaded[modelId]) {
          await ctx.release().catch(() => {});
          setEngineState("idle");
          return;
        }
        engineRef.current = ctx;
        engineModelIdRef.current = modelId;
        setEngineState("ready");
      } catch {
        setEngineState("error");
        setEngineError(
          "The offline model couldn't start on this phone. Try a smaller model, or delete and re-download it.",
        );
      } finally {
        enginePromiseRef.current = null;
      }
    })();

    await enginePromiseRef.current;
  }, []);

  const selectModel = useCallback(
    async (id: string) => {
      if (!configRef.current.downloaded[id]) return;
      applyConfig({ ...configRef.current, activeModelId: id });
      // Switching models — release the old engine so memory is freed.
      if (engineModelIdRef.current && engineModelIdRef.current !== id) {
        try {
          await engineRef.current?.release();
        } catch {
          // ignore
        }
        engineRef.current = null;
        engineModelIdRef.current = null;
        setEngineState("idle");
      }
      void warmUp();
    },
    [applyConfig, warmUp],
  );

  const startDownload = useCallback(
    async (id: string) => {
      const model = getModel(id);
      if (!model) return;
      if (configRef.current.downloaded[id] || activeDownloadsRef.current[id]) {
        return;
      }

      setDownloads((prev) => ({ ...prev, [id]: { progress: 0, error: null } }));

      // Guard against filling the phone's storage.
      const free = await getFreeSpaceBytes();
      if (free !== null && free < model.sizeBytes * 2) {
        setDownloads((prev) => ({
          ...prev,
          [id]: {
            progress: 0,
            error:
              "Not enough free storage for this model. Free up space or pick a smaller one.",
          },
        }));
        return;
      }

      // The Android native downloader rejects targets whose parent directory
      // doesn't exist yet — create it before any attempt.
      await ensureModelsDir();

      const controller = new AbortController();
      activeDownloadsRef.current[id] = controller;

      // Speed/ETA tracking (PocketPal-style): a phone download of a ~100–800 MB
      // model should show how fast it's going, not just an indeterminate bar.
      let lastBytes = 0;
      let lastTime = Date.now();
      let speedBps = 0;
      let etaSeconds: number | null = null;

      // One resume-aware attempt. Downloads stream into a `.part` file; on a
      // dropped connection the partial stays on disk and the next attempt
      // resumes from it (legacy DownloadResumable sends `Range: bytes=N-`),
      // so a flaky connection never restarts the whole model from zero.
      const attempt = async (): Promise<boolean> => {
        // Resume from whatever partial file already exists.
        const partUri = modelPartFileUri(id);
        let resumeData: string | undefined;
        try {
          const info = await FileSystem.getInfoAsync(partUri);
          if (info.exists && info.size && info.size > 0) {
            resumeData = String(info.size);
            lastBytes = info.size;
          }
        } catch {
          // no partial — start fresh
        }

        const resumable = FileSystem.createDownloadResumable(
          model.downloadUrl,
          partUri,
          {
            headers: { "User-Agent": "Matriq/0.7 (offline-ai)" },
          },
          (p) => {
            const now = Date.now();
            const dt = (now - lastTime) / 1000;
            if (dt > 0) {
              speedBps = (p.totalBytesWritten - lastBytes) / dt;
              lastBytes = p.totalBytesWritten;
              lastTime = now;
              const total =
                p.totalBytesExpectedToWrite > 0
                  ? p.totalBytesExpectedToWrite
                  : model.sizeBytes;
              etaSeconds =
                speedBps > 0 ? (total - p.totalBytesWritten) / speedBps : null;
            }
            const total =
              p.totalBytesExpectedToWrite > 0
                ? p.totalBytesExpectedToWrite
                : model.sizeBytes;
            const progress = total > 0 ? p.totalBytesWritten / total : 0;
            setDownloads((prev) => ({
              ...prev,
              [id]: { progress, error: null, speedBps, etaSeconds },
            }));
          },
          resumeData,
        );
        activeResumablesRef.current[id] = resumable;

        try {
          const result = await resumable.downloadAsync();
          if (!result?.uri) return false;
          // Verify the on-disk size matches the model before promoting it.
          const info = await FileSystem.getInfoAsync(partUri);
          const size = info.exists && info.size ? info.size : 0;
          return Math.abs(size - model.sizeBytes) < 1024;
        } catch {
          return false;
        }
      };

      try {
        // Up to 4 attempts; each resumes from the partial file, so a flaky
        // connection can't force a restart-from-zero.
        let ok = false;
        for (let i = 0; i < 4 && !controller.signal.aborted; i++) {
          ok = await attempt();
          if (ok) break;
          // Brief backoff before the next resume attempt.
          await new Promise((r) => setTimeout(r, 1200));
        }
        if (!ok) throw new Error("Download failed");

        // Promote the completed partial to the final model file.
        await FileSystem.moveAsync({
          from: modelPartFileUri(id),
          to: modelFileUri(id),
        });

        const sizeBytes = model.sizeBytes;
        applyConfig({
          ...configRef.current,
          downloaded: {
            ...configRef.current.downloaded,
            [id]: { sizeBytes, downloadedAt: Date.now() },
          },
          // First download becomes the active model automatically.
          activeModelId: configRef.current.activeModelId ?? id,
        });
        setDownloads((prev) => {
          const rest = { ...prev };
          delete rest[id];
          return rest;
        });
        void refreshFreeSpace();
        if (configRef.current.activeModelId === id) void warmUp();
      } catch {
        // Only surface the error if the user didn't cancel this download.
        // The partial file is kept on disk, so tapping Download again resumes.
        if (!controller.signal.aborted) {
          setDownloads((prev) => ({
            ...prev,
            [id]: {
              progress: 0,
              error:
                "Download paused — your connection dropped. Tap Download again to resume from where it stopped.",
            },
          }));
        }
      } finally {
        delete activeDownloadsRef.current[id];
        delete activeResumablesRef.current[id];
      }
    },
    [applyConfig, refreshFreeSpace, warmUp],
  );

  const cancelDownload = useCallback(
    async (id: string) => {
      const controller = activeDownloadsRef.current[id];
      if (controller) {
        controller.abort();
        delete activeDownloadsRef.current[id];
      }
      // Abort the native network task so the partial file stops growing.
      const resumable = activeResumablesRef.current[id];
      if (resumable) {
        try {
          await resumable.cancelAsync();
        } catch {
          // ignore
        }
        delete activeResumablesRef.current[id];
      }
      // Remove both the partial and any final file.
      await FileSystem.deleteAsync(modelPartFileUri(id), {
        idempotent: true,
      }).catch(() => {});
      await FileSystem.deleteAsync(modelFileUri(id), {
        idempotent: true,
      }).catch(() => {});
      setDownloads((prev) => {
        const rest = { ...prev };
        delete rest[id];
        return rest;
      });
      void refreshFreeSpace();
    },
    [refreshFreeSpace],
  );

  const deleteModel = useCallback(
    async (id: string) => {
      // Free the engine if it's using this model.
      if (engineModelIdRef.current === id) {
        try {
          await engineRef.current?.release();
        } catch {
          // ignore
        }
        engineRef.current = null;
        engineModelIdRef.current = null;
        setEngineState("idle");
        setEngineProgress(0);
      }
      await deleteModelFile(id);
      const downloaded = { ...configRef.current.downloaded };
      delete downloaded[id];
      applyConfig({
        ...configRef.current,
        downloaded,
        activeModelId:
          configRef.current.activeModelId === id
            ? null
            : configRef.current.activeModelId,
      });
      void refreshFreeSpace();
    },
    [applyConfig, refreshFreeSpace],
  );

  const setPreferOffline = useCallback(
    async (value: boolean) => {
      applyConfig({ ...configRef.current, preferOffline: value });
    },
    [applyConfig],
  );

  const ask = useCallback(
    async (
      history: ChatTurn[],
      onToken?: (text: string) => void,
    ): Promise<string> => {
      if (!engineRef.current) {
        await warmUp();
      }
      const engine = engineRef.current;
      if (!engine) {
        throw new Error("The offline AI model is not ready yet.");
      }

      const messages: Array<{ role: string; content: string }> = [
        { role: "system", content: SYSTEM_PROMPT },
        ...history.slice(-6),
      ];

      const result = await engine.completion(
        {
          messages,
          n_predict: 512,
          temperature: 0.7,
          top_k: 40,
          top_p: 0.9,
          stop: STOP_WORDS,
        },
        (data: TokenData) => {
          // `token` is always populated; `content` is populated on most
          // builds. Prefer content, fall back to the raw token.
          const text = data.content ?? data.token ?? "";
          if (text) onToken?.(text);
        },
      );
      return result.text;
    },
    [warmUp],
  );

  const value = useMemo<OfflineAiContextValue>(
    () => ({
      models: OFFLINE_MODELS,
      downloaded: config.downloaded,
      activeModelId: config.activeModelId,
      preferOffline: config.preferOffline,
      engineState,
      engineProgress,
      engineError,
      downloads,
      freeSpace,
      isDownloaded: (id) => !!config.downloaded[id],
      isActive: (id) => config.activeModelId === id,
      startDownload,
      cancelDownload,
      deleteModel,
      selectModel,
      warmUp,
      setPreferOffline,
      refreshFreeSpace,
      ask,
    }),
    [
      config,
      engineState,
      engineProgress,
      engineError,
      downloads,
      freeSpace,
      startDownload,
      cancelDownload,
      deleteModel,
      selectModel,
      warmUp,
      setPreferOffline,
      refreshFreeSpace,
      ask,
    ],
  );

  return (
    <OfflineAiContext.Provider value={value}>
      {children}
    </OfflineAiContext.Provider>
  );
}
