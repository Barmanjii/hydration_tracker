/**
 * Choosing when to remind.
 *
 * The plan is explicit that this starts as plain statistics and only reaches for
 * a model once simple statistics have demonstrably failed. So this file counts
 * hours and picks the quiet ones. Nothing more.
 *
 * The whole point is that a reminder arriving when the user was going to drink
 * anyway is worse than no reminder, because it trains them to dismiss the app.
 * A reminder in a stretch where they historically go dry is the only kind worth
 * sending.
 */

import { assertDayStartHour, dayKeyFor, DEFAULT_DAY_START_HOUR } from "./day";
import type { DrinkEntry } from "./intake";

/** First hour of the day a reminder may fire. */
export const DEFAULT_WAKING_START_HOUR = 7;

/** Last hour of the day a reminder may fire. */
export const DEFAULT_WAKING_END_HOUR = 22;

/** How many reminders to schedule across the waking window. */
export const DEFAULT_REMINDER_COUNT = 4;

/** Minimum hours between two reminders, so they do not cluster. */
export const MIN_REMINDER_GAP_HOURS = 2;

/**
 * Distinct logged days needed before the schedule is learned rather than seeded.
 *
 * Three is a judgement call, not a derived number. Below it, the histogram is
 * mostly noise and a "learned" schedule would just be overfitting to one
 * unusual day.
 */
export const MIN_DAYS_TO_LEARN = 3;

/** How reminder times were arrived at. */
export type ReminderBasis = "seed" | "learned";

/** A set of reminder times, and an honest note about where they came from. */
export interface ReminderPlan {
  /** Local hours of the day to remind at, ascending. */
  hours: number[];
  /**
   * Whether these hours were learned from history or are the starting default.
   * Surfaced so the interface can avoid claiming to have learned something it
   * has not.
   */
  basis: ReminderBasis;
  /** Distinct logical days of history the plan was computed from. */
  daysOfHistory: number;
}

/** Tuning for `planReminders`. All optional. */
export interface ReminderOptions {
  wakingStartHour?: number;
  wakingEndHour?: number;
  reminderCount?: number;
  dayStartHour?: number;
}

/**
 * How many times the user logged a drink in each hour of the local day.
 *
 * @param entries Drink entries in any order.
 * @returns Array of 24 counts, indexed by local hour.
 */
export function loggingHourHistogram(
  entries: readonly DrinkEntry[]
): number[] {
  const counts = new Array<number>(24).fill(0);

  for (const entry of entries) {
    const hour = new Date(entry.loggedAt).getHours();
    counts[hour] += 1;
  }

  return counts;
}

/**
 * Distinct logical days that contain at least one entry.
 *
 * @param entries Drink entries in any order.
 * @param dayStartHour Hour the logical day begins.
 * @returns Count of distinct logical days.
 */
export function daysOfHistory(
  entries: readonly DrinkEntry[],
  dayStartHour: number = DEFAULT_DAY_START_HOUR
): number {
  assertDayStartHour(dayStartHour);

  const days = new Set<string>();
  for (const entry of entries) {
    days.add(dayKeyFor(new Date(entry.loggedAt), dayStartHour));
  }

  return days.size;
}

/**
 * Evenly spaced hours across a window, used before there is history to learn from.
 *
 * @param startHour First hour of the window, inclusive.
 * @param endHour Last hour of the window, inclusive.
 * @param count How many hours to pick.
 * @returns Ascending hours, evenly spread.
 */
function seedHours(startHour: number, endHour: number, count: number): number[] {
  const span = endHour - startHour;

  // One reminder goes in the middle rather than at the very start of the day,
  // where it would fire before the user is properly up.
  if (count === 1) return [Math.round(startHour + span / 2)];

  const step = span / (count - 1);
  const hours = new Set<number>();

  for (let i = 0; i < count; i += 1) {
    hours.add(Math.round(startHour + step * i));
  }

  return [...hours].sort((a, b) => a - b);
}

/**
 * Pick reminder hours, preferring the user's historically driest stretches.
 *
 * Below `MIN_DAYS_TO_LEARN` days of history the result is an evenly spaced seed
 * schedule, reported as such. Above it, hours are ranked by how rarely the user
 * has logged in them, and chosen greedily while keeping at least
 * `MIN_REMINDER_GAP_HOURS` between picks so they do not bunch together.
 *
 * @param entries Drink entries in any order.
 * @param options Window and count overrides.
 * @returns The chosen hours, the basis, and how much history informed it.
 *
 * @throws RangeError If the waking window or reminder count is not usable.
 */
