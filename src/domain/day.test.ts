import { DEFAULT_DAY_START_HOUR, dayKeyFor, previousDayKey } from "./day";

// Local time throughout. These dates are constructed with the local constructor
// rather than parsed from ISO strings, because an ISO string with a Z would be
// UTC and the whole point here is local day boundaries.
const at = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(y, m - 1, d, h, min);

describe("dayKeyFor", () => {
  it("returns the calendar date for a moment in the middle of the day", () => {
    expect(dayKeyFor(at(2026, 8, 8, 14, 30))).toBe("2026-08-08");
  });

  it("counts a late night moment towards the day that is ending", () => {
    // 1am on the 9th is still the night of the 8th.
    expect(dayKeyFor(at(2026, 8, 9, 1, 0))).toBe("2026-08-08");
  });

  it("starts the new day exactly at the boundary hour", () => {
    expect(dayKeyFor(at(2026, 8, 9, 3, 59))).toBe("2026-08-08");
    expect(dayKeyFor(at(2026, 8, 9, 4, 0))).toBe("2026-08-09");
  });

  it("rolls back across a month boundary", () => {
    expect(dayKeyFor(at(2026, 9, 1, 2, 0))).toBe("2026-08-31");
  });

  it("rolls back across a year boundary", () => {
    expect(dayKeyFor(at(2027, 1, 1, 2, 0))).toBe("2026-12-31");
  });

  it("honours a custom boundary hour", () => {
    // With midnight rollover, 1am is its own new day.
    expect(dayKeyFor(at(2026, 8, 9, 1, 0), 0)).toBe("2026-08-09");
  });

  it("defaults to 4am", () => {
    const moment = at(2026, 8, 9, 3, 0);
    expect(dayKeyFor(moment)).toBe(dayKeyFor(moment, DEFAULT_DAY_START_HOUR));
  });

  it("rejects an out of range boundary hour", () => {
    expect(() => dayKeyFor(at(2026, 8, 8, 12), 24)).toThrow(RangeError);
    expect(() => dayKeyFor(at(2026, 8, 8, 12), -1)).toThrow(RangeError);
    expect(() => dayKeyFor(at(2026, 8, 8, 12), 1.5)).toThrow(RangeError);
  });
});

describe("previousDayKey", () => {
  it("steps back one day", () => {
    expect(previousDayKey("2026-08-08")).toBe("2026-08-07");
  });

  it("steps back across a month boundary", () => {
    expect(previousDayKey("2026-09-01")).toBe("2026-08-31");
  });

  it("steps back across a year boundary", () => {
    expect(previousDayKey("2027-01-01")).toBe("2026-12-31");
  });

  it("handles a leap day", () => {
    expect(previousDayKey("2028-03-01")).toBe("2028-02-29");
  });
});
