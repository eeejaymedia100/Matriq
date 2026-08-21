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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
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
  const flatListRef = useRef<FlatList>(null);
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
    });
    return () => {
      mounted = false;
      clearInterval(interval);
      unsub();
    };
  }, [navigation, warmUp]);

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
          },
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
    [ask, appendToStreaming, replaceStreamingContent, user],
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
        <View style={styles.inputBar}>
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
      }
    >
      <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
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
    </KeyboardScreen>
  );
}

function makeStyles(theme: MatriqTheme, colors: MatriqThemeColors) {
  return StyleSheet.create({
    // ThemedScreen paints the background + ambient blobs; keep this transparent.
    safe: { flex: 1 },
    list: { padding: theme.spacing.md, paddingBottom: theme.spacing.xxl },
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
