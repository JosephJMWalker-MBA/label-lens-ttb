/**
 * SQLite dialect module — local development and fast tests ONLY.
 *
 * `better-sqlite3` is a native addon that a MySQL production host (Hostinger)
 * cannot compile, so it is an optionalDependency. This module is the single
 * place that touches it, and it is REPLACED WHOLESALE at build time by
 * `client.sqlite.stub.ts` whenever a MySQL graph is being built (see
 * `next.config.mjs`). That replacement is what guarantees a MySQL production
 * bundle emits no `require("better-sqlite3")` at all — previously the driver
 * was merely loaded lazily, which still emitted an external require into the
 * route bundles and failed page-data collection when the module was absent.
 *
 * The build-time replacement is the guarantee for the bundled production graph.
 * The driver is ALSO resolved lazily here, inside the factory, so that
 * non-bundled contexts that do not get that replacement — vitest and the
 * `vite-node` CLIs — can import this module while running against MySQL without
 * the native addon being installed at all.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import * as sqliteSchema from "./schema.sqlite";

const nodeRequire = createRequire(import.meta.url);

// Loosely typed on purpose: see the note in `client.mysql.ts`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createSqliteDatabase(dbUrl: string): { db: any; schema: any } {
  const Database = nodeRequire("better-sqlite3");
  const { drizzle: drizzleSqlite } = nodeRequire("drizzle-orm/better-sqlite3");

  const sqliteFile = dbUrl.replace(/^(sqlite|file):/, "");
  const dir = path.dirname(sqliteFile);
  if (dir && dir !== "." && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sqliteDb = new Database(sqliteFile);
  return { db: drizzleSqlite(sqliteDb, { schema: sqliteSchema }), schema: sqliteSchema };
}

export { sqliteSchema };
