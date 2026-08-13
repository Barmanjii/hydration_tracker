/**
 * Keeps scheduled reminders in step with logging history.
 *
 * Resyncs whenever the entries change, which means every log and every app open.
 * That is what makes the dated-occurrence approach work: the horizon is topped
 * up, and a day whose goal is now met stops nagging.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";

import {
  type PermissionState,
  requestReminderPermission,
  reminderPermission,
  syncReminders,
} from "../data/notifications";
import { DEFAULT_DAY_START_HOUR } from "../domain/day";
import { type DrinkEntry, metDayKeys } from "../domain/intake";
import { planReminders, reminderOccurrences } from "../domain/reminders";

/** Reminder status for the screen, plus the one action it can take. */
export interface RemindersState {
  /** Whether reminders may be shown. */
  permission: PermissionState;
  /**
   * How many reminders are currently scheduled, or null if scheduling failed or
   * has not run. Null is distinct from zero: zero would mean nothing is due,
   * which is not the same as not knowing.
   */
  scheduled: number | null;
  /** Whether the schedule is learned from history or still the default. */
  basis: "seed" | "learned";
  /** Prompt for permission. No effect once permanently blocked. */
  enable: () => Promise<void>;
}

export function useReminders(
  entries: readonly DrinkEntry[] | null,
  goalMl: number
): RemindersState {
  const [permission, setPermission] = useState<PermissionState>("undetermined");
  const [scheduled, setScheduled] = useState<number | null>(null);

  // Computed here rather than in the effect, so the screen can report the basis
  // even before permission is granted and anything is scheduled.
  //
  // Memoised because it is not optional: an unmemoised plan returns a fresh
  // hours array every render, and the sync effect below depends on it, so the
  // effect would refire on every render and reschedule notifications forever.
  const plan = useMemo(() => planReminders(entries ?? []), [entries]);

  // Bumped to trigger a re-read, same pattern as the reload token in useIntake.
  // The read itself has to live inside an effect rather than in a callback the
  // effect invokes, so that no state is set synchronously in an effect body.
  const [permissionToken, setPermissionToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const state = await reminderPermission();
        if (!cancelled) setPermission(state);
      } catch {
        // A permission read failing is not worth surfacing. The app works
        // without reminders, and the enable button remains available.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [permissionToken]);

  useEffect(() => {
    // Re-read on return to the foreground. Without this, a user who follows the
    // "enable in system settings" advice comes back to an app still convinced it
    // is blocked, and nothing schedules until the process is killed.
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") setPermissionToken((token) => token + 1);
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (permission !== "granted") return;

    // Null means the first load has not landed. Syncing now would install a seed
    // schedule over a learned one, and if the process died before the load
    // finished that seed schedule is what the user would be left with.
    if (entries === null) return;

    let cancelled = false;

    void (async () => {
      try {
        const met = metDayKeys(entries, goalMl, DEFAULT_DAY_START_HOUR);
        const moments = reminderOccurrences(plan.hours, new Date(), met);

        const count = await syncReminders(moments);
        if (!cancelled) setScheduled(count);
      } catch {
        // Scheduling is best effort. Failing to set a reminder must never stop
        // the user logging a drink, which is the thing that actually matters.
        // Left as null rather than zero, so the screen does not report success.
        if (!cancelled) setScheduled(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [permission, entries, goalMl, plan.hours]);

  const enable = useCallback(async () => {
    try {
      setPermission(await requestReminderPermission());
    } catch {
      // Leaves the state as it was, so the button stays available to retry.
    }
  }, []);

  return { permission, scheduled, basis: plan.basis, enable };
}
