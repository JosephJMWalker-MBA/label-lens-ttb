/**
 * Database dialect detection, shared by the runtime client and the build.
 *
 * MySQL is the authoritative production dialect; SQLite backs local development
 * and fast tests only. `next.config.mjs` performs the equivalent check at build
 * time to decide which dialect module graph to emit, so the two must agree — a
 * disagreement is what previously let a production build pull in the SQLite
 * driver. The match is deliberately tolerant of surrounding whitespace and
 * scheme casing, both of which are easy to introduce in a hosting panel's
 * environment-variable field.
 */
export type DatabaseDialect = "mysql" | "sqlite";

/** Matches `mysql://…` and `mysql2://…`, case-insensitively, ignoring padding. */
export const MYSQL_URL_PATTERN = /^mysql2?:\/\//i;

export function isMysqlUrl(dbUrl: string | undefined | null): boolean {
  return MYSQL_URL_PATTERN.test((dbUrl ?? "").trim());
}

/**
 * Resolve the dialect for a connection string. `LABEL_LENS_DB_DIALECT` is an
 * explicit operator override for deployments whose connection string cannot be
 * parsed confidently; it wins over URL sniffing.
 */
export function resolveDialect(
  dbUrl: string | undefined | null,
  override?: string | undefined | null,
): DatabaseDialect {
  const forced = (override ?? "").trim().toLowerCase();
  if (forced === "mysql" || forced === "sqlite") return forced;
  return isMysqlUrl(dbUrl) ? "mysql" : "sqlite";
}
