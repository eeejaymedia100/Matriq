import React, { useState, useCallback, useRef } from "react";
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
import { colors, spacing, typography, radii } from "../../theme/colors";
import { api, API_BASE, getTokens } from "../../api/client";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  streaming?: boolean;
}

const WELCOME_COPY =
  "Hi! I'm your AI Study Companion. Ask me anything about your courses, past questions, or study materials — I search the association's approved materials and answer in real time.";

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
  const flatListRef = useRef<FlatList>(null);
  const streamRef = useRef<{ abort: () => void } | null>(null);
  const streamingIdRef = useRef<string | null>(null);

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
        const msg =
          err instanceof Error ? err.message : "Failed to get an answer";
        replaceStreamingContent(
          aiMsgId,
          `Sorry, I'm having trouble right now. (${msg})`,
        );
      }
    },
    [replaceStreamingContent],
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

    try {
      const stream = streamAiQuery(
        text,
        (chunk) => appendToStreaming(chunk),
        () => {
          // Stream failed (e.g. network) — fall back to the regular endpoint
          // so the user always gets an answer.
          void fallbackToNonStreaming(aiMsgId, text);
        },
        () => finishStreaming(),
      );
      streamRef.current = stream;

      // Safety net: if the stream never emits anything within 12s, use the
      // regular endpoint instead of leaving the user staring at a spinner.
      setTimeout(() => {
        if (streamingIdRef.current === aiMsgId) {
          void fallbackToNonStreaming(aiMsgId, text);
        }
      }, 12_000);
    } catch (err) {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content:
          "Sorry, I'm having trouble processing your request. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errMsg]);
      setLoading(false);
    }
  };

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
              <Ionicons name="sparkles" size={30} color={colors.primary} />
              <Text style={styles.title}>AI Study Companion</Text>
              <Text style={styles.subtitle}>
                Answers grounded in your association's approved study materials
              </Text>
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
            style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
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
  title: { ...typography.h2, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  bubble: {
    maxWidth: "80%",
    padding: spacing.md,
    borderRadius: radii.lg,
    marginVertical: spacing.xs,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: colors.primary,
  },
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
