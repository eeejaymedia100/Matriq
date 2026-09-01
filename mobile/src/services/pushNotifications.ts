import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { api } from "../api/client";

/**
 * Real device notifications (the "custom notification above every screen"):
 * the app requests the system notification permission the moment it opens,
 * creates a branded Matriq channel (purple tint + the white bell icon from
 * the expo-notifications config plugin), registers its FCM device token with
 * the backend, and routes taps on a notification to the right screen.
 *
 * Delivery itself is FCM-driven from the backend (server-side service
 * account) — this file only handles the device side. Until the release build
 * is configured with Firebase (google-services.json), token registration
 * silently no-ops; permission + channel + in-app banners still work.
 */

const CHANNEL_ID = "matriq";
const BRAND_COLOR = "#7B4BC4";

let configured = false;
let permissionAsked = false;
let cachedToken: string | null = null;

/** One-time app-wide setup: foreground banner behavior + branded channel. */
export async function configurePushNotifications(): Promise<void> {
  if (configured || Platform.OS === "web") return;
  configured = true;
  try {
    // Show the notification as a banner over every screen, even while the
    // app is in the foreground.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch {
    // Non-fatal — banners are a nicety.
  }
  if (Platform.OS === "android") {
    try {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: "Matriq updates",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: BRAND_COLOR,
      });
    } catch {
      // Non-fatal — the default channel still delivers.
    }
  }
}

/**
 * Ask for the device notification permission the moment the app opens. The
 * system dialog only appears once per app session (and Android only really
 * re-prompts while the user hasn't chosen "don't ask again").
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!permissionAsked) {
      permissionAsked = true;
      const requested = await Notifications.requestPermissionsAsync();
      return requested.granted;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Register this device's FCM token with the backend (called whenever a
 * session is present). Idempotent per app session — the backend upserts by
 * token, so re-registering after a relaunch just refreshes the row.
 */
export async function registerPushToken(): Promise<void> {
  if (Platform.OS !== "android" || cachedToken) return;
  const granted = await ensureNotificationPermission();
  if (!granted) return;
  try {
    const pushToken = await Notifications.getDevicePushTokenAsync();
    const token = typeof pushToken.data === "string" ? pushToken.data : "";
    if (!token) return;
    cachedToken = token;
    await api.post("/me/push/register", { token, platform: "android" });
  } catch {
    // Firebase not configured in this build yet, or offline at launch — the
    // token stays unset so the next launch retries. Never fatal.
  }
}

/** Remove the device token on logout (the backend only ever prunes the
 *  caller's own row). */
export async function unregisterPushToken(): Promise<void> {
  const token = cachedToken;
  if (!token || Platform.OS !== "android") return;
  cachedToken = null;
  try {
    await api.delete(`/me/push/register?token=${encodeURIComponent(token)}`);
  } catch {
    // Non-fatal — the backend prunes dead tokens on its own too.
  }
}

/** Key/value payload the backend attaches to each push (deep-link target). */
export interface PushNotificationData {
  link?: string;
  type?: string;
}

/**
 * Subscribe to taps on notifications — both warm (app running in background)
 * and cold start (the app was opened BY tapping a notification). Returns an
 * unsubscribe function.
 */
export function subscribeToPushResponses(
  onTap: (data: PushNotificationData) => void,
): () => void {
  if (Platform.OS === "web") return () => {};
  const handle = (response: Notifications.NotificationResponse) => {
    const content = response.notification.request.content;
    onTap((content.data ?? {}) as PushNotificationData);
  };
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  // Cold start: the tap happened before JS was ready.
  Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (response) handle(response);
    })
    .catch(() => {});
  return () => sub.remove();
}
