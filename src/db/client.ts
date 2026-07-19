import * as mysqlSchema from "./schema";
import * as sqliteSchema from "./schema.sqlite";
import mysql from "mysql2";
import { drizzle as drizzleMysql } from "drizzle-orm/mysql2";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// MySQL is the authoritative production dialect and its driver (`mysql2`, pure
// JavaScript) is imported statically above. SQLite backs local development and
// fast tests only; its driver (`better-sqlite3`) is a native addon that is NOT
// required by, bundled into, or installable-gated for a MySQL production deploy.
// It is therefore loaded lazily — via a Node `require` that the bundler does not
// trace and that only executes on the SQLite code path — so a production install
// where `better-sqlite3` is absent (an optional dependency) still builds and
// boots. See `next.config.mjs` (serverExternalPackages) and `optionalDependencies`.
const nodeRequire = createRequire(import.meta.url);

// The exported bindings are intentionally loosely typed so shared route code can
// address both dialects behind the `isSQLite` runtime flag.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export let schema: any;
export let isSQLite = true;

export function initializeDatabase(dbUrl: string) {
  if (dbUrl.startsWith("mysql:") || dbUrl.startsWith("mysql2:")) {
    isSQLite = false;
    const pool = mysql.createPool(dbUrl);
    db = drizzleMysql(pool, { schema: mysqlSchema, mode: "default" });
    schema = mysqlSchema;
  } else {
    isSQLite = true;
    // Lazily resolve the SQLite native driver. This never runs on the MySQL path,
    // so production does not need `better-sqlite3` installed.
    const Database = nodeRequire("better-sqlite3");
    const { drizzle: drizzleSqlite } = nodeRequire("drizzle-orm/better-sqlite3");

    const sqliteFile = dbUrl.replace(/^(sqlite|file):/, "");
    const dir = path.dirname(sqliteFile);
    if (dir && dir !== "." && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const sqliteDb = new Database(sqliteFile);
    db = drizzleSqlite(sqliteDb, { schema: sqliteSchema });
    schema = sqliteSchema;
  }
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error("DATABASE_URL environment variable is required.");
}
initializeDatabase(dbUrl);

export { mysqlSchema, sqliteSchema };
