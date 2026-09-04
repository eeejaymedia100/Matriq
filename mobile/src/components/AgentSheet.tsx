import React, { useCallback, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { Icon } from "./icons";
import { ApiError } from "../api/client";
import { runAgent, type AgentRequest, type AgentSurface } from "../utils/agent";

/**
 * AgentSheet — the Agent v2 companion. A bottom sheet that takes the page
 * context (which document, which passage, which focus node) plus one free
 * question, runs the server-side bounded tool loop, and shows the answer
 * with the tool trail ("checked your notes · searched the library").
 *
 * Magic Plus only (server-enforced): a non-premium student gets the honest
 * upsell inline, never a dead error.
 */
export function AgentSheet({
  visible,
  onClose,
  baseRequest,
}: {
  visible: boolean;
  onClose: () => void;
  /** Page context captured at open time (surface, doc, selection, node). */
  baseRequest: Omit<AgentRequest, "query">;
}) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const styles = makeStyles(colors);

  const [query, setQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [toolsUsed, setToolsUsed] = useState<string[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const run = useCallback(
    async (q: string) => {
      const text = q.trim();
      if (!text || running) return;
      setRunning(true);
      setErrorText(null);
      setAnswer(null);
      setToolsUsed([]);
      try {
        const res = await runAgent({ ...baseRequest, query: text });
        setAnswer(res.answer);
        setToolsUsed(res.toolCalls.filter((t) => t.ok).map((t) => t.tool));
      } catch (err) {
        if (err instanceof ApiError && err.code === "MAGIC_PLUS_REQUIRED") {
          setErrorText(
            "The study agent is part of Magic Plus — it can search your notes, read your documents and explain concepts on command.",
          );
        } else if (err instanceof ApiError) {
          setErrorText(err.message || "The agent couldn't run just now.");
        } else {
          setErrorText(
            "The agent couldn't reach the network. Check your connection and try again.",
          );
        }
      } finally {
        setRunning(false);
        inputRef.current?.blur();
      }
    },
    [baseRequest, running],
  );

  const TOOL_LABELS: Record<string, string> = {
    search_my_notes: "checked your notes",
    read_document: "read the document",
    search_library: "searched the library",
    explain: "explained with AI",
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>
          <View style={styles.titleRow}>
            <Icon name="sparkle" size={15} color={colors.brand} />
            <Text style={styles.title}>Study Agent</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close agent">
              <Icon name="x" size={16} color={colors.textMuted} />
            </Pressable>
          </View>

          {baseRequest.selection ? (
            <View style={styles.contextBox}>
              <Text style={styles.contextLabel}>You selected</Text>
              <Text style={styles.contextText} numberOfLines={3}>
                “{baseRequest.selection}”
              </Text>
            </View>
          ) : null}
          {baseRequest.nodeLabel ? (
            <View style={styles.contextBox}>
              <Text style={styles.contextLabel}>Focus card</Text>
              <Text style={styles.contextText} numberOfLines={2}>
                {baseRequest.nodeLabel}
              </Text>
            </View>
          ) : null}

          {answer ? (
            <ScrollView style={styles.answerScroll} showsVerticalScrollIndicator={false}>
              <Text selectable style={styles.answerText}>
                {answer}
              </Text>
              {toolsUsed.length > 0 ? (
                <View style={styles.toolRow}>
                  {toolsUsed.map((t) => (
                    <View key={t} style={styles.toolChip}>
                      <Text style={styles.toolChipText}>
                        {TOOL_LABELS[t] ?? t}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </ScrollView>
          ) : null}

          {errorText ? (
            <View style={styles.errorBox}>
              <Icon name="alert" size={14} color={colors.error} />
              <Text style={styles.errorText}>{errorText}</Text>
            </View>
          ) : null}

          {running ? (
            <View style={styles.runningRow}>
              <ActivityIndicator size="small" color={colors.brand} />
              <Text style={styles.runningText}>
                Checking your notes, documents and library…
              </Text>
            </View>
          ) : null}

          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder={
                baseRequest.selection
                  ? "Ask about this passage…"
                  : "Ask the agent to check your notes…"
              }
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              multiline
              maxLength={500}
              onSubmitEditing={() => void run(query)}
              blurOnSubmit={false}
            />
            <Pressable
              style={[styles.sendBtn, (!query.trim() || running) && styles.sendDisabled]}
              onPress={() => void run(query)}
              disabled={!query.trim() || running}
              accessibilityLabel="Ask the agent"
            >
              {running ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Icon name="sparkle" size={15} color="#FFFFFF" />
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      borderWidth: 1,
      borderColor: colors.border,
      borderBottomWidth: 0,
      padding: 20,
      paddingBottom: 30,
      maxHeight: "82%",
    },
    handleRow: { alignItems: "center", marginBottom: 10 },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    title: {
      flex: 1,
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 16,
      color: colors.textPrimary,
    },
    contextBox: {
      marginTop: 12,
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    contextLabel: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 10,
      letterSpacing: 1,
      textTransform: "uppercase",
      color: colors.textMuted,
      marginBottom: 4,
    },
    contextText: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 19,
    },
    answerScroll: { maxHeight: 300, marginTop: 14 },
    answerText: {
      fontSize: 14,
      color: colors.textPrimary,
      lineHeight: 22,
    },
    toolRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 12,
    },
    toolChip: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: colors.brand + "1A",
    },
    toolChipText: {
      fontSize: 11,
      fontFamily: "PlusJakartaSans_700Bold",
      color: colors.brand,
    },
    errorBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 14,
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.errorBg,
    },
    errorText: {
      flex: 1,
      fontSize: 12,
      color: colors.error,
      lineHeight: 18,
    },
    runningRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 14,
    },
    runningText: {
      fontSize: 12,
      color: colors.textMuted,
      flex: 1,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      marginTop: 14,
    },
    input: {
      flex: 1,
      minHeight: 44,
      maxHeight: 110,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surfaceAlt,
      color: colors.textPrimary,
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 10,
      fontSize: 14,
    },
    sendBtn: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: colors.brand,
      alignItems: "center",
      justifyContent: "center",
    },
    sendDisabled: { opacity: 0.4 },
  });
