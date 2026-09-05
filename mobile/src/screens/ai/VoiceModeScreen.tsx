import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  AccessibilityInfo,
} from "react-native";
import * as Speech from "expo-speech";
import {
  useAudioRecorder,
  RecordingPresets,
  AudioModule,
} from "expo-audio";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardScreen } from "../../components/KeyboardScreen";
import { Surface } from "../../components/Surface";
import { Icon } from "../../components/icons";
import { api, API_BASE, getTokens } from "../../api/client";
import { useOfflineAi } from "../../offline/OfflineAiContext";
import {
  isWhisperAvailable,
  hasVoiceModel,
  downloadVoiceModel,
  transcribeOffline,
} from "../../offline/whisper";
import { appendFileToFormData } from "../../utils/upload";
import { logStudyActivity } from "../../utils/streak";
import { useAuth } from "../../contexts/AuthContext";
import { useNavigation } from "@react-navigation/native";

/**
 * Voice Mode (UI direction §Voice Mode) — a real hands-free way to study:
 * speak a question, the AI answers, and the answer is read aloud. Keep going
 * by speaking again — no typing, no voice dashboard.
 *
 * States are explicit (idle · listening · transcribing · answering ·
 * speaking), every failure has a path forward, and privacy is respected: the
 * mic is on-device, transcription runs on-device (Whisper) when the voice
 * model is downloaded and only falls back to Matriq's server otherwise —
 * clearly labelled either way.
 */

type Phase = "idle" | "listening" | "transcribing" | "answering" | "error";

interface Exchange {
  role: "user" | "assistant";
  text: string;
}

const MIME_FOR_EXT: Record<string, string> = {
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  caf: "audio/x-caf",
};

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

