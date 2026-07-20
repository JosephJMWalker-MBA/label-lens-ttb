/**
 * MySQL dialect module — the authoritative production graph.
 *
 * This module imports ONLY the pure-JavaScript `mysql2` driver and the MySQL
 * schema. It must never import, reference, or transitively reach
 * `better-sqlite3` (a native addon that a MySQL production host such as
 * Hostinger cannot compile and does not install).
 */
import mysql from "mysql2";
import { drizzle as drizzleMysql } from "drizzle-orm/mysql2";

import * as mysqlSchema from "./schema";

// Loosely typed on purpose: shared route code addresses both dialects behind the
// `isSQLite` runtime flag, and a typed union breaks that shared code.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createMysqlDatabase(dbUrl: string): { db: any; schema: any } {
  const pool = mysql.createPool(dbUrl);
  return { db: drizzleMysql(pool, { schema: mysqlSchema, mode: "default" }), schema: mysqlSchema };
}

export { mysqlSchema };
