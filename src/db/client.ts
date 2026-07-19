import * as mysqlSchema from "./schema";
import * as sqliteSchema from "./schema.sqlite";

let db: any;
let schema: any;
let isSQLite = true;

const dbUrl = process.env.DATABASE_URL || "";

if (dbUrl.startsWith("mysql:") || dbUrl.startsWith("mysql2:")) {
  isSQLite = false;
  const mysql = require("mysql2");
  const { drizzle } = require("drizzle-orm/mysql2");
  const pool = mysql.createPool(dbUrl);
  db = drizzle(pool, { schema: mysqlSchema });
  schema = mysqlSchema;
} else {
  isSQLite = true;
  const Database = require("better-sqlite3");
  const { drizzle } = require("drizzle-orm/better-sqlite3");
  
  const sqliteFile = dbUrl ? dbUrl.replace(/^(sqlite|file):/, "") : ".local/test.db";
  
  // Ensure local directories exist
  const fs = require("fs");
  const path = require("path");
  const dir = path.dirname(sqliteFile);
  if (dir && dir !== "." && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sqliteDb = new Database(sqliteFile);
  db = drizzle(sqliteDb, { schema: sqliteSchema });
  schema = sqliteSchema;
}

export { db, schema, isSQLite };
export { mysqlSchema, sqliteSchema };
