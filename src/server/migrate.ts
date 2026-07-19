import path from "node:path";

/**
 * Apply the committed Drizzle migrations programmatically, without the
 * drizzle-kit CLI. Used by the startup wrapper so a MySQL production deploy can
 * bring its schema up to date at boot.
 *
 * The committed migrations target MySQL (the authoritative production database).
 * A non-MySQL DATABASE_URL (local SQLite dev/test) has no committed migrations
 * and is a no-op here; its schema is provisioned separately.
 */
export async function applyMigrations(dbUrl: string): Promise<void> {
  if (!dbUrl) {
    throw new Error("DATABASE_URL is required to apply migrations.");
  }
  const isMysql = /^mysql2?:\/\//.test(dbUrl);
  if (!isMysql) return;

  const mysql = (await import("mysql2/promise")).default;
  const { drizzle } = await import("drizzle-orm/mysql2");
  const { migrate } = await import("drizzle-orm/mysql2/migrator");

  const connection = await mysql.createConnection(dbUrl);
  try {
    const db = drizzle(connection);
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "src/db/migrations") });
  } finally {
    await connection.end();
  }
}
