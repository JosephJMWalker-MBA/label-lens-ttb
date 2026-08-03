import { createHash } from "node:crypto";

function quoteIdentifier(name: string): string {
  return `\`${name.replaceAll("`", "``")}\``;
}

export function mysqlTestDatabaseName(baseUrl: string, label: string): string {
  const url = new URL(baseUrl);
  const sourceName = url.pathname.replace(/^\/+/, "");
  if (!sourceName) throw new Error("MySQL test DATABASE_URL must include a database name.");
  const digest = createHash("sha256").update(`${sourceName}:${label}`).digest("hex").slice(0, 12);
  return `test_${label.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 32)}_${digest}`;
}

export function mysqlDatabaseUrl(baseUrl: string, databaseName: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

export async function createIsolatedMysqlDatabase(
  baseUrl: string,
  label: string,
): Promise<{ databaseName: string; databaseUrl: string; drop: () => Promise<void> }> {
  if (!/^mysql2?:\/\//i.test(baseUrl)) {
    throw new Error("createIsolatedMysqlDatabase requires a mysql:// DATABASE_URL.");
  }
  const mysql = (await import("mysql2/promise")).default;
  const databaseName = mysqlTestDatabaseName(baseUrl, label);
  const adminUrl = new URL(baseUrl);
  adminUrl.pathname = "/";
  const connection = await mysql.createConnection(adminUrl.toString());
  try {
    await connection.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
    await connection.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  } finally {
    await connection.end();
  }
  return {
    databaseName,
    databaseUrl: mysqlDatabaseUrl(baseUrl, databaseName),
    drop: async () => {
      const cleanup = await mysql.createConnection(adminUrl.toString());
      try {
        await cleanup.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
      } finally {
        await cleanup.end();
      }
    },
  };
}
