/**
 * Streak counting over logical days.
 *
 * A streak is the run of consecutive logical days on which the daily goal was
 * met. See `day.ts` for what "logical day" means here.
 */

import { previousDayKey } from "./day";

/**
 * Length of the streak ending at or immediately before today.
 *
 * A day still in progress does not break the streak. If today's goal is not met
 * yet, counting starts from yesterday, so the number holds steady through the
 * morning instead of showing a zero the user has not earned. The streak only
 * breaks once a day has fully passed unmet.
 *
 * @param metDayKeys Logical day keys on which the goal was met, as `YYYY-MM-DD`.
 * @param todayKey The current logical day key.
 * @returns Number of consecutive days met, ending today or yesterday.
 */
export function currentStreak(
  metDayKeys: Iterable<string>,
  todayKey: string
): number {
  const met = metDayKeys instanceof Set ? metDayKeys : new Set(metDayKeys);

  // Today counts only if already met. Otherwise the run is measured from
  // yesterday, leaving today open rather than treating it as a failure.
  let cursor = met.has(todayKey) ? todayKey : previousDayKey(todayKey);

  let length = 0;
  while (met.has(cursor)) {
    length += 1;
    cursor = previousDayKey(cursor);
  }

  return length;
}

/**
 * Whether an unmet day is the only thing standing between the user and losing a
 * streak they currently hold.
 *
 * Useful for deciding whether a reminder is worth escalating. Returns false when
 * there is no streak to lose, so a new user is not nagged about nothing.
 *
 * @param metDayKeys Logical day keys on which the goal was met.
 * @param todayKey The current logical day key.
 * @returns True when a streak exists and today has not been met yet.
 */
export function isStreakAtRisk(
  metDayKeys: Iterable<string>,
  todayKey: string
): boolean {
  const met = metDayKeys instanceof Set ? metDayKeys : new Set(metDayKeys);

  if (met.has(todayKey)) return false;

  return currentStreak(met, todayKey) > 0;
}
