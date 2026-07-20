import fs from "node:fs";
import path from "node:path";

/**
 * Apply the committed Drizzle migrations programmatically, without the
 * drizzle-kit CLI. Used by the startup hook so a MySQL production deploy brings
 * its schema up to date at boot.
 *
 * The committed migrations target MySQL (the authoritative production database).
 * A non-MySQL DATABASE_URL (local SQLite dev/test) has no committed migrations
 * and is a no-op here; its schema is provisioned separately.
 */

/** Relative location of the committed migrations inside any deployment root. */
const MIGRATIONS_RELATIVE = path.join("src", "db", "migrations");
/** Drizzle refuses to run without this file; it is the marker of a real folder. */
const JOURNAL_RELATIVE = path.join("meta", "_journal.json");

/**
 * Candidate deployment roots, in priority order.
 *
 * Two shapes must both work, and neither may be assumed:
 *   - a source/dev checkout, run from the repository root;
 *   - a relocated `.next/standalone` artifact, which Next's `server.js` enters
 *     via `process.chdir(__dirname)` and which may be copied anywhere.
 *
 * `LABEL_LENS_MIGRATIONS_DIR` is an explicit operator override for a deployment
 * whose layout matches neither.
 */
function candidateMigrationDirs(cwd: string): string[] {
  const candidates = [
    // The standalone artifact and a source checkout both resolve here, because
    // the standalone server chdir()s into its own root before this runs.
    path.join(cwd, MIGRATIONS_RELATIVE),
    // Running a standalone build in place from the repository root.
    path.join(cwd, ".next", "standalone", MIGRATIONS_RELATIVE),
  ];
  // Walk a few levels up: covers being launched from a nested working directory.
  let dir = cwd;
  for (let i = 0; i < 3; i += 1) {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
    candidates.push(path.join(dir, MIGRATIONS_RELATIVE));
  }
  return candidates;
}

function hasJournal(dir: string): boolean {
  try {
    return fs.statSync(path.join(dir, JOURNAL_RELATIVE)).isFile();
  } catch {
    return false;
  }
}

/**
 * Locate the committed migrations directory, or throw a clear, secret-free
 * diagnostic naming every path that was tried. Migrations are NEVER skipped
 * because the folder is missing — a missing folder is a packaging fault, and
 * silently starting a server against an unmigrated database is worse than
 * failing to start.
 */
export function resolveMigrationsDir(cwd: string = process.cwd()): string {
  const override = process.env.LABEL_LENS_MIGRATIONS_DIR?.trim();
  if (override) {
    if (hasJournal(override)) return override;
    throw new Error(
      `LABEL_LENS_MIGRATIONS_DIR is set to "${override}" but it has no ${JOURNAL_RELATIVE}. ` +
        "Point it at the committed src/db/migrations directory.",
    );
  }

  const attempted = candidateMigrationDirs(cwd);
  for (const candidate of attempted) {
    if (hasJournal(candidate)) return candidate;
  }

  throw new Error(
    `Could not locate the committed database migrations (no ${JOURNAL_RELATIVE} found). ` +
      "The deployment artifact is incomplete: src/db/migrations must be packaged with " +
      "the server. Tried: " +
      attempted.join(", ") +
      ". Set LABEL_LENS_MIGRATIONS_DIR to override.",
  );
}

export async function applyMigrations(dbUrl: string): Promise<void> {
  if (!dbUrl) {
    throw new Error("DATABASE_URL is required to apply migrations.");
  }
  const isMysql = /^\s*mysql2?:\/\//i.test(dbUrl);
  if (!isMysql) return;

  // Resolve BEFORE opening a connection so a packaging fault fails fast and
  // legibly rather than as an opaque driver error.
  const migrationsFolder = resolveMigrationsDir();

  const mysql = (await import("mysql2/promise")).default;
  const { drizzle } = await import("drizzle-orm/mysql2");
  const { migrate } = await import("drizzle-orm/mysql2/migrator");

  const connection = await mysql.createConnection(dbUrl);
  try {
    const db = drizzle(connection);
    await migrate(db, { migrationsFolder });
  } finally {
    await connection.end();
  }
}
