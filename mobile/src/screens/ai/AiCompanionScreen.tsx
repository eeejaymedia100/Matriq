import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Modal,
  Pressable,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Speech from "expo-speech";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import {
  useAudioRecorder,
  RecordingPresets,
  AudioModule,
} from "expo-audio";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { MainStackParamList } from "../../navigation/types";
import { KeyboardScreen } from "../../components/KeyboardScreen";
import { useTheme } from "../../theme/ThemeContext";
import { api, API_BASE, getTokens } from "../../api/client";
import { formatApiError } from "../../utils/errors";
import { useAuth } from "../../contexts/AuthContext";
import {
  useOfflineAi,
  type ChatTurn,
} from "../../offline/OfflineAiContext";
import {
  loadHistory,
  saveConversation,
  titleFromMessages,
  type Conversation,
} from "../../offline/history";
import { extractFileText } from "../../offline/extract";
import { appendFileToFormData } from "../../utils/upload";
import {
  getMaterials,
  addMaterial,
  removeMaterial,
  setMaterialText,
  type Material,
} from "../../utils/materials";
import {
  isWhisperAvailable,
  hasVoiceModel,
  downloadVoiceModel,
  transcribeOffline,
} from "../../offline/whisper";
import { logStudyActivity } from "../../utils/streak";
import type { MatriqTheme, MatriqThemeColors } from "../../theme/themes";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  streaming?: boolean;
}

type Nav = NativeStackNavigationProp<MainStackParamList>;

const WELCOME_COPY =
  "Hi! I'm your AI Study Companion. Ask me anything about your courses, past questions, or study materials — I search the association's approved materials and answer in real time.";

const STOP_WORDS = new Set([
  "about", "after", "again", "against", "also", "before", "between",
  "could", "does", "from", "have", "into", "just", "know", "like",
  "make", "more", "most", "much", "need", "only", "other", "over",
  "please", "should", "some", "than", "that", "their", "them", "then",
  "there", "these", "they", "this", "those", "through", "very", "want",
  "what", "when", "where", "which", "while", "with", "would", "your",
  "help", "tell", "give", "explain", "question", "answer", "explain",
  "study", "learn", "understand", "someone", "something", "anything",
  "anyone", "every", "everything", "first", "second", "think", "find",
  "know", "get", "put", "take", "work", "school", "exam", "tests",
]);

/** Audio extension → MIME type for the transcription upload. */
const MIME_FOR_EXT: Record<string, string> = {
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  caf: "audio/x-caf",
};

/**
 * Cheap, instant follow-up suggestions built from the student's last
 * question — no extra AI round-trip (which would only add latency).
 */
