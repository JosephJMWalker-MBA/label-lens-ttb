/**
 * Assert that a MySQL production build contains no path to `better-sqlite3`.
 *
 * Hostinger cannot compile the native SQLite addon, so it is an
 * optionalDependency that is simply absent there. A MySQL build previously still
 * emitted `a.exports=require("better-sqlite3")` into every route bundle that
 * reached the database client, and `next build` then died during page-data
 * collection with `Cannot find module 'better-sqlite3'`.
 *
 * Run AFTER a MySQL-dialect `next build` (ideally with the driver uninstalled):
 *
 *   rm -rf node_modules/better-sqlite3
 *   DATABASE_URL='mysql://…' npm run build
 *   npm run verify:mysql-graph
 *
 * Exits non-zero if the driver is reachable from the emitted server graph.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SERVER_DIR = path.join(process.cwd(), ".next", "server");
const ROUTES_THAT_MUST_EXIST = [
  ".next/server/app/api/package/submit/finalize/route.js",
  ".next/server/app/api/package/submit/status/[id]/route.js",
];

// A literal require/import of the native driver. Plain occurrences of the string
// are allowed: Next ships its own `server-external-packages.json`, and Better
// Auth carries an adapter *name table* (`"better-sqlite3":"sqlite"`) that is an
// object key, not a module request.
const FORBIDDEN = [
  /require\(\s*["']better-sqlite3["']\s*\)/,
  /require\(\s*["']drizzle-orm\/better-sqlite3["']\s*\)/,
  /from\s*["']better-sqlite3["']/,
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(js|cjs|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

function main() {
  let failed = false;

  for (const rel of ROUTES_THAT_MUST_EXIST) {
    try {
      statSync(path.join(process.cwd(), rel));
    } catch {
      console.error(`FAIL missing emitted route (did the build succeed?): ${rel}`);
      failed = true;
    }
  }

  let scanned = 0;
  const offenders = [];
  for (const file of walk(SERVER_DIR)) {
    scanned += 1;
    const text = readFileSync(file, "utf8");
    for (const pattern of FORBIDDEN) {
      if (pattern.test(text)) {
        offenders.push(`${path.relative(process.cwd(), file)} matches ${pattern}`);
        break;
      }
    }
  }

  if (offenders.length > 0) {
    failed = true;
    console.error(
      `FAIL the MySQL production graph can reach better-sqlite3 (${offenders.length} file(s)):`,
    );
    for (const offender of offenders) console.error(`  - ${offender}`);
  }

  if (failed) {
    console.error("\nThe MySQL graph must not import or require the native SQLite driver.");
    process.exit(1);
  }

  console.log(
    `OK MySQL production graph is free of better-sqlite3 (scanned ${scanned} emitted server files).`,
  );
}

main();
