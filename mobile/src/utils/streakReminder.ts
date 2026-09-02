import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { StreakState } from "./streak";

/**
 * Gentle streak nudge (round-3 gamification §1 — one streak, one badge, no
 * levels). When a student has an active streak, a single local notification
 * is scheduled for the evening (19:30 local) of the NEXT day that needs a
 * study action — i.e. it only ever reminds them to KEEP a streak, never
 * nags after one is broken (current === 0 → nothing scheduled, no guilt
 * loop). The time is deliberately early evening: a student can spend 10
 * minutes and keep the chain before sleep.
 *
 * Delivery is handled by the OS (works even when the app is killed). The
 * app reschedules on every Home focus / streak change, so the reminder
 * always points at the next day that actually matters. Requires the device
 * notification permission, which the app already requests at startup (see
 * services/pushNotifications.ts); without it this silently no-ops.
 */

const STREAK_NUDGE_ID = "matriq-streak-nudge";
const NUDGE_HOUR = 19; // 7 PM local
const NUDGE_MINUTE = 30;
const CHANNEL_ID = "matriq";

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Next date at 19:30 local that needs a study action to keep the streak. */
function nextNudgeDate(streak: StreakState): Date {
  const today = dayKey(new Date());
  // Today already has study activity → remind for tomorrow. Otherwise the
  // streak is at risk today — remind this evening.
  const target = new Date();
  if (streak.lastActiveDay === today) {
    target.setDate(target.getDate() + 1);
  }
  target.setHours(NUDGE_HOUR, NUDGE_MINUTE, 0, 0);
  return target;
}

function nudgeBody(streak: StreakState): string {
  if (streak.current <= 1) {
    return "Day 1 is banked. A few minutes tonight keeps your streak going.";
  }
  return `${streak.current}-day streak is on the line — 10 minutes tonight keeps it alive.`;
}

let scheduledFor: string | null = null;

/**
 * Reschedule the streak nudge to match the current streak state. Safe to call
 * on every Home focus: cancels the old nudge (if any) and schedules the next
 * meaningful one. Idempotent — repeated calls with the same state no-op.
 */
export async function syncStreakReminder(streak: StreakState): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const permissions = await Notifications.getPermissionsAsync();
    if (!permissions.granted) return;

    // No active streak → cancel any pending nudge (a broken streak stops the
    // reminders; no guilt loop). Same-state calls also no-op here.
    if (!streak || streak.current < 1) {
      if (scheduledFor) {
        await Notifications.cancelScheduledNotificationAsync(STREAK_NUDGE_ID);
        scheduledFor = null;
      }
      return;
    }

    const target = nextNudgeDate(streak);
    const stateKey = `${dayKey(target)}:${streak.current}`;
    if (scheduledFor === stateKey) return;
    scheduledFor = stateKey;

    await Notifications.cancelScheduledNotificationAsync(STREAK_NUDGE_ID);
    await Notifications.scheduleNotificationAsync({
      identifier: STREAK_NUDGE_ID,
      content: {
        title: "Don't lose your streak",
        body: nudgeBody(streak),
        data: { type: "streak-nudge" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: target,
        channelId: CHANNEL_ID,
      },
    });
  } catch {
    // Scheduling is a nicety — never let it fail the screen.
  }
}