export function VoiceModeScreen() {
  const { theme } = useTheme();
  const colors = theme.colors;
  const navigation = useNavigation();
  const { user } = useAuth();
  const { activeModelId, engineState, warmUp, ask } = useOfflineAi();

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [phase, setPhase] = useState<Phase>("idle");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [onlineReady, setOnlineReady] = useState<boolean | null>(null);
  const [downloadingVoiceModel, setDownloadingVoiceModel] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    void warmUp();
    void pingBackend().then(setOnlineReady);
    void hasVoiceModel().then(setOfflineReady);
    // Stop any speech when leaving.
    return () => {
      Speech.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const speakAloud = useCallback((text: string) => {
    if (!text) return;
    Speech.stop();
    const clean = text.replace(/[*#_`>]/g, "");
    setSpeaking(true);
    setPaused(false);
    const finish = () => {
      setSpeaking(false);
      setPaused(false);
    };
    try {
      Speech.speak(clean, {
        language: "en",
        rate: 1.02,
        onDone: finish,
        onStopped: finish,
        onError: finish,
      });
    } catch {
      finish();
    }
  }, []);

  const stopSpeech = useCallback(() => {
    Speech.stop();
    setSpeaking(false);
    setPaused(false);
  }, []);

  const togglePause = useCallback(() => {
    if (paused) {
      Speech.resume();
      setPaused(false);
    } else {
      Speech.pause();
      setPaused(true);
    }
  }, [paused]);

  /** Ask the AI (offline model first when ready + unreachable, else server). */
  const askAi = useCallback(
    async (question: string): Promise<string> => {
      const localReady = !!activeModelId && engineState === "ready";
      const offlinePreferred = !onlineReady;
      if (offlinePreferred && localReady) {
        const answer = await ask(
          [],
          () => {},
          {
            student: {
              name: user?.fullName,
              level: user?.level,
              faculty: user?.faculty,
              department: user?.department,
            },
          },
        );
        return answer;
      }
      // Online (or no local model): server answer — non-streamed for voice.
      const data = await api.post<{ response: string }>("/ai/query", {
        query: question,
      });
      return data.response;
    },
    [activeModelId, engineState, onlineReady, ask, user],
  );

  /** Transcribe: on-device Whisper first, server fallback (both labelled). */
  const transcribe = useCallback(
    async (uri: string): Promise<{ text: string; engine: "offline" | "server" }> => {
      if (isWhisperAvailable() && offlineReady) {
        try {
          const result = await transcribeOffline(uri);
          if (result.text) return { text: result.text, engine: "offline" };
        } catch {
          // Fall through to the server path.
        }
      }
      if (onlineReady !== false) {
        const ext = uri.split(".").pop()?.toLowerCase() ?? "m4a";
        const formData = new FormData();
        await appendFileToFormData(
          formData,
          "audio",
          uri,
          `voice-note.${ext}`,
          MIME_FOR_EXT[ext] ?? "audio/mp4",
        );
        const data = await api.upload<{ text: string; readable: boolean }>(
          "/tools/transcribe",
          formData,
        );
        if (data.readable && data.text) return { text: data.text, engine: "server" };
      }
      throw new Error("no-transcription");
    },
    [offlineReady, onlineReady],
  );

  const runExchange = useCallback(
    async (uri: string) => {
      setPhase("transcribing");
      let transcribed: { text: string; engine: "offline" | "server" };
      try {
        transcribed = await transcribe(uri);
      } catch {
        setPhase("error");
        setError(
          isWhisperAvailable() && !offlineReady
            ? "You're offline and the on-device voice model isn't downloaded yet. Download it once (over Wi-Fi) to transcribe with no internet — or connect to the internet."
            : "Couldn't hear you clearly. Try again, closer to the mic, or type in the chat instead.",
        );
        return;
      }
      const question = transcribed.text;
      if (!question.trim()) {
        setPhase("idle");
        setError("I didn't catch any words — try again.");
        return;
      }
      setExchanges((prev) => [
        ...prev,
        { role: "user", text: question },
      ]);
      setPhase("answering");
      try {
        const answer = await askAi(question);
        setExchanges((prev) => [...prev, { role: "assistant", text: answer }]);
        // A completed AI Q&A is meaningful study activity (streak).
        void logStudyActivity();
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
        setPhase("idle");
        speakAloud(answer);
      } catch {
        setPhase("error");
        setError(
          "The AI couldn't answer right now. Check your connection and try again, or type in the chat.",
        );
      }
    },
    [transcribe, askAi, speakAloud, offlineReady],
  );

  const toggleMic = useCallback(async () => {
    if (speaking) {
      stopSpeech();
      return;
    }
    if (phase === "listening") {
      try {
        await recorder.stop();
        const uri = recorder.uri;
        setPhase("idle");
        if (uri) await runExchange(uri);
      } catch {
        setPhase("error");
        setError("Couldn't finish that recording — try again.");
      }
      return;
    }
    // Start listening.
    setError(null);
    try {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        setPhase("error");
        setError(
          "Matriq needs microphone permission for Voice Mode — allow it in Settings, then try again.",
        );
        return;
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase("listening");
    } catch {
      setPhase("error");
      setError("Couldn't start the microphone — try again.");
    }
  }, [phase, recorder, runExchange, speaking, stopSpeech]);

  const installVoiceModel = useCallback(async () => {
    if (!isWhisperAvailable()) {
      setError(
        "On-device voice needs the app update with the voice engine. Until then, Voice Mode transcribes over the internet.",
      );
      return;
    }
    setDownloadingVoiceModel(true);
    try {
      await downloadVoiceModel(() => {});
      setOfflineReady(true);
      setError(null);
    } catch {
      setError("Couldn't download the voice model — check your connection.");
    } finally {
      setDownloadingVoiceModel(false);
    }
  }, []);

  const micBg =
    phase === "listening"
      ? colors.error
      : phase === "idle"
        ? colors.accent
        : colors.surfaceAlt;
  const micDisabled =
    phase === "transcribing" || phase === "answering" || downloadingVoiceModel;

  return (
    <KeyboardScreen
      edges={["top", "left", "right"]}
      padding={0}
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40, flexGrow: 1 }}
    >
      {/* Header */}
      <Text style={[theme.typography.display, { color: colors.textPrimary }]}>
        Voice Mode
      </Text>
      <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 2 }]}>
        Speak a question, hear the answer. Hands-free study.
      </Text>

      {/* Privacy / engine note */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginTop: 12,
          padding: 10,
          borderRadius: theme.radii.md,
          backgroundColor: colors.surfaceAlt,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Icon name="shield" size={14} color={colors.textMuted} />
        <Text style={[theme.typography.small, { color: colors.textSecondary, flex: 1, lineHeight: 16 }]}>
          {offlineReady
            ? "Transcription runs on your phone — your voice never leaves the device."
            : "Transcription is on-device when you download the free voice model (over Wi-Fi); until then it uses Matriq's secure online service."}
        </Text>
      </View>

      {/* Exchange list */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, marginTop: 16 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 8 }}
      >
        {exchanges.length === 0 ? (
          <Surface variant="sticker" style={{ padding: 18, marginBottom: 0 }}>
            <Text style={[theme.typography.h3, { color: colors.textPrimary }]}>
              Try: “Explain the Krebs cycle”
            </Text>
            <Text style={[theme.typography.caption, { color: colors.textSecondary, marginTop: 6, lineHeight: 20 }]}>
              Tap the button, ask your question, and release when you're done.
              Matriq answers, reads it aloud, then listens for your next
              question — like a study session that talks back.
            </Text>
          </Surface>
        ) : (
          exchanges.map((e, i) => (
            <View
              key={i}
              style={{
                alignSelf: e.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "86%",
                marginBottom: 10,
                padding: 12,
                borderRadius: theme.radii.lg,
                backgroundColor:
                  e.role === "user" ? colors.accent : colors.surface,
                borderWidth: e.role === "user" ? 0 : 1,
                borderColor: colors.border,
                borderTopRightRadius: e.role === "user" ? 4 : theme.radii.lg,
                borderTopLeftRadius: e.role === "user" ? theme.radii.lg : 4,
              }}
            >
              <Text
                selectable
                style={[
                  theme.typography.caption,
                  {
                    color: e.role === "user" ? "#17181A" : colors.textSecondary,
                    lineHeight: 20,
                    fontFamily:
                      e.role === "user"
                        ? "Inter_600SemiBold"
                        : theme.typography.caption.fontFamily,
                  },
                ]}
              >
                {e.text}
              </Text>
            </View>
          ))
        )}

        {(phase === "transcribing" || phase === "answering") && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 }}>
            <ActivityIndicator size="small" color={colors.brand} />
            <Text style={[theme.typography.caption, { color: colors.textMuted }]}>
              {phase === "transcribing"
                ? offlineReady
                  ? "Transcribing on your phone…"
                  : "Transcribing…"
                : "Thinking…"}
            </Text>
          </View>
        )}

        {error && phase === "error" ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 8,
              padding: 12,
              borderRadius: theme.radii.md,
              backgroundColor: colors.errorBg,
              borderWidth: 1,
              borderColor: colors.error + "44",
              marginTop: 4,
            }}
          >
            <Icon name="alert" size={15} color={colors.error} />
            <View style={{ flex: 1 }}>
              <Text style={[theme.typography.caption, { color: colors.error, lineHeight: 19 }]}>
                {error}
              </Text>
              {isWhisperAvailable() && !offlineReady && onlineReady !== false ? (
                <Pressable onPress={() => void installVoiceModel()} disabled={downloadingVoiceModel} style={{ marginTop: 8, alignSelf: "flex-start" }}>
                  {downloadingVoiceModel ? (
                    <ActivityIndicator size="small" color={colors.error} />
                  ) : (
                    <Text style={[theme.typography.captionBold, { color: colors.error, textDecorationLine: "underline" }]}>
                      Download the offline voice model (~72 MB, once)
                    </Text>
                  )}
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => {
                  setPhase("idle");
                  setError(null);
                }}
                style={{ marginTop: 8, alignSelf: "flex-start" }}
              >
                <Text style={[theme.typography.captionBold, { color: colors.error }]}>
                  Dismiss
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Mic control */}
      <View style={{ alignItems: "center", paddingTop: 8 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            marginBottom: 10,
          }}
        >
          {speaking ? (
            <>
              <Pressable
                onPress={togglePause}
                hitSlop={6}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: colors.surfaceAlt,
                  borderWidth: 1,
                  borderColor: colors.borderStrong,
                  alignItems: "center",
                  justifyContent: "center",
                }}
                accessibilityRole="button"
                accessibilityLabel={paused ? "Resume reading" : "Pause reading"}
              >
                <Icon
                  name={paused ? "play" : "pause"}
                  size={17}
                  color={colors.textPrimary}
                />
              </Pressable>
              <Pressable
                onPress={stopSpeech}
                hitSlop={6}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: colors.surfaceAlt,
                  borderWidth: 1,
                  borderColor: colors.borderStrong,
                  alignItems: "center",
                  justifyContent: "center",
                }}
                accessibilityRole="button"
                accessibilityLabel="Stop reading"
              >
                <Icon name="x" size={17} color={colors.textPrimary} />
              </Pressable>
            </>
          ) : null}
          <Pressable
            onPress={() => void toggleMic()}
            disabled={micDisabled}
            accessibilityRole="button"
            accessibilityLabel={
              phase === "listening"
                ? "Stop recording and send"
                : "Start speaking"
            }
            style={{
              width: 92,
              height: 92,
              borderRadius: 46,
              backgroundColor: micBg,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: theme.mode === "pop" && phase === "idle" ? 3 : 0,
              borderColor: colors.borderStrong,
              boxShadow:
                phase === "listening"
                  ? "0 0 0 10px rgba(220,38,38,0.15)"
                  : phase === "idle"
                    ? "0 0 28px rgba(198,255,61,0.35)"
                    : undefined,
              opacity: micDisabled ? 0.6 : 1,
            }}
          >
            {micDisabled ? (
              <ActivityIndicator size="large" color={colors.textSecondary} />
            ) : phase === "listening" ? (
              <Icon name="x" size={30} color="#FFFFFF" strokeWidth={2.4} />
            ) : (
              <Icon name="mic" size={38} color="#17181A" strokeWidth={1.8} />
            )}
          </Pressable>
        </View>

        <Text style={[theme.typography.captionBold, { color: colors.textPrimary }]}>
          {speaking
            ? paused
              ? "Paused — tap to resume"
              : "Reading the answer…"
            : phase === "listening"
              ? "Listening — tap to stop & send"
              : phase === "transcribing"
                ? "Transcribing…"
                : phase === "answering"
                  ? "Thinking…"
                  : phase === "error"
                    ? "Something went wrong"
                    : "Tap and speak your question"}
        </Text>

        {Platform.OS === "web" ? (
          <Text style={[theme.typography.small, { color: colors.textMuted, marginTop: 8, textAlign: "center" }]}>
            Voice Mode needs the mobile app — open it on Android to speak.
          </Text>
        ) : null}

        <Pressable
          onPress={() =>
            (navigation as { navigate: (s: string) => void }).navigate("AiChat")
          }
          hitSlop={6}
          style={{ marginTop: 6, padding: 6 }}
        >
          <Text style={[theme.typography.small, { color: colors.brand, textDecorationLine: "underline" }]}>
            Prefer typing? Open the AI chat
          </Text>
        </Pressable>
      </View>
    </KeyboardScreen>
  );
}