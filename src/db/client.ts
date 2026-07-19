import * as mysqlSchema from "./schema";
import * as sqliteSchema from "./schema.sqlite";
import mysql from "mysql2";
import { drizzle as drizzleMysql } from "drizzle-orm/mysql2";
import Database from "better-sqlite3";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// The client transparently binds one of two dialect-specific Drizzle instances.
// MySQL is the authoritative dialect; SQLite backs fast unit tests. The exported
// bindings are intentionally loosely typed so shared route code can address both
// dialects behind the `isSQLite` runtime flag.
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
