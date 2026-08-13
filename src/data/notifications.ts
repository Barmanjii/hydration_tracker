/**
 * Local notification scheduling.
 *
 * Thin, like `db.ts`. It asks for permission and turns a list of moments into
 * scheduled notifications. Deciding *which* moments is `src/domain/reminders.ts`,
 * so that decision stays testable without a device.
 *
 * These are local notifications, not push. Nothing contacts a server, no token
 * is registered, and reminders fire with the network off. That is a requirement
 * of the app, not an implementation detail.
 */

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/**
 * Marks a notification as ours.
 *
 * Only notifications carrying this are cancelled on a resync, so the app never
 * clears something another part of the system scheduled.
 */
const REMINDER_MARKER = "hydration-reminder";

/** Android channel id. Android requires a channel before anything will show. */
const ANDROID_CHANNEL_ID = "reminders";

/** What the user sees. Short, because a reminder is read at a glance. */
const REMINDER_TITLE = "Time for some water";
const REMINDER_BODY = "A quick glass keeps you on track.";

/** Whether reminders can currently be shown. */
export type PermissionState = "granted" | "denied" | "undetermined";

// Foreground behaviour has to be declared or a notification arriving while the
// app is open is silently swallowed, which looks like a scheduling bug.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Create the Android notification channel.
 *
 * A no op elsewhere. Safe to call repeatedly; Android treats it as an update.
 */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: "Hydration reminders",
    importance: Notifications.AndroidImportance.DEFAULT,
    // No sound and no vibration. A hydration nudge that interrupts is worse
    // than one that waits to be noticed.
    sound: null,
    vibrationPattern: null,
    enableVibrate: false,
  });
}

/**
 * Current permission state, without prompting.
 *
 * @returns Whether reminders may be shown.
 */
export async function reminderPermission(): Promise<PermissionState> {
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();

  if (status === "granted") return "granted";

  // Android 13 and later report a POST_NOTIFICATIONS that has never been
  // requested as "denied", because the module derives status from
  // NotificationManagerCompat.areNotificationsEnabled(), which is false until
  // the permission is granted. Trusting status alone would mean showing
  // "blocked" on every fresh install and never offering the prompt, which makes
  // reminders unreachable. canAskAgain is the only signal that separates never
  // asked from actually blocked.
  return canAskAgain ? "undetermined" : "denied";
}

/**
 * Ask for permission, prompting if it has not been decided.
 *
 * Android 13 and later require this at runtime. A denial is a normal outcome,
 * not an error: the app keeps working, it just cannot remind.
 *
 * @returns The resulting permission state.
 */
export async function requestReminderPermission(): Promise<PermissionState> {
  const existing = await reminderPermission();
  if (existing === "granted") {
    await ensureAndroidChannel();
    return existing;
  }

  // Not re-prompting after an explicit denial. The system will not show the
  // dialog again anyway, and pretending otherwise would mean reporting a
  // request that never happened.
  if (existing === "denied") return existing;

  const { status } = await Notifications.requestPermissionsAsync();
  if (status === "granted") {
    await ensureAndroidChannel();
    return "granted";
  }

  return status === "denied" ? "denied" : "undetermined";
}

/**
 * Cancel every reminder this app scheduled.
 *
 * Identified by marker rather than cancelling everything, so nothing else is
 * disturbed.
 */
export async function cancelReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();

  await Promise.all(
    scheduled
      .filter((item) => item.content.data?.kind === REMINDER_MARKER)
      .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier))
  );
}

/**
 * Serialises syncs, and lets a newer one abandon an older one.
 *
 * Both halves are needed. A sync is one cancel plus up to thirty schedule calls,
 * so two overlapping runs interleave: the second cancels only what the first has
 * landed so far, and the first then schedules the rest, leaving orphans that
 * nothing will ever cancel. The queue stops the interleaving; the generation
 * counter stops a superseded run from finishing work that is already stale.
 */
let syncQueue: Promise<unknown> = Promise.resolve();
let syncGeneration = 0;

/**
 * Replace all scheduled reminders with the given moments.
 *
 * Cancel then schedule, rather than diffing. The list is small, this runs on app
 * open rather than in a hot path, and a replace cannot drift out of step with
 * what is actually pending the way a diff can.
 *
 * Concurrent calls are serialised, and a superseded call stops early.
 *
 * @param moments When to fire, from `reminderOccurrences`.
 * @returns How many were scheduled. Zero if superseded.
 */
export function syncReminders(moments: readonly Date[]): Promise<number> {
  const generation = ++syncGeneration;

  const run = syncQueue.then(async () => {
    // Superseded while queued. Nothing to do; the newer run covers it.
    if (generation !== syncGeneration) return 0;

    await ensureAndroidChannel();
    await cancelReminders();

    // Re-read the clock here rather than trusting the caller's list, so a stale
    // queued sync cannot fire a burst of past-dated notifications.
    const now = Date.now();
    const future = moments.filter((at) => at.getTime() > now);

    let scheduled = 0;
    for (const at of future) {
      // Checked inside the loop as well: a newer sync arriving mid-loop should
      // stop this one rather than race it to the finish.
      if (generation !== syncGeneration) break;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: REMINDER_TITLE,
          body: REMINDER_BODY,
          data: { kind: REMINDER_MARKER },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: at,
          channelId: ANDROID_CHANNEL_ID,
        },
      });
      scheduled += 1;
    }

    return scheduled;
  });

  // The queue must not be poisoned by a rejection, or every later sync inherits
  // it. The caller still sees the error through `run`.
  syncQueue = run.catch(() => undefined);

  return run;
}
