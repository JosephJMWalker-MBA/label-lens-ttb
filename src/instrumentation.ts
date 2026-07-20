/**
 * Next.js instrumentation hook — the production-compatible startup path.
 *
 * `register()` runs once, inside the compiled Next.js server runtime, before any
 * request is served. This is the only place the deployment can reliably run
 * startup work on Hostinger's Node web-app runtime (shared SSH exposes no app
 * directory and no `node`): the platform's own start command boots Next, Next
 * compiles this file to plain JavaScript, and `register()` executes using only
 * runtime dependencies — no vite-node, no TypeScript execution at runtime, and
 * no devDependencies.
 *
 * Order: apply committed migrations → (optionally) provision accounts when
 * LABEL_LENS_BOOTSTRAP_ON_START=1 → let Next start serving. If migration or a
 * requested bootstrap fails, the process exits non-zero *before* the server
 * accepts traffic (fail closed). Passwords are never logged.
 */
export async function register(): Promise<void> {
  // Migrations and bootstrap require the Node runtime (mysql2, Better Auth).
  // The edge runtime also invokes register(); skip it there.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [{ runStartup }, { applyMigrations }, { runBootstrap }, { auth }, { db, schema }] =
    await Promise.all([
      import("@/server/startup"),
      import("@/server/migrate"),
      import("@/server/auth/bootstrap"),
      import("@/lib/auth"),
      import("@/db/client"),
    ]);

  const result = await runStartup({
    env: process.env,
    migrate: () => applyMigrations(process.env.DATABASE_URL ?? ""),
    bootstrap: () => runBootstrap({ auth, db, schema }, { env: process.env }),
    // Next.js owns the HTTP server; instrumentation only prepares the runtime.
    // Reaching this point means migrations (and any requested bootstrap) passed,
    // so returning lets Next continue booting and start accepting requests.
    startServer: () => {},
    logger: {
      info: (message) => console.log(message),
      error: (message) => console.error(message),
    },
  });

  if (!result.ok) {
    console.error(
      `[startup] Startup preparation failed during "${result.phase}"; exiting before the server accepts requests.`,
    );
    process.exit(result.code || 1);
  }
}
