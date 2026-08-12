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

let database: SQLite.SQLiteDatabase | null = null;

/**
 * Open the database and bring its schema up to date.
 *
 * Safe to call more than once; the connection is reused. Uses SQLite's own
 * `user_version` as the migration marker rather than a table of our own, so
 * there is nothing extra to keep consistent.
 *
 * @returns The open, migrated database.
 */
export async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (database) return database;

  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

  const result = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version"
  );
  let version = result?.user_version ?? 0;

  // Each migration and its version bump go in one transaction, so an
  // interrupted upgrade cannot leave the schema applied but unrecorded.
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    const next = version + 1;

    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
      // PRAGMA does not accept bound parameters. `next` is derived from array
      // length, never from input, so the interpolation is not a injection path.
      await db.execAsync(`PRAGMA user_version = ${next}`);
    });

    version = next;
  }

  database = db;
  return db;
}

/**
 * Record a drink.
 *
 * @param amountMl Volume in millilitres. Must be a positive integer.
 * @param loggedAt Epoch milliseconds. Defaults to now.
 *
 * @throws RangeError If the amount is not a positive integer.
 */
export async function addDrink(
  amountMl: number,
  loggedAt: number = Date.now()
): Promise<void> {
  if (!Number.isInteger(amountMl) || amountMl <= 0) {
    throw new RangeError(`amountMl must be a positive integer, got ${amountMl}`);
  }

  const db = await openDatabase();
  await db.runAsync(
    "INSERT INTO drink_entry (logged_at, amount_ml) VALUES (?, ?)",
    loggedAt,
    amountMl
  );
}

/**
 * Remove the most recently logged drink.
 *
 * Undo matters more than usual here. Logging is a single tap by design, so
 * mis-taps are frequent, and without undo the only way to correct one would be
 * to log a negative amount, which the schema forbids.
 *
 * @returns True if an entry was removed, false if there was nothing to remove.
 */
export async function undoLastDrink(): Promise<boolean> {
  const db = await openDatabase();

  // Ordered by id, not logged_at: id reflects insertion order, which is what
  // "last logged" means. A backdated entry should not become the undo target.
  const result = await db.runAsync(
    `DELETE FROM drink_entry
      WHERE id = (SELECT id FROM drink_entry ORDER BY id DESC LIMIT 1)`
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
  if (!database) return;

  await database.closeAsync();
  database = null;
}
