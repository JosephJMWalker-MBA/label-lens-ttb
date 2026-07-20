/**
 * Build-time replacement for `client.sqlite.ts` in a MySQL production graph.
 *
 * `next.config.mjs` swaps the real SQLite module for this one whenever it builds
 * a MySQL graph, so the emitted server bundles contain no import, external, or
 * executable `require("better-sqlite3")` anywhere — not during module
 * evaluation, build tracing, page-data collection, or runtime startup.
 *
 * Reaching this function means a MySQL build was handed a connection string that
 * did not resolve to the MySQL dialect. That is a configuration error, and it
 * fails loudly and legibly here instead of surfacing as a confusing
 * `Cannot find module 'better-sqlite3'` MODULE_NOT_FOUND.
 */
export function createSqliteDatabase(dbUrl: string): never {
  const scheme = /^[a-z0-9+.-]*:/i.exec(dbUrl.trim())?.[0] ?? "(no scheme)";
  throw new Error(
    "This build was produced as a MySQL-only graph, so the SQLite driver is not " +
      `available, but DATABASE_URL resolved to the SQLite dialect (scheme: ${scheme}). ` +
      "Set DATABASE_URL to a mysql:// connection string, or set " +
      "LABEL_LENS_DB_DIALECT=mysql, and rebuild. SQLite is for local development " +
      "and tests only.",
  );
}
