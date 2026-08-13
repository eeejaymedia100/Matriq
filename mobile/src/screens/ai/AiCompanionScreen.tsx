import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { MainStackParamList } from "../../navigation/types";
import { colors, spacing, typography, radii } from "../../theme/colors";
import { api, API_BASE, getTokens } from "../../api/client";
import { formatApiError } from "../../utils/errors";
import {
  useOfflineAi,
  type ChatTurn,
} from "../../offline/OfflineAiContext";

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
  const navigation = useNavigation<Nav>();
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
  const flatListRef = useRef<FlatList>(null);
  const streamRef = useRef<{ abort: () => void } | null>(null);
  const streamingIdRef = useRef<string | null>(null);
  const historyRef = useRef<ChatTurn[]>([]);

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
    });
    return () => {
      mounted = false;
      clearInterval(interval);
      unsub();
    };
  }, [navigation, warmUp]);

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
    }
    setLoading(false);
  }, []);

  const replaceStreamingContent = useCallback((id: string, content: string) => {
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
  }, []);

  const fallbackToNonStreaming = useCallback(
    async (aiMsgId: string, text: string) => {
      try {
        const data = await api.post<{ response: string }>("/ai/query", {
          query: text,
        });
        replaceStreamingContent(aiMsgId, data.response);
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
    async (aiMsgId: string) => {
      try {
        const answer = await ask(historyRef.current, (chunk) =>
          appendToStreaming(chunk),
        );
        replaceStreamingContent(aiMsgId, answer);
      } catch (err) {
        const friendly = formatApiError(err);
        replaceStreamingContent(
          aiMsgId,
          `${friendly.title}. ${friendly.message} ${friendly.action}`,
        );
      }
    },
    [ask, appendToStreaming, replaceStreamingContent],
  );

  const sendMessage = async () => {
    const text = input.trim();
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
        .slice(-5)
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
      await answerLocally(aiMsgId);
      return;
    }

    // ── Online mode: stream from the server ────────────────────────
    try {
      const stream = streamAiQuery(
        text,
        (chunk) => appendToStreaming(chunk),
        () => {
          // Stream failed (e.g. network dropped) — if a local model is
          // available, switch to it seamlessly; otherwise retry non-streaming.
          if (localReady) {
            setSystemNotice(
              "No connection — switched to the offline model on your phone.",
            );
            void answerLocally(aiMsgId);
          } else {
            void fallbackToNonStreaming(aiMsgId, text);
          }
        },
        () => finishStreaming(),
      );
      streamRef.current = stream;

      // Safety net: if the stream never emits anything within 12s, retry via
      // the regular endpoint instead of leaving the user staring at a spinner.
      setTimeout(() => {
        if (streamingIdRef.current === aiMsgId) {
          void fallbackToNonStreaming(aiMsgId, text);
        }
      }, 12_000);
    } catch (err) {
      const friendly = formatApiError(err);
      replaceStreamingContent(
        aiMsgId,
        `${friendly.title}. ${friendly.message} ${friendly.action}`,
      );
    }
  };

  const chipLabel = !activeModelId
    ? "Offline AI"
    : engineState === "ready"
      ? "Offline AI ready"
      : engineState === "loading"
        ? `Loading ${Math.round(engineProgress * 100)}%`
        : "Offline AI";
  const chipColor =
    offlineMode || engineState === "ready"
      ? colors.success
      : isOfflineNow
        ? colors.warning
        : colors.textMuted;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
          renderItem={({ item }) => (
            <View
              style={[
                styles.bubble,
                item.role === "user" ? styles.userBubble : styles.aiBubble,
              ]}
            >
              <Text
                style={[
                  styles.bubbleText,
                  item.role === "user" ? styles.userText : styles.aiText,
                ]}
              >
                {item.content}
                {item.streaming && <Text style={styles.cursor}>▌</Text>}
              </Text>
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
            </View>
          )}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.headerRow}>
                <View style={styles.titleWrap}>
                  <Ionicons
                    name="sparkles"
                    size={26}
                    color={colors.primary}
                  />
                  <Text style={styles.title}>AI Study Companion</Text>
                </View>
                <TouchableOpacity
                  style={styles.chip}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate("OfflineModels")}
                >
                  <Ionicons
                    name={
                      engineState === "ready"
                        ? "cloud-done"
                        : online === false
                          ? "cloud-offline"
                          : "download"
                    }
                    size={14}
                    color={chipColor}
                  />
                  <Text style={[styles.chipText, { color: chipColor }]}>
                    {chipLabel}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.subtitle}>
                {offlineMode
                  ? "Offline mode — answers come from the model on your phone"
                  : "Answers grounded in your association's approved study materials"}
              </Text>

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
                    color={colors.textOnPrimary}
                  />
                  <Text style={styles.noModelText}>
                    {isOfflineNow
                      ? "You're offline — download an AI model once when you're back online to keep asking questions without internet"
                      : "Download the offline AI model to keep asking questions with no internet"}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={colors.textOnPrimary}
                  />
                </TouchableOpacity>
              )}

              {offlineMode && activeModelId && engineState === "loading" && (
                <View style={styles.loadingBanner}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.loadingBannerText}>
                    Loading offline model… {Math.round(engineProgress * 100)}%
                  </Text>
                </View>
              )}
            </View>
          }
        />

        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            placeholder="Ask a question..."
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={500}
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              (!input.trim() || loading) && styles.sendBtnDisabled,
            ]}
            onPress={sendMessage}
            disabled={!input.trim() || loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.textOnPrimary} />
            ) : (
              <Ionicons name="arrow-up" size={20} color={colors.textOnPrimary} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.md, paddingBottom: spacing.xxl },
  header: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  titleWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { ...typography.h2, color: colors.textPrimary },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  chipText: { ...typography.small },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: "center",
  },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.warningBg,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    width: "100%",
  },
  noticeText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  noModelBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    width: "100%",
  },
  noModelText: {
    ...typography.caption,
    color: colors.textOnPrimary,
    flex: 1,
  },
  loadingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    width: "100%",
  },
  loadingBannerText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  bubble: {
    maxWidth: "80%",
    padding: spacing.md,
    borderRadius: radii.lg,
    marginVertical: spacing.xs,
  },
  userBubble: { alignSelf: "flex-end", backgroundColor: colors.primary },
  aiBubble: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleText: { ...typography.body },
  userText: { color: colors.textOnPrimary },
  aiText: { color: colors.textPrimary },
  cursor: { color: colors.primary },
  time: { ...typography.small, marginTop: spacing.xs },
  userTime: { color: colors.textOnPrimary + "AA" },
  aiTime: { color: colors.textMuted },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  textInput: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxHeight: 100,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { backgroundColor: colors.border },
});
