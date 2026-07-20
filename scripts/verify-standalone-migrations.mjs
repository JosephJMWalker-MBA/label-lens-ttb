/**
 * Production-artifact regression test for startup migrations.
 *
 * Staging failed at boot with:
 *
 *   [startup] Applying database migrations…
 *   [startup] Migration failed; server will not start: Can't find meta/_journal.json file
 *
 * because `src/db/migrations/**` was never packaged into the Next standalone
 * output — static tracing cannot see it (the migrations are data read at
 * runtime, not imports). Source-tree builds passed because the checkout happened
 * to have the folder next to `process.cwd()`.
 *
 * This validates the ACTUAL EMITTED ARTIFACT rather than a source-tree build:
 *
 *   1. every committed migration file is present in `.next/standalone`;
 *   2. the artifact is relocated outside the repository;
 *   3. the relocated server is launched from a DIFFERENT working directory;
 *   4. migrations apply to a FRESH database;
 *   5. a second startup is idempotent (no re-application, no failure).
 *
 * Requires a reachable MySQL and a `mysql://` DATABASE_URL. The target database
 * is dropped and recreated, so point it at a disposable test database.
 *
 *   DATABASE_URL='mysql://root@127.0.0.1:3306/test_db' \
 *     npm run verify:standalone-migrations
 */
import { spawn } from "node:child_process";
import { cpSync, readdirSync, rmSync, statSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const REPO = process.cwd();
const STANDALONE = path.join(REPO, ".next", "standalone");
const MIGRATIONS_REL = path.join("src", "db", "migrations");
const PORT = Number(process.env.VERIFY_PORT ?? 3399);

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

function listFiles(root) {
  const out = [];
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = path.join(dir, entry);
      const rel = prefix ? `${prefix}/${entry}` : entry;
      if (statSync(full).isDirectory()) walk(full, rel);
      else out.push(rel);
    }
  };
  walk(root, "");
  return out;
}

/** Drop and recreate the target database so migrations run against a fresh one. */
async function resetDatabase(dbUrl) {
  const mysql = (await import("mysql2/promise")).default;
  const parsed = new URL(dbUrl);
  const name = parsed.pathname.replace(/^\//, "");
  if (!name) fail("DATABASE_URL has no database name.");
  const adminUrl = new URL(dbUrl);
  adminUrl.pathname = "/";
  const conn = await mysql.createConnection(adminUrl.toString());
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await conn.query(`CREATE DATABASE \`${name}\``);
  } finally {
    await conn.end();
  }
  return name;
}

async function queryDatabase(dbUrl, sql) {
  const mysql = (await import("mysql2/promise")).default;
  const conn = await mysql.createConnection(dbUrl);
  try {
    const [rows] = await conn.query(sql);
    return rows;
  } finally {
    await conn.end();
  }
}

/**
 * Launch the relocated standalone server from a working directory that is
 * neither the repository nor the artifact root.
 */
