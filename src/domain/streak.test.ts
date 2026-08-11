import { currentStreak, isStreakAtRisk } from "./streak";

describe("currentStreak", () => {
  it("is zero with no history", () => {
    expect(currentStreak([], "2026-08-08")).toBe(0);
  });

  it("counts a single day met today", () => {
    expect(currentStreak(["2026-08-08"], "2026-08-08")).toBe(1);
  });

  it("counts a consecutive run ending today", () => {
    const met = ["2026-08-06", "2026-08-07", "2026-08-08"];
    expect(currentStreak(met, "2026-08-08")).toBe(3);
  });

  it("holds steady when today is still in progress", () => {
    // Today not met yet. The run through yesterday is what the user has earned,
    // and it should not read as zero just because the day is young.
    const met = ["2026-08-06", "2026-08-07"];
    expect(currentStreak(met, "2026-08-08")).toBe(2);
  });

  it("breaks on a day that fully passed unmet", () => {
    // The 7th was missed, so only the 8th counts.
    const met = ["2026-08-05", "2026-08-06", "2026-08-08"];
    expect(currentStreak(met, "2026-08-08")).toBe(1);
  });

  it("is zero when neither today nor yesterday was met", () => {
    const met = ["2026-08-01", "2026-08-02"];
    expect(currentStreak(met, "2026-08-08")).toBe(0);
  });

  it("counts across a month boundary", () => {
    const met = ["2026-08-30", "2026-08-31", "2026-09-01"];
    expect(currentStreak(met, "2026-09-01")).toBe(3);
  });

  it("counts across a year boundary", () => {
    const met = ["2026-12-30", "2026-12-31", "2027-01-01"];
    expect(currentStreak(met, "2027-01-01")).toBe(3);
  });

  it("counts across a leap day", () => {
    const met = ["2028-02-28", "2028-02-29", "2028-03-01"];
    expect(currentStreak(met, "2028-03-01")).toBe(3);
  });

  it("ignores days after today", () => {
    // Defensive: a clock change or bad data should not inflate the streak.
    const met = ["2026-08-08", "2026-08-09", "2026-08-10"];
    expect(currentStreak(met, "2026-08-08")).toBe(1);
  });

  it("accepts a Set as well as an array", () => {
    const met = new Set(["2026-08-07", "2026-08-08"]);
    expect(currentStreak(met, "2026-08-08")).toBe(2);
  });
});

describe("isStreakAtRisk", () => {
  it("is false when today is already met", () => {
    expect(isStreakAtRisk(["2026-08-07", "2026-08-08"], "2026-08-08")).toBe(false);
  });

  it("is true when a streak exists and today is not met yet", () => {
    expect(isStreakAtRisk(["2026-08-06", "2026-08-07"], "2026-08-08")).toBe(true);
  });

  it("is false when there is no streak to lose", () => {
    // A new user with no history should not be nagged about protecting nothing.
    expect(isStreakAtRisk([], "2026-08-08")).toBe(false);
  });

  it("is false when the streak is already broken", () => {
    expect(isStreakAtRisk(["2026-08-01"], "2026-08-08")).toBe(false);
  });
});
