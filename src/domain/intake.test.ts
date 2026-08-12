import {
  dayTotals,
  goalProgress,
  metDayKeys,
  totalForDay,
  type DrinkEntry,
} from "./intake";

// Local time. The logical day boundary is 4am, so hours matter here.
const entry = (
  y: number,
  m: number,
  d: number,
  h: number,
  amountMl: number
): DrinkEntry => ({
  loggedAt: new Date(y, m - 1, d, h).getTime(),
  amountMl,
});

describe("dayTotals", () => {
  it("is empty for no entries", () => {
    expect(dayTotals([])).toEqual([]);
  });

  it("sums multiple entries on the same day", () => {
    const entries = [
      entry(2026, 8, 8, 9, 250),
      entry(2026, 8, 8, 13, 300),
      entry(2026, 8, 8, 20, 200),
    ];
    expect(dayTotals(entries)).toEqual([{ dayKey: "2026-08-08", totalMl: 750 }]);
  });

  it("attributes a late night drink to the day that is ending", () => {
    // 1am on the 9th belongs to the 8th.
    const entries = [entry(2026, 8, 8, 22, 250), entry(2026, 8, 9, 1, 250)];
    expect(dayTotals(entries)).toEqual([{ dayKey: "2026-08-08", totalMl: 500 }]);
  });

  it("sorts ascending regardless of input order", () => {
    const entries = [
      entry(2026, 8, 10, 9, 100),
      entry(2026, 8, 8, 9, 100),
      entry(2026, 8, 9, 9, 100),
    ];
    expect(dayTotals(entries).map((d) => d.dayKey)).toEqual([
      "2026-08-08",
      "2026-08-09",
      "2026-08-10",
    ]);
  });

  it("omits days with no entries rather than reporting zero", () => {
    // The 9th is absent, not present with totalMl 0. Callers decide what a gap
    // means, because a chart and a streak want different things.
    const entries = [entry(2026, 8, 8, 9, 100), entry(2026, 8, 10, 9, 100)];
    expect(dayTotals(entries).map((d) => d.dayKey)).toEqual([
      "2026-08-08",
      "2026-08-10",
    ]);
  });

  it("honours a custom day start hour", () => {
    // With midnight rollover, the 1am drink is its own day.
    const entries = [entry(2026, 8, 8, 22, 250), entry(2026, 8, 9, 1, 250)];
    expect(dayTotals(entries, 0)).toEqual([
      { dayKey: "2026-08-08", totalMl: 250 },
      { dayKey: "2026-08-09", totalMl: 250 },
    ]);
  });
});

describe("totalForDay", () => {
  it("is zero for a day with no entries", () => {
    expect(totalForDay([entry(2026, 8, 8, 9, 250)], "2026-08-09")).toBe(0);
  });

  it("totals only the requested day", () => {
    const entries = [entry(2026, 8, 8, 9, 250), entry(2026, 8, 9, 9, 400)];
    expect(totalForDay(entries, "2026-08-08")).toBe(250);
    expect(totalForDay(entries, "2026-08-09")).toBe(400);
  });
});

describe("metDayKeys", () => {
  const goal = 2000;

  it("includes a day that exactly reaches the goal", () => {
    // Exactly meeting it counts. Otherwise the last mouthful of a met goal
    // silently fails to register.
    const entries = [entry(2026, 8, 8, 9, 2000)];
    expect(metDayKeys(entries, goal).has("2026-08-08")).toBe(true);
  });

  it("excludes a day that falls one millilitre short", () => {
    const entries = [entry(2026, 8, 8, 9, 1999)];
    expect(metDayKeys(entries, goal).has("2026-08-08")).toBe(false);
  });

  it("includes a day that exceeds the goal", () => {
    const entries = [entry(2026, 8, 8, 9, 2500)];
    expect(metDayKeys(entries, goal).has("2026-08-08")).toBe(true);
  });

  it("separates met from unmet days", () => {
    const entries = [
      entry(2026, 8, 8, 9, 2000),
      entry(2026, 8, 9, 9, 500),
      entry(2026, 8, 10, 9, 2100),
    ];
    expect([...metDayKeys(entries, goal)].sort()).toEqual([
      "2026-08-08",
      "2026-08-10",
    ]);
  });

  it("rejects a non positive goal", () => {
    expect(() => metDayKeys([], 0)).toThrow(RangeError);
    expect(() => metDayKeys([], -1)).toThrow(RangeError);
  });
});

describe("goalProgress", () => {
  it("is zero with nothing logged", () => {
    expect(goalProgress(0, 2000)).toBe(0);
  });

  it("is a fraction part way through", () => {
    expect(goalProgress(500, 2000)).toBe(0.25);
  });

  it("is one exactly at the goal", () => {
    expect(goalProgress(2000, 2000)).toBe(1);
  });

  it("clamps above the goal so a ring cannot overflow", () => {
    expect(goalProgress(5000, 2000)).toBe(1);
  });

  it("clamps a negative total to zero", () => {
    expect(goalProgress(-100, 2000)).toBe(0);
  });

  it("rejects a non positive goal", () => {
    expect(() => goalProgress(100, 0)).toThrow(RangeError);
  });
});
