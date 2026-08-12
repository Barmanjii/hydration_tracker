/**
 * Keeps scheduled reminders in step with logging history.
 *
 * Resyncs whenever the entries change, which means every log and every app open.
 * That is what makes the dated-occurrence approach work: the horizon is topped
 * up, and a day whose goal is now met stops nagging.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  type PermissionState,
  requestReminderPermission,
  reminderPermission,
  syncReminders,
} from "../data/notifications";
import { DEFAULT_DAY_START_HOUR, dayKeyFor } from "../domain/day";
import type { DrinkEntry } from "../domain/intake";
import { metDayKeys } from "../domain/intake";
import { planReminders, reminderOccurrences } from "../domain/reminders";

/** Reminder status for the screen, plus the one action it can take. */
export interface RemindersState {
  /** Whether reminders may be shown. */
  permission: PermissionState;
  /** How many reminders are currently scheduled. */
  scheduled: number;
  /** Whether the schedule is learned from history or still the default. */
  basis: "seed" | "learned";
  /** Prompt for permission. No effect once decided. */
  enable: () => Promise<void>;
}

export function useReminders(
  entries: readonly DrinkEntry[],
  goalMl: number
): RemindersState {
  const [permission, setPermission] = useState<PermissionState>("undetermined");
  const [scheduled, setScheduled] = useState(0);

  // Computed here rather than in the effect, so the screen can report the basis
  // even before permission is granted and anything is scheduled.
  //
  // Memoised because it is not optional: an unmemoised plan returns a fresh
  // hours array every render, and the sync effect below depends on it, so the
  // effect would refire on every render and reschedule notifications forever.
  const plan = useMemo(() => planReminders(entries), [entries]);

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
  }, []);

  useEffect(() => {
    if (permission !== "granted") return;

    let cancelled = false;

    void (async () => {
      try {
        const todayKey = dayKeyFor(new Date(), DEFAULT_DAY_START_HOUR);
        const todayGoalMet = metDayKeys(
          entries,
          goalMl,
          DEFAULT_DAY_START_HOUR
        ).has(todayKey);

        const moments = reminderOccurrences(
          plan.hours,
          new Date(),
          undefined,
          todayGoalMet
        );

        const count = await syncReminders(moments);
        if (!cancelled) setScheduled(count);
      } catch {
        // Scheduling is best effort. Failing to set a reminder must never stop
        // the user logging a drink, which is the thing that actually matters.
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
