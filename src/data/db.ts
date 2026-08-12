/**
 * Local SQLite persistence for drink entries.
 *
 * This layer is deliberately thin. It stores and retrieves rows and does no
 * counting, because every calculation lives in `src/domain` where it can be
 * tested without a device. If a function here starts to do arithmetic, that
 * arithmetic belongs in the domain layer instead.
 *
 * There is no remote. The database is the source of truth and the app works with
 * no network, which is a design goal rather than a limitation.
 */

import * as SQLite from "expo-sqlite";

import type { DrinkEntry } from "../domain/intake";

const DATABASE_NAME = "hydration.db";

/**
 * Ordered schema migrations.
 *
 * Append only. Never edit or reorder an entry that has shipped, because a
 * device that already ran it will not run it again and its schema would silently
 * diverge from a fresh install. The array index plus one is the version.
 */
const MIGRATIONS: readonly string[] = [
  // 1: initial schema
  `CREATE TABLE IF NOT EXISTS drink_entry (
     id        INTEGER PRIMARY KEY AUTOINCREMENT,
     logged_at INTEGER NOT NULL,
     amount_ml INTEGER NOT NULL CHECK (amount_ml > 0)
   );
   CREATE INDEX IF NOT EXISTS idx_drink_entry_logged_at
     ON drink_entry (logged_at);`,
];

/**
 * The in-flight or completed open.
 *
 * The promise is cached, not the resolved connection. Caching the connection
 * would only dedupe callers arriving after migrations finished, so two calls in
 * the same tick, which is exactly what a screen loading its data does, would
 * each open a separate connection and each run the migration loop. One of those
 * connections would then be unreachable and impossible to close.
 */
let opening: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Open the database and bring its schema up to date.
 *
 * Safe to call concurrently and repeatedly; every caller awaits the same open.
 * Uses SQLite's own `user_version` as the migration marker rather than a table
 * of our own, so there is nothing extra to keep consistent.
 *
 * @returns The open, migrated database.
 *
 * @throws Error If the stored schema version is newer than this build knows.
 */
export function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  opening ??= (async () => {
    const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

    const result = await db.getFirstAsync<{ user_version: number }>(
      "PRAGMA user_version"
    );
    let version = result?.user_version ?? 0;

    // A database from a newer build. Carrying on would mean running today's
    // queries against a schema this code has never seen, which surfaces later
    // as an opaque constraint failure mid tap. Fail here instead, where the
    // message can say what actually happened.
    if (version > MIGRATIONS.length) {
      throw new Error(
        `Database schema version ${version} is newer than this build supports ` +
          `(${MIGRATIONS.length}). Reinstall the current version of the app.`
      );
    }

    // Each migration and its version bump go in one transaction, so an
    // interrupted upgrade cannot leave the schema applied but unrecorded.
    while (version < MIGRATIONS.length) {
      const sql = MIGRATIONS[version];
      const next = version + 1;

      await db.withTransactionAsync(async () => {
        await db.execAsync(sql);
        // PRAGMA does not accept bound parameters. `next` comes from the array
        // length, never from input, so this is not an injection path.
        await db.execAsync(`PRAGMA user_version = ${next}`);
      });

      version = next;
    }

    return db;
  })();

  // A failed open must not be cached, or the app would keep replaying the same
  // rejection for the rest of the process even if the cause was transient.
  return opening.catch((error) => {
    opening = null;
    throw error;
  });
}

/**
 * Record a drink.
 *
 * @param amountMl Volume in millilitres. Must be a positive integer.
 * @param loggedAt Epoch milliseconds. Defaults to now.
 *
 * @throws RangeError If the amount or the timestamp is not a positive integer.
 */
export async function addDrink(
  amountMl: number,
  loggedAt: number = Date.now()
): Promise<void> {
  if (!Number.isInteger(amountMl) || amountMl <= 0) {
    throw new RangeError(`amountMl must be a positive integer, got ${amountMl}`);
  }
  // Validated for the same reason as the amount. A NaN timestamp binds as NULL
  // and trips the NOT NULL constraint, surfacing as an opaque SQL error on a
  // tap; a merely wrong finite one stores fine and then reads back as a drink
  // on some unrelated day.
  if (!Number.isInteger(loggedAt) || loggedAt <= 0) {
    throw new RangeError(`loggedAt must be a positive integer, got ${loggedAt}`);
  }

  const db = await openDatabase();
  await db.runAsync(
    "INSERT INTO drink_entry (logged_at, amount_ml) VALUES (?, ?)",
    loggedAt,
    amountMl
  );
}

/**
 * Remove the most recently logged drink, but only within a time bound.
 *
 * Undo matters more than usual here. Logging is a single tap by design, so
 * mis-taps are frequent, and the `amount_ml > 0` constraint rules out
 * correcting one with a negative entry.
 *
 * `notBeforeMs` is required rather than optional on purpose. An unbounded undo
 * reaches backwards indefinitely, so tapping it on a morning with nothing
 * logged yet would silently delete the last drink of a previous day, lowering
 * that day's total and breaking a streak the user had already earned. Pass the
 * start of the current logical day, from `startOfLogicalDayMs`.
 *
 * @param notBeforeMs Epoch milliseconds. Entries older than this are untouched.
 * @returns True if an entry was removed, false if there was nothing in range.
 */
export async function undoLastDrink(notBeforeMs: number): Promise<boolean> {
  if (!Number.isFinite(notBeforeMs)) {
    throw new RangeError(`notBeforeMs must be finite, got ${notBeforeMs}`);
  }

  const db = await openDatabase();

  // Ordered by id, not logged_at: id reflects insertion order, which is what
  // "last logged" means. A backdated entry should not become the undo target.
  const result = await db.runAsync(
    `DELETE FROM drink_entry
      WHERE id = (
        SELECT id FROM drink_entry
         WHERE logged_at >= ?
         ORDER BY id DESC
         LIMIT 1
      )`,
    notBeforeMs
  );

  return result.changes > 0;
}

/**
 * Entries logged at or after a moment, oldest first.
 *
 * @param sinceMs Epoch milliseconds lower bound, inclusive. Defaults to all.
 * @returns Entries for the domain layer to aggregate.
 */
export async function entriesSince(sinceMs = 0): Promise<DrinkEntry[]> {
  const db = await openDatabase();

  const rows = await db.getAllAsync<{ logged_at: number; amount_ml: number }>(
    "SELECT logged_at, amount_ml FROM drink_entry WHERE logged_at >= ? ORDER BY logged_at ASC",
    sinceMs
  );

  return rows.map((row) => ({
    loggedAt: row.logged_at,
    amountMl: row.amount_ml,
  }));
}

/**
 * Delete every entry.
 *
 * Exists so the user can wipe their own data, which is not optional for
 * something recording a personal habit.
 */
export async function deleteAllEntries(): Promise<void> {
  const db = await openDatabase();
  await db.runAsync("DELETE FROM drink_entry");
}

/**
 * Drop the cached connection.
 *
 * For tests and for teardown. Does not delete data.
 */
export async function closeDatabase(): Promise<void> {
  if (!opening) return;

  const pending = opening;
  // Cleared first, so a failed close cannot leave a dead handle cached.
  opening = null;

  const db = await pending;
  await db.closeAsync();
}
