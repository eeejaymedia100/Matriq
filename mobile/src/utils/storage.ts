import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * Cross-platform key-value storage.
 *
 * The web version (for iOS users, per the product spec) has no SecureStore,
 * so everything the app persists goes through this wrapper: native builds
 * use expo-secure-store, the web build falls back to localStorage. New
 * persistence should always use this module — never SecureStore directly.
 */
const IS_WEB = Platform.OS === "web";

function hasWindow(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

export async function getItem(key: string): Promise<string | null> {
  if (IS_WEB) {
    try {
      return hasWindow() ? window.localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key).catch(() => null);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (IS_WEB) {
    try {
      if (hasWindow()) window.localStorage.setItem(key, value);
    } catch {
      // Quota/private-mode — non-fatal, preference simply won't persist.
    }
    return;
  }
  await SecureStore.setItemAsync(key, value).catch(() => {});
}

export async function deleteItem(key: string): Promise<void> {
  if (IS_WEB) {
    try {
      if (hasWindow()) window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
    return;
  }
  await SecureStore.deleteItemAsync(key).catch(() => {});
}
