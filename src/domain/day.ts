/**
 * Which logical day a moment belongs to.
 *
 * A drink logged at 1am belongs to the night before, not to the new calendar
 * day. Rolling over at midnight would break a streak for someone who is simply
 * awake late, which reads as a punishment for a habit the app is not trying to
 * change. The boundary is therefore configurable and defaults to 4am.
 */

/** Hour of the local day at which a new logical day begins. */
export const DEFAULT_DAY_START_HOUR = 4;

/**
 * The logical day a timestamp falls in, as a local `YYYY-MM-DD` key.
 *
 * Anything earlier than `dayStartHour` counts towards the previous day.
 *
 * @param at Moment to classify.
 * @param dayStartHour Hour the logical day begins, 0 to 23.
 * @returns Local date key of the logical day.
 */
export function dayKeyFor(
  at: Date,
  dayStartHour: number = DEFAULT_DAY_START_HOUR
): string {
  if (!Number.isInteger(dayStartHour) || dayStartHour < 0 || dayStartHour > 23) {
    throw new RangeError(`dayStartHour must be an integer 0 to 23, got ${dayStartHour}`);
  }

  // Shifting backwards moves early morning moments into the previous date, so
  // the rest is plain local date formatting.
  const shifted = new Date(at);
  shifted.setHours(shifted.getHours() - dayStartHour);

  const year = shifted.getFullYear();
  const month = String(shifted.getMonth() + 1).padStart(2, "0");
  const date = String(shifted.getDate()).padStart(2, "0");

  return `${year}-${month}-${date}`;
}

/**
 * The logical day key immediately before the given one.
 *
 * @param dayKey A `YYYY-MM-DD` key.
 * @returns The preceding day's key.
 */
export function previousDayKey(dayKey: string): string {
  const [year, month, date] = dayKey.split("-").map(Number);
  // Month is zero based here, and day 0 of a month is the last day of the one
  // before it, so this handles month and year boundaries without special cases.
  const previous = new Date(year, month - 1, date - 1);

  const y = previous.getFullYear();
  const m = String(previous.getMonth() + 1).padStart(2, "0");
  const d = String(previous.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}