export function planReminders(
  entries: readonly DrinkEntry[],
  options: ReminderOptions = {}
): ReminderPlan {
  const {
    wakingStartHour = DEFAULT_WAKING_START_HOUR,
    wakingEndHour = DEFAULT_WAKING_END_HOUR,
    reminderCount = DEFAULT_REMINDER_COUNT,
    dayStartHour = DEFAULT_DAY_START_HOUR,
  } = options;

  if (!Number.isInteger(wakingStartHour) || wakingStartHour < 0 || wakingStartHour > 23) {
    throw new RangeError(`wakingStartHour must be 0 to 23, got ${wakingStartHour}`);
  }
  if (!Number.isInteger(wakingEndHour) || wakingEndHour < 0 || wakingEndHour > 23) {
    throw new RangeError(`wakingEndHour must be 0 to 23, got ${wakingEndHour}`);
  }
  if (wakingEndHour <= wakingStartHour) {
    throw new RangeError(
      `wakingEndHour (${wakingEndHour}) must be after wakingStartHour (${wakingStartHour})`
    );
  }
  if (!Number.isInteger(reminderCount) || reminderCount < 1) {
    throw new RangeError(`reminderCount must be a positive integer, got ${reminderCount}`);
  }

  const days = daysOfHistory(entries, dayStartHour);

  if (days < MIN_DAYS_TO_LEARN) {
    return {
      hours: seedHours(wakingStartHour, wakingEndHour, reminderCount),
      basis: "seed",
      daysOfHistory: days,
    };
  }

  const histogram = loggingHourHistogram(entries);

  // Quietest first. Ties break towards the earlier hour, so a day with no clear
  // pattern still produces a spread rather than clustering at the end.
  const ranked = [];
  for (let hour = wakingStartHour; hour <= wakingEndHour; hour += 1) {
    ranked.push({ hour, count: histogram[hour] });
  }
  ranked.sort((a, b) => a.count - b.count || a.hour - b.hour);

  const chosen: number[] = [];
  for (const { hour } of ranked) {
    if (chosen.length >= reminderCount) break;

    const tooClose = chosen.some(
      (picked) => Math.abs(picked - hour) < MIN_REMINDER_GAP_HOURS
    );
    if (!tooClose) chosen.push(hour);
  }

  // The gap rule can starve the pick list in a narrow window. Falling back to
  // the seed is better than returning fewer reminders than asked for without
  // saying so.
  if (chosen.length < reminderCount) {
    const spaced = seedHours(wakingStartHour, wakingEndHour, reminderCount);
    for (const hour of spaced) {
      if (chosen.length >= reminderCount) break;
      if (!chosen.includes(hour)) chosen.push(hour);
    }
  }

  return {
    hours: chosen.sort((a, b) => a - b),
    basis: "learned",
    daysOfHistory: days,
  };
}

/**
 * How many further days beyond today to schedule concrete reminders for.
 *
 * Reminders are dated one offs rather than a daily repeat, so that a day whose
 * goal is already met can be skipped. The cost is a horizon: if the app is not
 * opened for longer than this, reminders run out. Every open tops it back up,
 * and the user opens the app to log.
 */
export const REMINDER_HORIZON_DAYS = 7;

/**
 * Concrete moments to fire reminders at, from now to the horizon.
 *
 * Two rules, both deliberate. Hours that have already passed are skipped,
 * because a reminder for 9am scheduled at 2pm would fire immediately. And any
 * logical day whose goal is already met is skipped entirely, because nagging
 * someone who has finished is how an app gets muted.
 *
 * `metDays` is matched against the **logical** day each moment falls in, not the
 * calendar day. That distinction is load bearing: between midnight and the 4am
 * boundary those differ, so filtering on the calendar day would suppress the
 * whole of the coming day's reminders on the strength of the previous day's
 * goal.
 *
 * @param plannedHours Hours chosen by `planReminders`.
 * @param now Current moment.
 * @param metDays Logical day keys whose goal is already met, from `metDayKeys`.
 * @param daysAhead Further days to schedule beyond today. Zero means today only.
 * @param dayStartHour Hour the logical day begins.
 * @returns Ascending moments, each on the hour.
 *
 * @throws RangeError If `daysAhead` is negative or not an integer.
 */
export function reminderOccurrences(
  plannedHours: readonly number[],
  now: Date,
  metDays: ReadonlySet<string> = new Set<string>(),
  daysAhead: number = REMINDER_HORIZON_DAYS,
  dayStartHour: number = DEFAULT_DAY_START_HOUR
): Date[] {
  if (!Number.isInteger(daysAhead) || daysAhead < 0) {
    throw new RangeError(`daysAhead must be a non negative integer, got ${daysAhead}`);
  }
  assertDayStartHour(dayStartHour);

  const occurrences: Date[] = [];

  for (let offset = 0; offset <= daysAhead; offset += 1) {
    for (const hour of plannedHours) {
      // Built from local date parts, so a daylight saving shift lands on the
      // wall clock hour the user expects rather than an hour either side.
      const at = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + offset,
        hour,
        0,
        0,
        0
      );

      // Strictly after now: an hour that has just passed would otherwise fire
      // the instant it is scheduled.
      if (at.getTime() <= now.getTime()) continue;

      if (metDays.has(dayKeyFor(at, dayStartHour))) continue;

      occurrences.push(at);
    }
  }

  return occurrences.sort((a, b) => a.getTime() - b.getTime());
}
