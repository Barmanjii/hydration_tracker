/**
 * The one hook the home screen needs.
 *
 * Owns loading from the database and recomputing the derived numbers. All the
 * arithmetic is delegated to `src/domain`, so this file is only wiring: read
 * rows, hand them to pure functions, expose the result.
 */

import { useCallback, useEffect, useState } from "react";

import {
  addDrink,
  entriesSince,
  undoLastDrink as undoLastDrinkInRange,
} from "../data/db";
import {
  DEFAULT_DAY_START_HOUR,
  dayKeyFor,
  startOfLogicalDayMs,
} from "../domain/day";
import { DEFAULT_DAILY_GOAL_ML } from "../domain/goal";
import {
  type DrinkEntry,
  goalProgress,
  metDayKeys,
  totalForDay,
} from "../domain/intake";
import { currentStreak } from "../domain/streak";

/** Everything the home screen renders, plus the two actions it offers. */
export interface IntakeState {
  /** True until the first load finishes. */
  loading: boolean;
  /** Set when the database could not be read or written. */
  error: string | null;
  /** Millilitres logged on the current logical day. */
  todayMl: number;
  /** Daily target in millilitres. */
  goalMl: number;
  /** Progress towards the goal, 0 to 1. */
  progress: number;
  /** Consecutive days the goal was met. */
  streak: number;
  /** Whether undo would currently remove anything. */
  canUndo: boolean;
  /** Log a drink. */
  log: (amountMl: number) => Promise<void>;
  /** Remove the last drink logged today. */
  undo: () => Promise<void>;
}

const describe = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

export function useIntake(goalMl: number = DEFAULT_DAILY_GOAL_ML): IntakeState {
  const [entries, setEntries] = useState<DrinkEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bumping this re-runs the load effect. Writes ask for a reload by changing
  // the token rather than fetching themselves, so there is exactly one place
  // that reads from the database and exactly one cancellation path.
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const loaded = await entriesSince();
        if (!cancelled) {
          setEntries(loaded);
          setError(null);
        }
      } catch (cause) {
        if (!cancelled) setError(describe(cause));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // Prevents a late response from a screen that has gone away landing on the
    // next one, which is how a stale total appears after a remount.
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const log = useCallback(
    async (amountMl: number) => {
      try {
        await addDrink(amountMl);
        reload();
      } catch (cause) {
        setError(describe(cause));
      }
    },
    [reload]
  );

  const undo = useCallback(async () => {
    try {
      // Bounded to today, so undo can never reach back and rewrite a day the
      // user already completed.
      const todayKey = dayKeyFor(new Date(), DEFAULT_DAY_START_HOUR);
      await undoLastDrinkInRange(
        startOfLogicalDayMs(todayKey, DEFAULT_DAY_START_HOUR)
      );
      reload();
    } catch (cause) {
      setError(describe(cause));
    }
  }, [reload]);

  // Derived on every render rather than memoised. The entry count is a handful
  // per day, so this is cheaper than the bookkeeping to avoid it, and it cannot
  // go stale.
  const todayKey = dayKeyFor(new Date(), DEFAULT_DAY_START_HOUR);
  const todayMl = totalForDay(entries, todayKey, DEFAULT_DAY_START_HOUR);
  const streak = currentStreak(
    metDayKeys(entries, goalMl, DEFAULT_DAY_START_HOUR),
    todayKey
  );

  return {
    loading,
    error,
    todayMl,
    goalMl,
    progress: goalProgress(todayMl, goalMl),
    streak,
    canUndo: todayMl > 0,
    log,
    undo,
  };
}
