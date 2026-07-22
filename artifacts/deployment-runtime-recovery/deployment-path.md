# Deployment path and production launch contract

## Exact launch contract

For Hostinger's current Next.js source deployment:

```text
npm install / npm ci
→ npm run build
→ npm run start
→ next start
→ Next.js Node runtime executes src/instrumentation.ts register()
→ import db/auth modules
→ applyMigrations(process.env.DATABASE_URL)
→ optional runBootstrap() only when LABEL_LENS_BOOTSTRAP_ON_START=1
→ Next starts serving
→ GET /api/health returns 200
```

For a manual standalone launch:

```text
npm run build
→ node .next/standalone/server.js
→ generated standalone server reads PORT and HOSTNAME
→ same instrumentation / migration / bootstrap path
```

If the standalone artifact is copied so `server.js` is at the artifact root, the equivalent command is:

```text
node server.js
```

That command is only valid from the copied standalone artifact root, not the repository root.

## Source inventory

| Concern | Source evidence | Finding |
|---|---|---|
| Build command | `package.json` | `npm run build` runs `next build`. |
| Start command | `package.json` | `npm run start` runs `next start`; there is no custom production server script. |
| Standalone output | `next.config.mjs` | `output: "standalone"` is enabled. |
| Migration packaging | `next.config.mjs` | `outputFileTracingIncludes` globally includes `./src/db/migrations/**`. |
| Startup entrypoint | `src/instrumentation.ts` | `register()` runs in `NEXT_RUNTIME=nodejs`, imports startup/migrate/bootstrap/auth/db, and exits non-zero on startup failure. |
| Startup order | `src/server/startup.ts` | Apply migrations, optional bootstrap, then start serving. |
| Migration invocation | `src/instrumentation.ts`, `src/server/migrate.ts` | `applyMigrations(process.env.DATABASE_URL ?? "")`; missing DB URL fails closed. |
| Bootstrap invocation | `src/server/startup.ts`, `src/server/auth/bootstrap.ts` | Runs only when `LABEL_LENS_BOOTSTRAP_ON_START=1`; missing/invalid bootstrap variables fail closed without passwords. |
| Env validation | `src/db/client.ts`, `src/server/migrate.ts`, `src/server/auth/bootstrap.ts`, `src/lib/integrity.ts`, `src/server/append-token.ts`, `src/lib/panel-storage.ts` | Some variables fail at startup/import; others fail only when specific routes are used. |
| DB parsing | `src/db/dialect.ts`, `next.config.mjs` | `mysql://` and `mysql2://` are recognized after trim; `LABEL_LENS_DB_DIALECT` can force dialect. |
| MySQL init | `src/db/client.mysql.ts` | Uses `mysql2` pool and Drizzle MySQL schema. |
| Migration directory resolution | `src/server/migrate.ts` | Looks under `process.cwd()/src/db/migrations`, `process.cwd()/.next/standalone/src/db/migrations`, and parent directories; `LABEL_LENS_MIGRATIONS_DIR` overrides. |
| PORT/HOSTNAME | `Dockerfile`, `docs/deployment.md` | No app-level listener exists; Next owns bind/listen. Standalone server is documented as reading `PORT` and `HOSTNAME`; Docker sets `HOSTNAME=0.0.0.0`. |
| Health route | `src/app/api/health/route.ts` | Dynamic Node route returns `{ status: "ok", appendSigningKeyConfigured }` with HTTP 200 when executed. |

## Direct answers from source

1. **What exact command must Hostinger run?**
   For the current Hostinger Next.js framework deployment, run `npm run start` after a successful `npm run build`. That executes `next start`. If Hostinger is explicitly configured for the standalone artifact instead, run `node .next/standalone/server.js`.

2. **Does `npm start` execute migrations, or only `next start`?**
   `npm start` is only an alias for `next start`. Migrations are not in the npm script. They run through Next's instrumentation hook before the server serves dynamic routes.

3. **Is there a custom production startup script that Hostinger must invoke?**
   No. The custom startup orchestration is inside `src/instrumentation.ts`, not a separate script. `npm run db:migrate` and `npm run auth:bootstrap` are operator/CI utilities, not the Hostinger runtime start path.