async function startServer(serverJs, launchCwd, env, label) {
  const child = spawn(process.execPath, [serverJs], {
    cwd: launchCwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d.toString()));
  child.stderr.on("data", (d) => (log += d.toString()));

  const deadline = Date.now() + 90_000;
  let healthy = false;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (res.ok) {
        healthy = true;
        break;
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!healthy) {
    child.kill("SIGKILL");
    console.error(`--- ${label} server log ---\n${log}`);
    fail(`${label}: server never became healthy on /api/health`);
  }
  return { child, log: () => log };
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((r) => {
    child.on("exit", r);
    setTimeout(() => {
      child.kill("SIGKILL");
      r();
    }, 8000);
  });
}

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (!/^\s*mysql2?:\/\//i.test(dbUrl)) {
    fail("DATABASE_URL must be a mysql:// connection string for this check.");
  }

  // 1. The emitted artifact must carry every committed migration file.
  try {
    statSync(STANDALONE);
  } catch {
    fail("no .next/standalone — run a MySQL `next build` first.");
  }

  const sourceFiles = listFiles(path.join(REPO, MIGRATIONS_REL));
  let artifactFiles;
  try {
    artifactFiles = listFiles(path.join(STANDALONE, MIGRATIONS_REL));
  } catch {
    fail(`migrations are NOT packaged into the standalone artifact (${MIGRATIONS_REL} missing).`);
  }

  const missing = sourceFiles.filter((f) => !artifactFiles.includes(f));
  if (missing.length > 0) {
    fail(`migration files missing from the standalone artifact: ${missing.join(", ")}`);
  }
  if (!artifactFiles.includes("meta/_journal.json")) {
    fail("meta/_journal.json is missing from the standalone artifact.");
  }
  console.log(
    `OK artifact carries all ${sourceFiles.length} committed migration file(s): ${sourceFiles.join(", ")}`,
  );

  // 2. Relocate the artifact outside the repository.
  const relocated = await mkdtemp(path.join(os.tmpdir(), "label-lens-standalone-"));
  cpSync(STANDALONE, relocated, { recursive: true });
  console.log(`OK artifact relocated to ${relocated}`);

  // 3. Launch from a DIFFERENT working directory than the repo or the artifact.
  const launchCwd = await mkdtemp(path.join(os.tmpdir(), "label-lens-launch-"));
  const serverJs = path.join(relocated, "server.js");
  const env = {
    DATABASE_URL: dbUrl,
    PORT: String(PORT),
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
    BETTER_AUTH_SECRET:
      process.env.BETTER_AUTH_SECRET ?? "standalone-verify-secret-at-least-32-chars",
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? `http://127.0.0.1:${PORT}`,
    LABEL_LENS_APPEND_SIGNING_KEY:
      process.env.LABEL_LENS_APPEND_SIGNING_KEY ?? "standalone-verify-append-at-least-32-chars",
    LABEL_LENS_INTEGRITY_SECRET:
      process.env.LABEL_LENS_INTEGRITY_SECRET ?? "standalone-verify-integrity-at-least-32-chars",
    // Must NOT be needed — resolution has to work from the artifact itself.
    LABEL_LENS_MIGRATIONS_DIR: "",
  };

  let exitCode = 0;
  try {
    // 4. Fresh database, first startup applies migrations.
    await resetDatabase(dbUrl);
    console.log("OK target database dropped and recreated (fresh)");

    const first = await startServer(serverJs, launchCwd, env, "first startup");
    const firstLog = first.log();
    if (!/\[startup\] Migrations applied\./.test(firstLog)) {
      console.error(`--- first startup log ---\n${firstLog}`);
      fail("first startup did not report migrations applied.");
    }
    if (/Migration failed/i.test(firstLog) || /_journal\.json/i.test(firstLog)) {
      console.error(`--- first startup log ---\n${firstLog}`);
      fail("first startup reported a migration failure.");
    }
    console.log("OK first startup applied migrations and served /api/health from a relocated root");

    const tables = await queryDatabase(
      dbUrl,
      "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()",
    );
    const names = tables.map((r) => r.t ?? r.TABLE_NAME);
    for (const required of ["submissions", "users", "__drizzle_migrations"]) {
      if (!names.includes(required)) {
        fail(`expected table "${required}" after migration; saw: ${names.join(", ")}`);
      }
    }
    const [{ n: appliedFirst }] = await queryDatabase(
      dbUrl,
      "SELECT COUNT(*) AS n FROM `__drizzle_migrations`",
    );
    console.log(`OK schema created (${names.length} tables, ${appliedFirst} migration row(s))`);

    await stopServer(first.child);

    // 5. Second startup must be idempotent.
    const second = await startServer(serverJs, launchCwd, env, "second startup");
    const secondLog = second.log();
    if (/Migration failed/i.test(secondLog)) {
      console.error(`--- second startup log ---\n${secondLog}`);
      fail("second startup reported a migration failure.");
    }
    const [{ n: appliedSecond }] = await queryDatabase(
      dbUrl,
      "SELECT COUNT(*) AS n FROM `__drizzle_migrations`",
    );
    if (String(appliedFirst) !== String(appliedSecond)) {
      fail(
        `second startup was not idempotent: migration rows went ${appliedFirst} -> ${appliedSecond}`,
      );
    }
    await stopServer(second.child);
    console.log(
      `OK second startup is idempotent (migration rows unchanged at ${appliedSecond}) and served /api/health`,
    );

    console.log("\nOK standalone artifact applies migrations from a relocated root, idempotently.");
  } catch (error) {
    exitCode = 1;
    if (!process.exitCode) console.error(error?.message ?? error);
  } finally {
    rmSync(relocated, { recursive: true, force: true });
    rmSync(launchCwd, { recursive: true, force: true });
  }

  process.exit(exitCode || process.exitCode || 0);
}

await main();
