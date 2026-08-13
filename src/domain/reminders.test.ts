import type { DrinkEntry } from "./intake";
import {
  DEFAULT_REMINDER_COUNT,
  MIN_REMINDER_GAP_HOURS,
  REMINDER_HORIZON_DAYS,
  daysOfHistory,
  loggingHourHistogram,
  planReminders,
  reminderOccurrences,
} from "./reminders";

const entry = (
  y: number,
  m: number,
  d: number,
  h: number,
  amountMl = 250
): DrinkEntry => ({
  loggedAt: new Date(y, m - 1, d, h).getTime(),
  amountMl,
});

describe("loggingHourHistogram", () => {
  it("is all zeros for no entries", () => {
    const counts = loggingHourHistogram([]);
    expect(counts).toHaveLength(24);
    expect(counts.every((c) => c === 0)).toBe(true);
  });

  it("counts entries into their local hour", () => {
    const counts = loggingHourHistogram([
      entry(2026, 8, 8, 9),
      entry(2026, 8, 8, 9),
      entry(2026, 8, 9, 14),
    ]);
    expect(counts[9]).toBe(2);
    expect(counts[14]).toBe(1);
    expect(counts[10]).toBe(0);
  });
});

describe("daysOfHistory", () => {
  it("is zero for no entries", () => {
    expect(daysOfHistory([])).toBe(0);
  });

  it("counts distinct logical days, not entries", () => {
    const entries = [
      entry(2026, 8, 8, 9),
      entry(2026, 8, 8, 14),
      entry(2026, 8, 9, 9),
    ];
    expect(daysOfHistory(entries)).toBe(2);
  });

  it("treats a 1am entry as the previous logical day", () => {
    // Both belong to the 8th under a 4am boundary, so this is one day.
    const entries = [entry(2026, 8, 8, 22), entry(2026, 8, 9, 1)];
    expect(daysOfHistory(entries)).toBe(1);
  });
});

describe("planReminders", () => {
  it("seeds when there is no history at all", () => {
    const plan = planReminders([]);
    expect(plan.basis).toBe("seed");
    expect(plan.daysOfHistory).toBe(0);
    expect(plan.hours).toHaveLength(DEFAULT_REMINDER_COUNT);
  });

  it("still seeds with two days of history", () => {
    // Below the learning threshold the histogram is mostly noise, and a
    // "learned" schedule would be overfitting to one unusual day.
    const entries = [entry(2026, 8, 8, 9), entry(2026, 8, 9, 9)];
    const plan = planReminders(entries);
    expect(plan.basis).toBe("seed");
    expect(plan.daysOfHistory).toBe(2);
  });

  it("learns once there are three days", () => {
    const entries = [entry(2026, 8, 8, 9), entry(2026, 8, 9, 9), entry(2026, 8, 10, 9)];
    const plan = planReminders(entries);
    expect(plan.basis).toBe("learned");
    expect(plan.daysOfHistory).toBe(3);
  });

  it("seeds inside the waking window and never outside it", () => {
    const plan = planReminders([], { wakingStartHour: 8, wakingEndHour: 20 });
    for (const hour of plan.hours) {
      expect(hour).toBeGreaterThanOrEqual(8);
      expect(hour).toBeLessThanOrEqual(20);
    }
  });

  it("avoids the hours the user reliably drinks in", () => {
    // Heavy logging at 9 and 18 across four days. Those hours should not be
    // chosen, because a reminder there arrives when they were drinking anyway.
    const entries: DrinkEntry[] = [];
    for (const day of [8, 9, 10, 11]) {
      for (let i = 0; i < 5; i += 1) {
        entries.push(entry(2026, 8, day, 9));
        entries.push(entry(2026, 8, day, 18));
      }
    }

    const plan = planReminders(entries);
    expect(plan.basis).toBe("learned");
    expect(plan.hours).not.toContain(9);
    expect(plan.hours).not.toContain(18);
  });

  it("keeps reminders spaced apart", () => {
    const entries: DrinkEntry[] = [];
    for (const day of [8, 9, 10, 11]) entries.push(entry(2026, 8, day, 12));

    const hours = planReminders(entries).hours;
    for (let i = 1; i < hours.length; i += 1) {
      expect(hours[i] - hours[i - 1]).toBeGreaterThanOrEqual(MIN_REMINDER_GAP_HOURS);
    }
  });

  it("returns ascending hours", () => {
    const entries: DrinkEntry[] = [];
    for (const day of [8, 9, 10]) entries.push(entry(2026, 8, day, 15));

    const hours = planReminders(entries).hours;
    expect([...hours].sort((a, b) => a - b)).toEqual(hours);
  });

  it("returns the requested number of reminders even in a narrow window", () => {
    // The spacing rule can starve the pick list. Falling back to the seed is
    // better than silently returning fewer reminders than asked for.
    const entries: DrinkEntry[] = [];
    for (const day of [8, 9, 10]) entries.push(entry(2026, 8, day, 12));

    const plan = planReminders(entries, {
      wakingStartHour: 9,
      wakingEndHour: 13,
      reminderCount: 3,
    });
    expect(plan.hours).toHaveLength(3);
  });

  it("honours a single reminder request by choosing one hour", () => {
    const plan = planReminders([], { reminderCount: 1 });
    expect(plan.hours).toHaveLength(1);
  });

  it("rejects a window that ends before it starts", () => {
    expect(() =>
      planReminders([], { wakingStartHour: 20, wakingEndHour: 8 })
    ).toThrow(RangeError);
  });

  it("rejects an out of range window", () => {
    expect(() => planReminders([], { wakingStartHour: -1 })).toThrow(RangeError);
    expect(() => planReminders([], { wakingEndHour: 24 })).toThrow(RangeError);
  });

  it("rejects a non positive reminder count", () => {
    expect(() => planReminders([], { reminderCount: 0 })).toThrow(RangeError);
  });
});

