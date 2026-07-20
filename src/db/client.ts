/**
 * Database entrypoint. MySQL is authoritative in production; SQLite backs local
 * development and fast tests.
 *
 * The two dialects live in fully separate modules. This file statically imports
 * both factories, and the build decides which SQLite module that second import
 * actually resolves to: in a MySQL graph `next.config.mjs` replaces
 * `./client.sqlite` with `./client.sqlite.stub`, so the native `better-sqlite3`
 * addon never enters the production module graph in any form. Outside a MySQL
 * build (vitest, `next dev`, the SQLite e2e build) the real module resolves
 * normally.
 *
 * `better-sqlite3` therefore stays an optionalDependency that a MySQL host never
 * needs to install, compile, resolve, or require.
 */
import { createMysqlDatabase, mysqlSchema } from "./client.mysql";
import { createSqliteDatabase } from "./client.sqlite";
import { resolveDialect } from "./dialect";
import * as sqliteSchema from "./schema.sqlite";

// The exported bindings are intentionally loosely typed so shared route code can
// address both dialects behind the `isSQLite` runtime flag.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export let schema: any;
export let isSQLite = true;

export function initializeDatabase(dbUrl: string) {
  const dialect = resolveDialect(dbUrl, process.env.LABEL_LENS_DB_DIALECT);
  if (dialect === "mysql") {
    isSQLite = false;
    ({ db, schema } = createMysqlDatabase(dbUrl));
  } else {
    isSQLite = true;
    ({ db, schema } = createSqliteDatabase(dbUrl));
  }
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error("DATABASE_URL environment variable is required.");
}
initializeDatabase(dbUrl);

export { mysqlSchema, sqliteSchema };
