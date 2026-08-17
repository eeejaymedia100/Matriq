import * as FileSystem from "expo-file-system/legacy";
import type { ChatTurn } from "./OfflineAiContext";

/**
 * Conversation history for the offline AI chat. Each conversation is saved
 * under the app's document directory (survives restarts). The chat screen
 * saves after every completed exchange; the History screen lists them and
 * opens one back into the chat.
 */
export interface Conversation {
  id: string;
  /** First user message, truncated — shown in the history list. */
  title: string;
  updatedAt: number;
  messages: ChatTurn[];
}

const HISTORY_DIR = "matriq-offline-ai/";
const HISTORY_FILE = "matriq-offline-ai/history.json";

const MAX_CONVERSATIONS = 50;

function baseDir(): string {
  if (!FileSystem.documentDirectory) {
    throw new Error("Storage is unavailable on this device");
  }
  return FileSystem.documentDirectory;
}

export function historyFileUri(): string {
  return `${baseDir()}${HISTORY_FILE}`;
}

export async function loadHistory(): Promise<Conversation[]> {
  try {
    const raw = await FileSystem.readAsStringAsync(historyFileUri());
    const parsed = JSON.parse(raw) as { conversations?: Conversation[] };
    return Array.isArray(parsed.conversations) ? parsed.conversations : [];
  } catch {
    return [];
  }
}

async function writeHistory(conversations: Conversation[]): Promise<void> {
  await FileSystem.makeDirectoryAsync(`${baseDir()}${HISTORY_DIR}`, {
    intermediates: true,
  }).catch(() => {});
  await FileSystem.writeAsStringAsync(
    historyFileUri(),
    JSON.stringify({ conversations }),
  );
}

/** Upsert a conversation (newest first, capped). */
export async function saveConversation(conv: Conversation): Promise<void> {
  const all = await loadHistory();
  const rest = all.filter((c) => c.id !== conv.id);
  const next = [conv, ...rest].slice(0, MAX_CONVERSATIONS);
  await writeHistory(next);
}

export async function deleteConversation(id: string): Promise<void> {
  const all = await loadHistory();
  await writeHistory(all.filter((c) => c.id !== id));
}

/** Build the title from the first user message. */
export function titleFromMessages(messages: ChatTurn[]): string {
  const first = messages.find((m) => m.role === "user");
  const raw = (first?.content ?? "New conversation").trim();
  return raw.length > 60 ? `${raw.slice(0, 57)}…` : raw;
}
