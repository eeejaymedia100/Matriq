import React, { useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  configurePushNotifications,
  ensureNotificationPermission,
  registerPushToken,
  unregisterPushToken,
  subscribeToPushResponses,
} from "../services/pushNotifications";
import { navigateByLink } from "../navigation/deepLinks";

/**
 * Mounted once at the app root (inside AuthProvider). Owns the whole push
 * lifecycle so no screen has to think about it:
 *
 *  - requests the device notification permission the moment the app opens,
 *  - creates the branded Matriq channel + foreground banner behavior,
 *  - registers the FCM device token whenever a session is active and removes
 *    it on logout / session end,
 *  - routes taps on notifications to their in-app destination (deep link).
 *
 * Renders nothing.
 */
export function PushNotificationsGate() {
  const { user } = useAuth();
  const lastUserId = useRef<string | null>(null);

  // One-time setup at launch: permission ask + banner/channel + tap routing.
  useEffect(() => {
    void configurePushNotifications();
    void ensureNotificationPermission();
    return subscribeToPushResponses((data) => {
      navigateByLink(data.link);
    });
  }, []);

  // The token follows the session: register when a user is present, remove
  // when the session ends. The ref keeps this effect from re-firing on every
  // render (e.g. profile refreshes) — only actual user changes matter.
  useEffect(() => {
    const uid = user?.id ?? null;
    if (uid === lastUserId.current) return;
    lastUserId.current = uid;
    if (uid) {
      void registerPushToken();
    } else {
      void unregisterPushToken();
    }
  }, [user?.id]);

  return null;
}
