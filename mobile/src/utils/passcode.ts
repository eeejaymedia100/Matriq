import { AppState, type AppStateStatus } from "react-native";
import { getItem, setItem, deleteItem } from "./storage";

/**
 * Passcode / session system (spec §4–§5).
 *
 * - Every account sets a 6-digit passcode immediately after verification,
 *   before Home is ever seen (enforced by the root session gate).
 * - Returning users never see the sign-in screen again: under 3 hours since
 *   the app was last exited they go straight to Home; at 3 hours or more they
 *   get the "Welcome back" passcode screen.
 * - The "last exited" timestamp is tracked from the moment the app loses
 *   foreground focus (backgrounding counts the same as closing), via the
 *   AppState listener wired up in the session gate.
 */
const PASSCODE_KEY = "passcode";
const LAST_EXIT_KEY = "last_exit_at";
const UNLOCKED_AT_KEY = "unlocked_at";

/** Spec §5: re-authentication kicks in after 3 hours away. */
export const SESSION_GRACE_MS = 3 * 60 * 60 * 1000;

export async function hasPasscode(): Promise<boolean> {
  return (await getItem(PASSCODE_KEY)) !== null;
}

export async function getPasscode(): Promise<string | null> {
  return getItem(PASSCODE_KEY);
}

export async function setPasscode(code: string): Promise<void> {
  await setItem(PASSCODE_KEY, code);
  // A freshly-set passcode must not immediately lock the user out.
  await setItem(LAST_EXIT_KEY, String(Date.now()));
  await setItem(UNLOCKED_AT_KEY, String(Date.now()));
}

export async function clearPasscode(): Promise<void> {
  await deleteItem(PASSCODE_KEY);
}

export async function getLastExitAt(): Promise<number | null> {
  const raw = await getItem(LAST_EXIT_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function markLastExit(): Promise<void> {
  await setItem(LAST_EXIT_KEY, String(Date.now()));
}

export async function markUnlocked(): Promise<void> {
  await setItem(UNLOCKED_AT_KEY, String(Date.now()));
}

export async function getUnlockedAt(): Promise<number | null> {
  const raw = await getItem(UNLOCKED_AT_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * True when the app should demand the passcode: a passcode exists AND the
 * last known foreground moment (either last unlock or last app exit) is more
 * than 3 hours old.
 */
export async function shouldRequirePasscode(): Promise<boolean> {
  if (!(await hasPasscode())) return false;
  const anchor = (await getUnlockedAt()) ?? (await getLastExitAt()) ?? 0;
  return Date.now() - anchor > SESSION_GRACE_MS;
}

/**
 * AppState helper for the session gate: records the exit timestamp whenever
 * the app loses foreground focus.
 */
export function watchSessionExit(onForeground: () => void): () => void {
  const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
    if (state === "background" || state === "inactive") {
      void markLastExit();
    } else if (state === "active") {
      onForeground();
    }
  });
  return () => sub.remove();
}