describe("reminderOccurrences", () => {
  // Midday on the 8th, so some planned hours are behind and some ahead.
  const now = new Date(2026, 7, 8, 12, 30);
  const none = new Set<string>();

  it("is empty with no planned hours", () => {
    expect(reminderOccurrences([], now)).toEqual([]);
  });

  it("skips hours that have already passed today", () => {
    const occurrences = reminderOccurrences([9, 15], now, none, 0);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].getHours()).toBe(15);
  });

  it("skips the current hour once it has begun", () => {
    // 12:30 is past 12:00, so a 12:00 reminder would fire immediately.
    expect(reminderOccurrences([12], now, none, 0)).toEqual([]);
  });

  it("skips a logical day whose goal is already met", () => {
    const met = new Set(["2026-08-08"]);
    expect(reminderOccurrences([15, 20], now, met, 0)).toEqual([]);
  });

  it("still schedules later days when today's goal is met", () => {
    const met = new Set(["2026-08-08"]);
    const occurrences = reminderOccurrences([15], now, met, 1);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].getDate()).toBe(9);
  });

  it("does not lose the coming day when opened after midnight", () => {
    // The bug this guards: at 00:30 on the 9th the logical day is still the
    // 8th. Filtering on the calendar day would suppress every reminder for
    // logical day the 9th, which has not started and cannot have been met.
    const afterMidnight = new Date(2026, 7, 9, 0, 30);
    const met = new Set(["2026-08-08"]);

    const occurrences = reminderOccurrences([8, 11, 19], afterMidnight, met, 0);

    expect(occurrences).toHaveLength(3);
    expect(occurrences.map((d) => [d.getDate(), d.getHours()])).toEqual([
      [9, 8],
      [9, 11],
      [9, 19],
    ]);
  });

  it("skips early morning hours belonging to a met logical day", () => {
    // At 00:30 on the 9th, a 2am reminder is still logical day the 8th, which
    // is met, so it must be skipped even though 3am is later than now.
    const afterMidnight = new Date(2026, 7, 9, 0, 30);
    const met = new Set(["2026-08-08"]);

    const occurrences = reminderOccurrences([2, 8], afterMidnight, met, 0);

    expect(occurrences.map((d) => d.getHours())).toEqual([8]);
  });

  it("schedules every planned hour on later days, including passed ones", () => {
    // 9am is behind us today but not on tomorrow.
    const occurrences = reminderOccurrences([9, 15], now, none, 1);
    expect(occurrences.map((d) => [d.getDate(), d.getHours()])).toEqual([
      [8, 15],
      [9, 9],
      [9, 15],
    ]);
  });

  it("returns moments in ascending order", () => {
    const occurrences = reminderOccurrences([20, 15, 18], now, none, 2);
    const times = occurrences.map((d) => d.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("lands on the hour exactly", () => {
    for (const at of reminderOccurrences([15], now, none, 1)) {
      expect(at.getMinutes()).toBe(0);
      expect(at.getSeconds()).toBe(0);
      expect(at.getMilliseconds()).toBe(0);
    }
  });

  it("crosses a month boundary", () => {
    const endOfMonth = new Date(2026, 7, 31, 12, 0);
    const occurrences = reminderOccurrences([15], endOfMonth, none, 1);
    expect(occurrences.map((d) => [d.getMonth() + 1, d.getDate()])).toEqual([
      [8, 31],
      [9, 1],
    ]);
  });

  it("covers today plus the horizon by default", () => {
    const occurrences = reminderOccurrences([15], now);
    // 15:00 today is still ahead of 12:30, so today counts as well.
    expect(occurrences).toHaveLength(REMINDER_HORIZON_DAYS + 1);
  });

  it("rejects a negative or fractional horizon", () => {
    expect(() => reminderOccurrences([15], now, none, -1)).toThrow(RangeError);
    expect(() => reminderOccurrences([15], now, none, 1.5)).toThrow(RangeError);
  });

  it("rejects a bad day start hour", () => {
    expect(() => reminderOccurrences([15], now, none, 1, 24)).toThrow(RangeError);
  });
});