4. **Could Hostinger be starting Next.js without running the application's migration/startup orchestration?**
   If Hostinger truly runs the built Next.js Node server from this source, instrumentation should run. It could bypass orchestration only if Hostinger is serving static output, running a stale/different artifact, invoking an invalid command, failing before instrumentation logs attach, or using a runtime/build shape where `src/instrumentation.ts` is not executed. That remains externally unverified.

5. **Does standalone output contain the committed migrations?**
   Source configuration says yes: `next.config.mjs` explicitly includes `./src/db/migrations/**`, and `scripts/verify-standalone-migrations.mjs` exists to prove the emitted artifact carries them and applies them after relocation. The actual Hostinger artifact has not been inspected.

6. **Does the runtime expect a particular working directory?**
   It supports a repository root and a relocated standalone artifact root. It also searches a small parent chain and supports `LABEL_LENS_MIGRATIONS_DIR` for unusual layouts. A very unusual Hostinger cwd or a copied artifact that omits `src/db/migrations/**` can still fail.

7. **Does it bind to the platform-provided `PORT` and an externally reachable host?**
   There is no custom HTTP server in repo code. `next start` / generated standalone `server.js` owns binding. Docker and docs expect `PORT`; Docker sets `HOSTNAME=0.0.0.0`. The actual Hostinger process command and proxy target remain externally unverified.

8. **Which missing variables fail during startup, and which fail only when a route is used?**

   | Variable | Startup/import impact | Route-use impact |
   |---|---|---|
   | `DATABASE_URL` | Required by `src/db/client.ts`; missing can fail during instrumentation import before structured startup logging. Also required by `applyMigrations`. | All DB-backed dynamic routes fail if DB cannot initialize. |
   | `LABEL_LENS_DB_DIALECT` | Optional; wrong forced value can select the wrong DB graph. | Can make runtime attempt unavailable SQLite graph or wrong MySQL path. |
   | `BETTER_AUTH_SECRET` | Required by docs; Better Auth is imported during startup. Actual production behavior must be checked in logs. | Auth/session routes may fail or sessions may be invalid/unstable. |
   | `BETTER_AUTH_URL` | Required by docs; not separately validated in app source before serving. | Auth origin/cookie/redirect behavior can fail. |
   | `LABEL_LENS_BOOTSTRAP_ON_START` and bootstrap emails/passwords | If flag is `1`, missing/invalid bootstrap values fail startup before serving. | If flag absent, no bootstrap runs. |
   | `LABEL_LENS_APPEND_SIGNING_KEY` | Health still returns 200 and reports `appendSigningKeyConfigured:false`; not a startup blocker by itself. | Precheck/analyze/finalize provenance token paths fail closed in production. |
   | `LABEL_LENS_INTEGRITY_SECRET` | Not required by health startup unless a route imports and calls signing/verification. | Finalize/agent detail integrity signing/verifying fails in production if missing/short. |
   | `LABEL_LENS_STORAGE_DIR` | Not a health startup blocker. | Finalization and panel reads fail closed in production if absent or unwritable. |
   | `LABEL_LENS_BUILD_COMMIT` | Not a startup blocker. | Deployed provenance is unauditable or falls back if absent. |

9. **Can static HTML remain available while the Node runtime is absent?**
   Yes. Current observations already show cached/static root 200 while dynamic/API routes return 503 or timeout.

10. **What observable symptom would each launch-contract mismatch produce?**
    See `hypothesis-matrix.md`.

## Commands Hostinger could be invoking

| Command | Valid? | Expected behavior |
|---|---|---|
| `npm run start` / `npm start` | Valid after `npm run build` | Runs `next start`; instrumentation should apply migrations before dynamic routes serve. |
| `next start` | Valid if Next CLI is available and build exists | Same as `npm start`; bypasses no repo code. |
| `node .next/standalone/server.js` | Valid from repository root after standalone build | Starts generated standalone server; should run instrumentation. |
| `node server.js` | Valid only from copied `.next/standalone` root | Fails from repository root because no committed root `server.js` exists. |
| static file serving only | Invalid for this product | Root shell may appear, but dynamic routes fail. |
| `npm run db:migrate` as start command | Invalid | Applies migrations then exits; no web server. |
| `npm run auth:bootstrap` as start command | Invalid | Provisions accounts then exits; no web server. |
