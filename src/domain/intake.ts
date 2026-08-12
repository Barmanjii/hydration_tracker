/**
 * Turning raw drink entries into the numbers the app shows.
 *
 * Everything here is pure. The database layer's only job is to hand over rows;
 * all counting happens in this file so it can be tested without a device, an
 * emulator, or a real SQLite instance.
 */

import { dayKeyFor, DEFAULT_DAY_START_HOUR } from "./day";

/** A single logged drink, as stored. */
export interface DrinkEntry {
  /** Epoch milliseconds at which the drink was logged. */
  loggedAt: number;
  /** Volume in millilitres. Always positive. */
  amountMl: number;
}

/** Total intake for one logical day. */
export interface DayTotal {
  /** Logical day key, `YYYY-MM-DD`. */
  dayKey: string;
  /** Sum of all amounts logged on that logical day. */
  totalMl: number;
}

/**
 * Sum entries into per day totals.
 *
 * Days with no entries are absent rather than present with a zero. Callers that
 * need a continuous range should fill the gaps themselves, because what a gap
 * means differs by caller: a chart wants zero, a streak wants "not met".
 *
 * @param entries Drink entries in any order.
 * @param dayStartHour Hour the logical day begins.
 * @returns Totals sorted by day key, ascending.
 */
export function dayTotals(
  entries: readonly DrinkEntry[],
  dayStartHour: number = DEFAULT_DAY_START_HOUR
): DayTotal[] {
  const sums = new Map<string, number>();

  for (const entry of entries) {
    const key = dayKeyFor(new Date(entry.loggedAt), dayStartHour);
    sums.set(key, (sums.get(key) ?? 0) + entry.amountMl);
  }

  return [...sums.entries()]
    .map(([dayKey, totalMl]) => ({ dayKey, totalMl }))
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey));
}

/**
 * Total logged on one logical day.
 *
 * @param entries Drink entries in any order.
 * @param dayKey Logical day to total.
 * @param dayStartHour Hour the logical day begins.
 * @returns Millilitres logged on that day, zero if none.
 */
export function totalForDay(
  entries: readonly DrinkEntry[],
  dayKey: string,
  dayStartHour: number = DEFAULT_DAY_START_HOUR
): number {
  let total = 0;

  for (const entry of entries) {
    if (dayKeyFor(new Date(entry.loggedAt), dayStartHour) === dayKey) {
      total += entry.amountMl;
    }
  }

  return total;
}

/**
 * Logical days on which the goal was reached.
 *
 * Returned as a Set because the only consumer is streak counting, which does
 * membership tests and nothing else.
 *
 * @param entries Drink entries in any order.
 * @param goalMl Daily goal in millilitres. Must be positive.
 * @param dayStartHour Hour the logical day begins.
 * @returns Set of day keys where the total reached the goal.
 */
export function metDayKeys(
  entries: readonly DrinkEntry[],
  goalMl: number,
  dayStartHour: number = DEFAULT_DAY_START_HOUR
): Set<string> {
  if (!(goalMl > 0)) {
    throw new RangeError(`goalMl must be positive, got ${goalMl}`);
  }

  const met = new Set<string>();

  for (const { dayKey, totalMl } of dayTotals(entries, dayStartHour)) {
    // Reaching the goal exactly counts. Anything else would mean the last
    // mouthful of a met goal silently does not register.
    if (totalMl >= goalMl) met.add(dayKey);
  }

  return met;
}

/**
 * How far through today's goal the user is, as a fraction.
 *
 * Clamped to 1 so a user who drinks more than the goal does not get a progress
 * ring that overflows its own geometry. The raw total is still available from
 * `totalForDay` for anyone who wants to show the excess.
 *
 * @param totalMl Amount logged so far today.
 * @param goalMl Daily goal in millilitres. Must be positive.
 * @returns Progress between 0 and 1 inclusive.
 */
export function goalProgress(totalMl: number, goalMl: number): number {
  if (!(goalMl > 0)) {
    throw new RangeError(`goalMl must be positive, got ${goalMl}`);
  }

  return Math.min(1, Math.max(0, totalMl / goalMl));
}