function suggestFollowUps(lastUserText: string): string[] {
  const words = (lastUserText ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
  const unique = [...new Set(words)].slice(0, 2);
  const topic = unique.join(" ");

  const suggestions = ["Explain it in simpler terms", "Summarise the key points"];
  suggestions.push(
    topic ? `Practice questions on ${topic}` : "Give me practice questions",
  );
  return suggestions.slice(0, 3);
}

/** Quick connectivity probe — any HTTP response means the server is reachable. */
async function pingBackend(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    await fetch(`${API_BASE}/health`, { signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Stream an AI query over SSE using XMLHttpRequest (React Native's fetch
 * doesn't expose a streaming body reader). Falls back to the non-streaming
 * /ai/query endpoint on any failure.
 */
function streamAiQuery(
  query: string,
  onChunk: (text: string) => void,
  onError: (message: string) => void,
  onDone: () => void,
): { abort: () => void } {
  const xhr = new XMLHttpRequest();
  let finished = false;
  let buffer = "";

  const finish = () => {
    if (!finished) {
      finished = true;
      onDone();
    }
  };

  const handleProgress = () => {
    // Parse SSE `data: <json>` events from the accumulated responseText.
    buffer += xhr.responseText.slice(buffer.length);
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line.startsWith("data:")) {
        const raw = line.slice(5).trim();
        if (raw) {
          try {
            const event = JSON.parse(raw) as {
              type: string;
              text?: string;
              message?: string;
            };
            if (event.type === "content" && event.text) {
              onChunk(event.text);
            } else if (event.type === "error") {
              onError(event.message ?? "Stream failed");
            }
          } catch {
            // Ignore partial/unknown lines.
          }
        }
      }
      newlineIndex = buffer.indexOf("\n");
    }
  };

  getTokens().then((tokens) => {
    if (finished) return;
    xhr.open("POST", `${API_BASE}/ai/query/stream`);
    xhr.setRequestHeader("Content-Type", "application/json");
    if (tokens?.accessToken) {
      xhr.setRequestHeader("Authorization", `Bearer ${tokens.accessToken}`);
    }
    xhr.onprogress = handleProgress;
    xhr.onload = () => {
      handleProgress();
      if (xhr.status !== 200) {
        onError(`Stream failed (HTTP ${xhr.status})`);
      }
      finish();
    };
    xhr.onerror = () => {
      onError("Network error while streaming");
      finish();
    };
    xhr.send(JSON.stringify({ query }));
  });

  return {
    abort: () => {
      try {
        xhr.abort();
      } catch {
        // ignore
      }
      finish();
    },
  };
}

export function AiCompanionScreen() {
  const { theme } = useTheme();
  const colors = theme.colors;
  const styles = makeStyles(theme, colors);

  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<MainStackParamList, "AiChat">>();
  const { user } = useAuth();
  const {
    activeModelId,
    preferOffline,
    engineState,
    engineProgress,
    warmUp,
    ask,
  } = useOfflineAi();

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: WELCOME_COPY,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [systemNotice, setSystemNotice] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  // ── The student's own files, read by the AI (file-access with permission) ──
  const [materials, setMaterials] = useState<Material[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  // ── Voice notes ──
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Android keyboard safety: the window resizes natively (app.json
  // `softwareKeyboardLayoutMode: "resize"`), so the composer stays above the
  // keyboard — but the FlatList's content size doesn't change when the window
  // resizes, so it won't scroll on its own. When the keyboard opens, nudge the
  // list to the latest message (after the resize settles) so the newest
  // exchange is always visible above the composer.
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 60);
    });
    return () => sub.remove();
  }, []);
  const streamRef = useRef<{ abort: () => void } | null>(null);
  const streamingIdRef = useRef<string | null>(null);
  const historyRef = useRef<ChatTurn[]>([]);
  const conversationIdRef = useRef<string | null>(null);
  // Whether the current conversation was loaded from history (so it updates
  // the saved copy rather than creating a duplicate).
  const loadedIdRef = useRef<string | null>(null);
  const messagesRef = useRef<Message[]>(messages);
  messagesRef.current = messages;

  const isOfflineNow = online === false;
  const offlineMode = preferOffline || isOfflineNow;
  const localReady =
    !!activeModelId && (engineState === "ready" || engineState === "loading");

  // Connectivity probe + engine warm-up while the screen is open.
  useEffect(() => {
    let mounted = true;
    const ping = async () => {
      const ok = await pingBackend();
      if (mounted) setOnline(ok);
    };
    void ping();
    const interval = setInterval(ping, 20_000);
    const unsub = navigation.addListener("focus", () => {
      void warmUp();
      void ping();
      void loadMaterials();
    });
    return () => {
      mounted = false;
      clearInterval(interval);
      unsub();
    };
  }, [navigation, warmUp]);

  // Load the student's own study files so the offline AI can read them.
  const loadMaterials = useCallback(async () => {
    const list = await getMaterials();
    setMaterials(list);
  }, []);

  useEffect(() => {
    void loadMaterials();
  }, [loadMaterials]);

  // Load a conversation from history when navigated with a conversationId.
  useEffect(() => {
    const id = route.params?.conversationId;
    if (!id) return;
    let mounted = true;
    void loadHistory().then((list) => {
      if (!mounted) return;
      const conv = list.find((c) => c.id === id);
      if (!conv) return;
      loadedIdRef.current = id;
      conversationIdRef.current = id;
      historyRef.current = conv.messages;
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: WELCOME_COPY,
          timestamp: new Date(),
        },
        ...conv.messages.map((m, i) => ({
          id: `${id}-${Date.now()}-${i}`,
          role: m.role,
          content: m.content,
          timestamp: new Date(),
        })),
      ]);
    });
    return () => {
      mounted = false;
    };
  }, [route.params?.conversationId]);

  // Persist the current conversation to history (debounced by latest save).
  const persistConversation = useCallback(() => {
    const turns = messagesRef.current
      .filter((m) => m.id !== "welcome" && !m.streaming)
      .map((m) => ({ role: m.role, content: m.content }));
    if (turns.length === 0) return;
    const id = conversationIdRef.current ?? `conv-${Date.now()}`;
    conversationIdRef.current = id;
    const conv: Conversation = {
      id,
      title: titleFromMessages(turns),
      updatedAt: Date.now(),
      messages: turns,
    };
    void saveConversation(conv);
  }, []);

  const appendToStreaming = useCallback((text: string) => {
    const id = streamingIdRef.current;
    if (!id) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, content: m.content + text } : m,
      ),
    );
  }, []);

  const finishStreaming = useCallback(() => {
    const id = streamingIdRef.current;
    if (id) {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, streaming: false } : m)),
      );
      streamingIdRef.current = null;
      // A completed AI Q&A is meaningful study activity (streak §1).
      void logStudyActivity();
    }
    setLoading(false);
    // Save the completed conversation to history.
    setTimeout(persistConversation, 0);
  }, [persistConversation]);

  const replaceStreamingContent = useCallback(
    (id: string, content: string) => {
      // Single-flight: whoever gets here first wins, the other gives up.
      if (streamingIdRef.current !== id) return;
      streamingIdRef.current = null;
      streamRef.current?.abort();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, content, streaming: false } : m,
        ),
      );
      setLoading(false);
      // Save the completed conversation to history.
      setTimeout(persistConversation, 0);
    },
    [persistConversation],
  );

  // Start a fresh conversation (clears the messages, drops the loaded id).
  const newChat = useCallback(() => {
    streamRef.current?.abort();
    streamingIdRef.current = null;
    loadedIdRef.current = null;
    conversationIdRef.current = null;
    historyRef.current = [];
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: WELCOME_COPY,
        timestamp: new Date(),
      },
    ]);
    setSystemNotice(null);
    setMenuOpen(false);
  }, []);

  const copyMessage = useCallback(
    async (id: string, content: string) => {
      if (!content) return;
      await Clipboard.setStringAsync(content).catch(() => {});
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1600);
    },
    [],
  );

  /** Speak an answer aloud with the system voice (works offline). */
  const toggleSpeak = useCallback((id: string, content: string) => {
    if (!content) return;
    if (speakingId === id) {
      Speech.stop();
      setSpeakingId(null);
      return;
    }
    Speech.stop();
    const finish = () => setSpeakingId((cur) => (cur === id ? null : cur));
    setSpeakingId(id);
    try {
      Speech.speak(content.replace(/[*#_`>]/g, ""), {
        language: "en",
        rate: 1.02,
        onDone: finish,
        onStopped: finish,
        onError: finish,
      });
    } catch {
      finish();
    }
  }, [speakingId]);

  // Stop any speech when leaving the screen.
  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  // Abort any in-flight stream when leaving the screen so the request (and
  // its safety-net fallback) can't keep updating a screen that's gone.
  useEffect(() => {
    return () => {
      streamRef.current?.abort();
      streamRef.current = null;
      streamingIdRef.current = null;
    };
  }, []);

  // ── Import the student's own study files (explicit picker permission) ──

  /** Extract text for a material and mark it ready (or failed) for the AI. */
  const extractForMaterial = useCallback(
    async (
      id: string,
      uri: string,
      name: string,
      mimeType: string,
    ): Promise<void> => {
      const result = await extractFileText(uri, name, mimeType);
      const list = await setMaterialText(
        id,
        result.text,
        result.text ? "ready" : "failed",
      );
      setMaterials(list);
      if (result.text) {
        setSystemNotice(
          result.offline
            ? "Read on your phone — this file is now part of your AI's knowledge, fully offline."
            : "Extracted — this file is saved on your device and the AI can read it offline from now on.",
        );
      } else {
        setSystemNotice(
          "Couldn't read text from that file. Try a PDF, Word document, text file, or a clearer photo.",
        );
      }
    },
    [],
  );

  const importDocument = useCallback(async () => {
    if (importing) return;
    setImporting(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "text/plain",
          "text/markdown",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || res.assets.length === 0) return;
      const asset = res.assets[0];
      const name = asset.name ?? "document";
      const mime = asset.mimeType ?? "application/octet-stream";
      const mb =
        asset.size !== undefined && asset.size > 0
          ? (asset.size / 1_048_576).toFixed(1)
          : undefined;
      const list = await addMaterial({
        title: name.replace(/\.[^.]+$/, "") || name,
        kind: "document",
        uri: asset.uri,
        sizeLabel: mb ? `${mb} MB` : undefined,
        textStatus: "pending",
      });
      setMaterials(list);
      setAttachOpen(false);
      await extractForMaterial(
        list[0].id,
        asset.uri,
        name,
        mime,
      );
    } catch {
      setSystemNotice("Couldn't open that file — try again.");
    } finally {
      setImporting(false);
    }
  }, [importing, extractForMaterial]);

  const importPhoto = useCallback(async () => {
    if (importing) return;
    setImporting(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setSystemNotice(
          "Matriq needs photo permission to read images — you can allow it in Settings.",
        );
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.9,
      });
      if (res.canceled || res.assets.length === 0) return;
      const asset = res.assets[0];
      const name = asset.fileName ?? "photo.jpg";
      const list = await addMaterial({
        title: name.replace(/\.[^.]+$/, "") || "Photo",
        kind: "image",
        uri: asset.uri,
        textStatus: "pending",
      });
      setMaterials(list);
      setAttachOpen(false);
      await extractForMaterial(
        list[0].id,
        asset.uri,
        name,
        "image/jpeg",
      );
    } catch {
      setSystemNotice("Couldn't open that photo — try again.");
    } finally {
      setImporting(false);
    }
  }, [importing, extractForMaterial]);

  const removeAttached = useCallback(async (id: string) => {
    setMaterials(await removeMaterial(id));
  }, []);

  // ── Voice notes ──

  const transcribeVoice = useCallback(
    async (uri: string): Promise<string | null> => {
      // 1) Fully offline: on-device Whisper, when the voice model is downloaded.
      if (isWhisperAvailable()) {
        if (await hasVoiceModel()) {
          try {
            const result = await transcribeOffline(uri);
            return result.text || null;
          } catch {
            // Fall through to the online path.
          }
        }
      }

      // 2) Online: the server transcribes with Gemini audio understanding.
      if (online !== false) {
        try {
          const ext = uri.split(".").pop()?.toLowerCase() ?? "m4a";
          const mime = MIME_FOR_EXT[ext] ?? "audio/mp4";
          const formData = new FormData();
          await appendFileToFormData(
            formData,
            "audio",
            uri,
            `voice-note.${ext}`,
            mime,
          );
          const data = await api.upload<{ text: string; readable: boolean }>(
            "/tools/transcribe",
            formData,
          );
          if (data.readable && data.text) return data.text;
          return null;
        } catch {
          return null;
        }
      }

      return null;
    },
    [online],
  );

  const toggleRecording = useCallback(async () => {
    if (recording) {
      try {
        await recorder.stop();
        const uri = recorder.uri;
        setRecording(false);
        if (uri) {
          setTranscribing(true);
          const text = await transcribeVoice(uri);
          setTranscribing(false);
          if (text) {
            setInput(text);
            setSystemNotice("Voice note transcribed — edit it if needed, then send.");
          } else {
            const offlinePath = isWhisperAvailable();
            setSystemNotice(
              offlinePath
                ? "Couldn't transcribe that voice note. Download the voice model in Offline AI to transcribe without internet, or check your connection."
                : "Couldn't transcribe that voice note right now — check your connection, or wait for the offline voice model update.",
            );
          }
        }
      } catch {
        setRecording(false);
        setSystemNotice("Couldn't finish that recording — try again.");
      }
      return;
    }

    // Start recording.
    try {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        setSystemNotice(
          "Matriq needs microphone permission to record voice notes — you can allow it in Settings.",
        );
        return;
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
    } catch {
      setSystemNotice("Couldn't start recording — try again.");
    }
  }, [recorder, recording, transcribeVoice]);

  /** Download the offline voice model (once over Wi-Fi) — mirrors the AI models. */
  const installVoiceModel = useCallback(async () => {
    if (!isWhisperAvailable()) {
      setSystemNotice(
        "Offline voice transcription needs the app update that includes the voice engine — for now, transcribe with a connection.",
      );
      return;
    }
    if (await hasVoiceModel()) {
      setSystemNotice("The voice model is already downloaded.");
      return;
    }
    setTranscribing(true);
    try {
      await downloadVoiceModel(() => {});
      setSystemNotice(
        "Voice model downloaded — voice notes now transcribe fully offline.",
      );
    } catch {
      setSystemNotice("Couldn't download the voice model — check your connection and try again.");
    } finally {
      setTranscribing(false);
    }
  }, []);

  const fallbackToNonStreaming = useCallback(
    async (aiMsgId: string, text: string) => {
      try {
        const data = await api.post<{ response: string }>("/ai/query", {
          query: text,
        });
        replaceStreamingContent(aiMsgId, data.response);
        // A completed server answer counts as a study day too (streak §1).
        void logStudyActivity();
      } catch (err) {
        const friendly = formatApiError(err);
        replaceStreamingContent(
          aiMsgId,
          `${friendly.title}. ${friendly.message} ${friendly.action}`,
        );
      }
    },
    [replaceStreamingContent],
  );

  const answerLocally = useCallback(
    async (aiMsgId: string, query?: string) => {
      try {
        const answer = await ask(
          historyRef.current,
          (chunk) => appendToStreaming(chunk),
          {
            student: {
              name: user?.fullName,
              level: user?.level,
              faculty: user?.faculty,
              department: user?.department,
            },
            // The student's own files (imported with the picker) become the
            // offline AI's retrieval corpus — nothing leaves the phone.
            materials: {
              materials,
              query: query ?? historyRef.current[historyRef.current.length - 1]?.content ?? "",
            },
          },
        );
        replaceStreamingContent(aiMsgId, answer);
        // A real offline answer is meaningful study activity (streak §1).
        void logStudyActivity();
      } catch (err) {
        const friendly = formatApiError(err);
        replaceStreamingContent(
          aiMsgId,
          `${friendly.title}. ${friendly.message} ${friendly.action}`,
        );
      }
    },
    [ask, appendToStreaming, replaceStreamingContent, user, materials],
  );

  const sendMessage = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? input).trim();
      if (!text || loading) return;

      const userMsg: Message = {
        id: Date.now().toString(),
        role: "user",
        content: text,
        timestamp: new Date(),
      };
      const aiMsgId = (Date.now() + 1).toString();
      const aiMsg: Message = {
        id: aiMsgId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        streaming: true,
      };
      setMessages((prev) => [...prev, userMsg, aiMsg]);
      setInput("");
      setLoading(true);
      streamingIdRef.current = aiMsgId;
      setSystemNotice(null);

      // Snapshot the conversation (used by the local model for context),
      // including the question being asked right now.
      historyRef.current = [
        ...messages
          .filter((m) => m.id !== "welcome" && !m.streaming)
          .slice(-15)
          .map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: text },
      ];

      // ── Offline mode: answer from the model on this phone ──────────
      if (offlineMode) {
        if (!activeModelId) {
          replaceStreamingContent(
            aiMsgId,
            "You're offline and the offline AI model isn't downloaded yet. Open Offline AI from the button above, download a model once (over Wi-Fi), and you can keep asking questions with no internet at all.",
          );
          return;
        }
        if (engineState === "loading") {
          replaceStreamingContent(
            aiMsgId,
            "The offline model is still loading — give it a few more seconds and try again.",
          );
          return;
        }
        await answerLocally(aiMsgId, text);
        return;
      }

      // ── Online mode: stream from the server ────────────────────────
      // Heartbeat safety net: if the stream emits nothing for 12s (slow
      // server warm-up, dropped connection, silent stall), retry via the
      // regular endpoint instead of leaving the user staring at a spinner.
      // Every chunk restarts the deadline, so a slow-but-alive stream is
      // never cut off mid-answer.
      let safetyTimer: ReturnType<typeof setTimeout> | null = null;
      const armSafetyNet = () => {
        if (safetyTimer) clearTimeout(safetyTimer);
        safetyTimer = setTimeout(() => {
          safetyTimer = null;
          if (streamingIdRef.current === aiMsgId) {
            void fallbackToNonStreaming(aiMsgId, text);
          }
        }, 12_000);
      };
      const disarmSafetyNet = () => {
        if (safetyTimer) {
          clearTimeout(safetyTimer);
          safetyTimer = null;
        }
      };

      try {
        const stream = streamAiQuery(
          text,
          (chunk) => {
            // Any progress means the stream is alive — restart the deadline.
            armSafetyNet();
            appendToStreaming(chunk);
          },
          () => {
            disarmSafetyNet();
            // Stream failed (e.g. network dropped) — if a local model is
            // available, switch to it seamlessly; otherwise retry non-streaming.
            if (localReady) {
              setSystemNotice(
                "No connection — switched to the offline model on your phone.",
              );
              void answerLocally(aiMsgId, text);
            } else {
              void fallbackToNonStreaming(aiMsgId, text);
            }
          },
          () => {
            disarmSafetyNet();
            finishStreaming();
          },
        );
        streamRef.current = stream;
        armSafetyNet();
      } catch (err) {
        const friendly = formatApiError(err);
        replaceStreamingContent(
          aiMsgId,
          `${friendly.title}. ${friendly.message} ${friendly.action}`,
        );
      }
    },
    [
      input,
      loading,
      messages,
      offlineMode,
      activeModelId,
      engineState,
      localReady,
      replaceStreamingContent,
      answerLocally,
      fallbackToNonStreaming,
      appendToStreaming,
      finishStreaming,
    ],
  );

  // Follow-up chips: shown under the welcome bubble (fresh chat) and under
  // the most recent completed assistant answer.

  const lastUserMessage = [...messages]
    .reverse()
    .find((m) => m.role === "user")?.content;
  const lastAiId = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && !m.streaming)?.id;
  const followUps = lastUserMessage ? suggestFollowUps(lastUserMessage) : [];

  return (
    <KeyboardScreen
      scroll={false}
      padding={0}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      footer={
        <View>
          {/* The student's own files — the offline AI reads these, nothing leaves the phone */}
          {materials.length > 0 ? (
            <View style={styles.attachedRow}>
              {materials.map((m) => (
                <View key={m.id} style={styles.attachedChip}>
                  <Ionicons
                    name={m.kind === "image" ? "image-outline" : "document-text-outline"}
                    size={13}
                    color={colors.brand}
                  />
                  <Text style={styles.attachedChipText} numberOfLines={1}>
                    {m.title}
                  </Text>
                  {m.textStatus === "ready" ? (
                    <Ionicons name="checkmark-circle" size={13} color={colors.success} />
                  ) : (
                    <Ionicons name="time-outline" size={13} color={colors.warning} />
                  )}
                  <Pressable onPress={() => void removeAttached(m.id)} hitSlop={8}>
                    <Ionicons name="close" size={13} color={colors.textMuted} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.inputBar}>
            <TouchableOpacity
              style={styles.attachBtn}
              onPress={() => setAttachOpen(true)}
              disabled={loading || importing}
              hitSlop={6}
            >
              <Ionicons name="attach" size={21} color={colors.textSecondary} />
            </TouchableOpacity>
            <TextInput
              style={styles.textInput}
              placeholder="Ask a question..."
              placeholderTextColor={colors.textMuted}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={500}
              onSubmitEditing={() => void sendMessage()}
              blurOnSubmit={false}
            />
            {recording ? (
              <TouchableOpacity
                style={[styles.micBtn, styles.micRecording]}
                onPress={() => void toggleRecording()}
              >
                <Ionicons name="stop" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.micBtn}
                onPress={() => void toggleRecording()}
                disabled={loading || transcribing}
              >
                {transcribing ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : (
                  <Ionicons name="mic" size={19} color={colors.textSecondary} />
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                styles.sendBtn,
                (!input.trim() || loading) && styles.sendBtnDisabled,
              ]}
              onPress={() => void sendMessage()}
              disabled={!input.trim() || loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
          {recording ? (
            <View style={styles.recordingBar}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>
                Recording… tap the stop button when you're done
              </Text>
            </View>
          ) : null}
        </View>
      }
    >
      <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            style={styles.listFill}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: true })
            }
            renderItem={({ item }) => {
              const showFollowUps =
                item.id !== "welcome" &&
                item.id === lastAiId &&
                !item.streaming &&
                followUps.length > 0;
              return (
                <View style={styles.bubbleWrap}>
                  <View
                    style={[
                      styles.bubble,
                      item.role === "user" ? styles.userBubble : styles.aiBubble,
                    ]}
                  >
                    <Text
                      selectable
                      style={[
                        styles.bubbleText,
                        item.role === "user" ? styles.userText : styles.aiText,
                      ]}
                    >
                      {item.content}
                      {item.streaming && <Text style={styles.cursor}>▌</Text>}
                    </Text>
                    <View style={styles.bubbleMeta}>
                      <Text
                        style={[
                          styles.time,
                          item.role === "user" ? styles.userTime : styles.aiTime,
                        ]}
                      >
                        {item.timestamp.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                      {item.role === "assistant" &&
                        !item.streaming &&
                        item.content.length > 0 && (
                          <>
                            <TouchableOpacity
                              onPress={() => toggleSpeak(item.id, item.content)}
                              hitSlop={8}
                              style={styles.copyBtn}
                              accessibilityRole="button"
                              accessibilityLabel={
                                speakingId === item.id
                                  ? "Stop reading"
                                  : "Read answer aloud"
                              }
                            >
                              <Ionicons
                                name={
                                  speakingId === item.id
                                    ? "volume-high"
                                    : "volume-medium-outline"
                                }
                                size={13}
                                color={
                                  speakingId === item.id
                                    ? colors.brand
                                    : colors.textMuted
                                }
                              />
                              <Text
                                style={[
                                  styles.copyText,
                                  speakingId === item.id && { color: colors.brand },
                                ]}
                              >
                                {speakingId === item.id ? "Stop" : "Listen"}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => void copyMessage(item.id, item.content)}
                              hitSlop={8}
                              style={styles.copyBtn}
                            >
                              <Ionicons
                                name={copiedId === item.id ? "checkmark" : "copy-outline"}
                                size={13}
                                color={
                                  copiedId === item.id
                                    ? colors.success
                                    : colors.textMuted
                                }
                              />
                              <Text
                                style={[
                                  styles.copyText,
                                  copiedId === item.id && { color: colors.success },
                                ]}
                              >
                                {copiedId === item.id ? "Copied" : "Copy"}
                              </Text>
                            </TouchableOpacity>
                          </>
                        )}
                    </View>
                  </View>

                  {/* Clickable follow-up questions */}
                  {showFollowUps ? (
                    <View style={styles.followUps}>
                      {followUps.map((q) => (
                        <Pressable
                          key={q}
                          onPress={() => void sendMessage(q)}
                          style={styles.followChip}
                        >
                          <Text style={styles.followChipText}>{q}</Text>
                          <Ionicons
                            name="arrow-forward"
                            size={12}
                            color={colors.brand}
                          />
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            }}
            ListHeaderComponent={
              <View style={styles.header}>
                <View style={styles.headerRow}>
                  <TouchableOpacity
                    style={styles.menuBtn}
                    activeOpacity={0.7}
                    onPress={() => setMenuOpen(true)}
                    hitSlop={8}
                  >
                    <Ionicons name="menu" size={24} color={colors.textPrimary} />
                  </TouchableOpacity>
                  <View style={styles.titleWrap}>
                    <Ionicons name="sparkles" size={26} color={colors.brand} />
                    <Text style={styles.title}>AI Study Companion</Text>
                  </View>
                </View>
                <Text style={styles.subtitle}>
                  {offlineMode
                    ? "Offline mode — answers come from the model on your phone"
                    : "Answers grounded in your association's approved study materials"}
                </Text>

                {/* Focus Mode — turn a complex topic into a visual, zoomable map */}
                <Pressable
                  style={styles.focusPill}
                  onPress={() =>
                    navigation.navigate("AiFocus", {
                      topic: input.trim() || undefined,
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Focus Mode — visual concept maps"
                >
                  <Ionicons name="git-network" size={14} color={colors.brand} />
                  <Text style={styles.focusPillText}>
                    Focus Mode — map a complex topic
                  </Text>
                  <Ionicons name="chevron-forward" size={12} color={colors.brand} />
                </Pressable>

                {systemNotice && (
                  <View style={styles.notice}>
                    <Ionicons
                      name="cloud-offline"
                      size={15}
                      color={colors.warning}
                    />
                    <Text style={styles.noticeText}>{systemNotice}</Text>
                  </View>
                )}

                {offlineMode && !activeModelId && (
                  <TouchableOpacity
                    style={styles.noModelBanner}
                    activeOpacity={0.8}
                    onPress={() => navigation.navigate("OfflineModels")}
                  >
                    <Ionicons
                      name="download"
                      size={16}
                      color="#FFFFFF"
                    />
                    <Text style={styles.noModelText}>
                      {isOfflineNow
                        ? "You're offline — download an AI model once when you're back online to keep asking questions without internet"
                        : "Download the offline AI model to keep asking questions with no internet"}
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color="#FFFFFF"
                    />
                  </TouchableOpacity>
                )}

                {offlineMode && activeModelId && engineState === "loading" && (
                  <View style={styles.loadingBanner}>
                    <ActivityIndicator size="small" color={colors.brand} />
                    <Text style={styles.loadingBannerText}>
                      Loading offline model… {Math.round(engineProgress * 100)}%
                    </Text>
                  </View>
                )}

                {/* Fresh-chat suggestions under the welcome bubble */}
                {messages.length === 1 && (
                  <View style={styles.welcomeFollowUps}>
                    {["What should I study first?", "Explain a topic from my course", "Give me study tips"].map(
                      (q) => (
                        <Pressable
                          key={q}
                          onPress={() => void sendMessage(q)}
                          style={styles.followChip}
                        >
                          <Text style={styles.followChipText}>{q}</Text>
                          <Ionicons
                            name="arrow-forward"
                            size={12}
                            color={colors.brand}
                          />
                        </Pressable>
                      ),
                    )}
                  </View>
                )}
              </View>
            }
          />


        {/* Hamburger menu — history, models, new chat */}
        <Modal
          visible={menuOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setMenuOpen(false)}
          statusBarTranslucent
          navigationBarTranslucent
        >
          <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
            <Pressable style={styles.menuCard} onPress={() => {}}>
              <Text style={styles.menuTitle}>AI Study Companion</Text>

              <TouchableOpacity
                style={styles.menuItem}
                activeOpacity={0.7}
                onPress={() => {
                  setMenuOpen(false);
                  navigation.navigate("AiHistory");
                }}
              >
                <Ionicons name="time-outline" size={20} color={colors.textPrimary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemTitle}>History</Text>
                  <Text style={styles.menuItemSub}>
                    Reopen past conversations
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                activeOpacity={0.7}
                onPress={() => {
                  setMenuOpen(false);
                  navigation.navigate("OfflineModels");
                }}
              >
                <Ionicons name="download-outline" size={20} color={colors.textPrimary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemTitle}>Models</Text>
                  <Text style={styles.menuItemSub}>
                    Switch or download another offline model
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                activeOpacity={0.7}
                onPress={newChat}
              >
                <Ionicons name="add-circle-outline" size={20} color={colors.textPrimary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemTitle}>New chat</Text>
                  <Text style={styles.menuItemSub}>
                    Clear this conversation and start fresh
                  </Text>
                </View>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
      </Modal>

      {/* Attach menu — the AI reads the student's OWN files, with explicit
          picker permission. Everything stays on the phone. */}
      <Modal
        visible={attachOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAttachOpen(false)}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setAttachOpen(false)}>
          <Pressable style={styles.menuCard} onPress={() => {}}>
            <Text style={styles.menuTitle}>Give the AI your study files</Text>
            <Text style={styles.attachHint}>
              Read on your phone only — your files are never uploaded.
            </Text>

            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => void importDocument()}
              disabled={importing}
            >
              <Ionicons name="document-text-outline" size={20} color={colors.textPrimary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemTitle}>Import a document</Text>
                <Text style={styles.menuItemSub}>
                  PDF, Word or .txt — the AI reads it on your device
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => void importPhoto()}
              disabled={importing}
            >
              <Ionicons name="image-outline" size={20} color={colors.textPrimary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemTitle}>Photo with text</Text>
                <Text style={styles.menuItemSub}>
                  A page, whiteboard or screenshot — read offline
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => void installVoiceModel()}
              disabled={importing || transcribing}
            >
              <Ionicons name="mic-outline" size={20} color={colors.textPrimary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemTitle}>Offline voice model</Text>
                <Text style={styles.menuItemSub}>
                  Download once (over Wi-Fi) to transcribe voice notes with no internet
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>

            {importing ? (
              <View style={{ paddingVertical: 10 }}>
                <ActivityIndicator size="small" color={colors.brand} />
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardScreen>
  );
}

function makeStyles(theme: MatriqTheme, colors: MatriqThemeColors) {
  return StyleSheet.create({
    // ThemedScreen paints the background + ambient blobs; keep this transparent.
    safe: { flex: 1 },
    // The FlatList itself must fill the available height (flex: 1) or it won't
    // scroll — a VirtualizedList needs a bounded height to have scrollable
    // content. It also keeps the composer above the keyboard on Android: the
    // window resizes (softwareKeyboardLayoutMode: "resize") and this list
    // shrinks with it — otherwise the footer gets pushed below the keyboard
    // and the composer disappears.
    listFill: {
      flex: 1,
    },
    // Content padding lives on the content container, NOT flex — flex here
    // would falsely claim the content fills the viewport and break scrolling.
    list: {
      padding: theme.spacing.md,
      paddingBottom: theme.spacing.xxl,
    },
    header: {
      alignItems: "center",
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.lg,
      marginBottom: theme.spacing.md,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      width: "100%",
      gap: theme.spacing.sm,
    },
    menuBtn: {
      width: 40,
      height: 40,
      borderRadius: theme.radii.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    titleWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
    title: { ...theme.typography.h2, color: colors.textPrimary, flexShrink: 1 },
    menuBackdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: "flex-start",
      paddingTop: 60,
      paddingHorizontal: theme.spacing.md,
    },
    menuCard: {
      backgroundColor: colors.surface,
      borderRadius: theme.radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: theme.spacing.md,
      gap: theme.spacing.xs,
    },
    menuTitle: {
      ...theme.typography.captionBold,
      color: colors.textMuted,
      textTransform: "uppercase",
      letterSpacing: 1,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      padding: theme.spacing.sm,
      borderRadius: theme.radii.md,
    },
    menuItemTitle: { ...theme.typography.bodyBold, color: colors.textPrimary },
    menuItemSub: { ...theme.typography.caption, color: colors.textMuted, marginTop: 1 },
    subtitle: {
      ...theme.typography.caption,
      color: colors.textMuted,
      marginTop: theme.spacing.xs,
      textAlign: "center",
    },
    notice: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      backgroundColor: colors.warningBg,
      borderRadius: theme.radii.md,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      width: "100%",
    },
    noticeText: {
      ...theme.typography.caption,
      color: colors.textSecondary,
      flex: 1,
    },
    focusPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: theme.radii.pill,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      alignSelf: "flex-start",
    },
    focusPillText: {
      ...theme.typography.captionBold,
      color: colors.textPrimary,
    },
    noModelBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      backgroundColor: colors.brand,
      borderRadius: theme.radii.md,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      width: "100%",
    },
    noModelText: {
      ...theme.typography.caption,
      color: "#FFFFFF",
      flex: 1,
    },
    loadingBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      backgroundColor: colors.surfaceAlt,
      borderRadius: theme.radii.md,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      width: "100%",
    },
    loadingBannerText: {
      ...theme.typography.caption,
      color: colors.textSecondary,
    },
    bubbleWrap: { alignItems: "flex-start", marginVertical: theme.spacing.xs },
    bubble: {
      maxWidth: "80%",
      padding: theme.spacing.md,
      borderRadius: theme.radii.lg,
    },
    userBubble: {
      alignSelf: "flex-end",
      backgroundColor: colors.brand,
      marginLeft: "auto",
    },
    aiBubble: {
      alignSelf: "flex-start",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    bubbleText: { ...theme.typography.body },
    userText: { color: "#FFFFFF" },
    aiText: { color: colors.textPrimary },
    cursor: { color: colors.accent },
    bubbleMeta: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: theme.spacing.xs,
      gap: theme.spacing.sm,
    },
    time: { ...theme.typography.small },
    userTime: { color: "#FFFFFFAA" },
    aiTime: { color: colors.textMuted },
    copyBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    copyText: {
      ...theme.typography.small,
      color: colors.textMuted,
    },
    followUps: {
      gap: theme.spacing.xs,
      marginTop: theme.spacing.xs,
      marginLeft: theme.spacing.md,
      alignSelf: "flex-start",
    },
    welcomeFollowUps: {
      gap: theme.spacing.xs,
      marginTop: theme.spacing.sm,
      width: "100%",
    },
    followChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: theme.radii.pill,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
    },
    followChipText: {
      ...theme.typography.captionBold,
      color: colors.textPrimary,
    },
    attachedRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.xs,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderColor: colors.border,
    },
    attachedChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: colors.surfaceAlt,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 5,
      paddingHorizontal: theme.spacing.sm,
      maxWidth: 190,
    },
    attachedChipText: {
      ...theme.typography.small,
      color: colors.textPrimary,
      flexShrink: 1,
    },
    attachHint: {
      ...theme.typography.caption,
      color: colors.textMuted,
      paddingHorizontal: theme.spacing.sm,
      paddingBottom: theme.spacing.xs,
    },
    attachBtn: {
      width: 38,
      height: 38,
      borderRadius: theme.radii.pill,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    micBtn: {
      width: 38,
      height: 38,
      borderRadius: theme.radii.pill,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    micRecording: {
      backgroundColor: colors.error,
      borderColor: colors.error,
    },
    recordingBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: theme.spacing.md,
      paddingBottom: theme.spacing.sm,
      backgroundColor: colors.surface,
    },
    recordingDot: {
      width: 8,
      height: 8,
      borderRadius: 999,
      backgroundColor: colors.error,
    },
    recordingText: {
      ...theme.typography.caption,
      color: colors.textSecondary,
    },
    inputBar: {
      flexDirection: "row",
      alignItems: "flex-end",
      padding: theme.spacing.sm,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderColor: colors.border,
      gap: theme.spacing.sm,
    },
    textInput: {
      flex: 1,
      ...theme.typography.body,
      color: colors.textPrimary,
      backgroundColor: colors.surfaceAlt,
      borderRadius: theme.radii.lg,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      maxHeight: 100,
    },
    sendBtn: {
      width: 44,
      height: 44,
      borderRadius: theme.radii.pill,
      backgroundColor: colors.brand,
      alignItems: "center",
      justifyContent: "center",
    },
    sendBtnDisabled: { backgroundColor: colors.border },
  });
}
