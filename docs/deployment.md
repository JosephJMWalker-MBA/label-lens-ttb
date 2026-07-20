# Deployment — Label Lens TTB (domestic-wine pre-check)

This deploys the **existing** vertical slice unchanged: upload a wine-label image
→ local OCR → evidence + deterministic findings → human confirmation/disposition
→ checksum-protected JSON + readable HTML export. **No mandatory cloud AI service
is used** (OCR runs locally via vendored Tesseract WebAssembly).

## Current public deployment

- **Primary URL:** <https://ttb-test.com>
- **Host:** Hostinger Web Apps
- **Source:** GitHub repository `JosephJMWalker-MBA/label-lens-ttb`
- **Branch:** `main`
- **Framework preset:** Next.js
- **Node version:** 22.x
- **Deployment established:** 2026-07-17

The earlier Render deployment may remain available as a secondary demonstration,
but `ttb-test.com` is the current custom-domain deployment documented here.

## Runtime requirements

- **Persistent Node server** (Next.js `output: "standalone"`; not static hosting
  and not a short-lived serverless function — OCR runs in a Node worker).
- **Node 22** (`.nvmrc`, `engines`).
- **glibc environment** (Debian/Ubuntu) for the native `sharp` binary. Avoid
  Alpine/musl unless you install the musl `sharp` build.
- **~512 MB RAM** recommended (sharp + Tesseract WASM + bounded image budgets).
- **No writable persistent storage required** — uploads are processed in memory
  and never written to disk; nothing is persisted between requests.
- **No network at request time** — the OCR language data, WASM core, and worker
  script are vendored and traced into the build.

## Environment variables

| Name | Required | Notes |
|---|---|---|
| `LABEL_LENS_APPEND_SIGNING_KEY` | **Yes (production)** | ≥ 32 chars, secret. The pre-check route issues an HMAC append-authorization token on every run, so production returns HTTP 500 (`APPEND_SIGNING_KEY_UNAVAILABLE`) until this is set. Generate with `openssl rand -hex 32`. Never commit it. |
| `LABEL_LENS_BUILD_COMMIT` | **Required for auditable production provenance** | Set to the deployed Git commit SHA. Without it on Hostinger, exports fall back to `development build (no deployed commit)`, even when the application is publicly deployed. |
| `NODE_ENV` | Set by platform | Must resolve to `production` in the live build. |
| `PORT` | Set by platform | The server binds to it. |
| `RENDER_GIT_COMMIT` | Automatic on Render only | Used for export provenance when `LABEL_LENS_BUILD_COMMIT` is absent or blank. Hostinger does not currently supply this Render-specific variable. |
| `LABEL_LENS_OCR_ASSET_DIR`, `LABEL_LENS_OCR_CORE_DIR` | Optional | Override OCR asset locations. Not needed — assets resolve deployment-relative by default. |

**No secrets are committed to the repository.** Set the signing key only in the
hosting platform's secret store. The build commit is not a secret.

## Database dialect graphs (`better-sqlite3` is never required in production)

MySQL is authoritative in production. SQLite backs local development and tests
only, and its driver `better-sqlite3` is a **native addon Hostinger cannot
compile** — it is an `optionalDependency` that is simply absent there.

The two dialects live in fully separate modules (`src/db/client.mysql.ts` and
`src/db/client.sqlite.ts`). At build time `next.config.mjs` resolves the dialect
and, for a MySQL build, **replaces the SQLite module with a stub**, so the
emitted server graph contains no import, no external factory, and no executable
`require("better-sqlite3")` anywhere. The build prints which graph it emitted:

```text
[build] database dialect graph: mysql (better-sqlite3 excluded entirely)
```

Marking the driver `external` was **not** sufficient: webpack still emitted
`a.exports=require("better-sqlite3")` into every route bundle that reached the
database client, and `next build` then failed during page-data collection with
`Cannot find module 'better-sqlite3'` for `/api/package/submit/finalize` and
`/api/package/submit/status/[id]`.

The dialect is resolved from `DATABASE_URL` (tolerant of padding and scheme
casing). If a host's connection string cannot be sniffed confidently, set
`LABEL_LENS_DB_DIALECT=mysql` to force the MySQL graph explicitly.

Verify a production build the way CI does:

```bash
rm -rf node_modules/better-sqlite3
DATABASE_URL='mysql://…' npm run build
npm run verify:mysql-graph
```

## Startup migrations and account bootstrap (Hostinger web-app runtime)

Hostinger's shared SSH shell is **not** the Node web-app runtime: it exposes no
deployed `package.json` and no `node`, so operators cannot run a provisioning
command over SSH. Instead, database migrations and (optionally) account
provisioning run **inside the deployed runtime at server startup**, via the
Next.js instrumentation hook (`src/instrumentation.ts`). This runs as ordinary
compiled JavaScript using only runtime dependencies — no `vite-node`, no
TypeScript execution, and no devDependencies.

Startup order (fail-closed): **validate environment → apply committed migrations
→ optionally bootstrap accounts → start serving**. A migration failure or a
requested-but-failed bootstrap exits the process non-zero *before* the server
accepts requests.

### Migration artifacts must ship with the server

The committed migrations are **data read at runtime**, not imports, so static
tracing never discovers them. They are packaged explicitly via a global
`outputFileTracingIncludes` entry for `./src/db/migrations/**`, which carries
every SQL file, every snapshot, and `meta/_journal.json` into the standalone
output. Without it a standalone deploy boots with no migrations on disk and
fails with `Can't find meta/_journal.json file`.

The runtime folder is resolved deterministically for both deployment shapes — a
source checkout, and a relocated `.next/standalone` artifact (whose `server.js`
does `process.chdir(__dirname)`) — and never by assuming a checkout-shaped
`process.cwd()`. If the folder cannot be found, startup **fails closed** with a
secret-free diagnostic listing every path it tried; migrations are never skipped
and `_journal.json` is never generated or reconstructed at runtime.
`LABEL_LENS_MIGRATIONS_DIR` overrides resolution for an unusual layout.

Verify the real emitted artifact the way CI does:

```bash
DATABASE_URL='mysql://…' npm run build
DATABASE_URL='mysql://…/disposable_db' npm run verify:standalone-migrations
```

That relocates the artifact outside the repository, launches it from an
unrelated working directory, applies migrations to a fresh database, and proves
a second startup is idempotent.

`npm run start` is plain `next start`; the instrumentation hook does the rest.

| Name | Required | Notes |
|---|---|---|
| `DATABASE_URL` | **Yes (production)** | Authoritative MySQL connection string. Migrations run against it at startup. |
| `BETTER_AUTH_SECRET` | **Yes (production)** | ≥ 32 chars, secret. |
| `BETTER_AUTH_URL` | **Yes (production)** | The public origin, e.g. `https://ttb-test.com`. Drives the auth base URL; no hostname is hardcoded. |
| `LABEL_LENS_DB_DIALECT` | Optional | Force the dialect graph (`mysql` / `sqlite`) when `DATABASE_URL` cannot be sniffed confidently. Overrides URL detection at both build and runtime. |
| `LABEL_LENS_MIGRATIONS_DIR` | Optional | Absolute path to the committed migrations, for a deployment layout where they are neither beside the working directory nor in the standalone root. |
| `LABEL_LENS_BOOTSTRAP_ON_START` | Optional | Set to `1` to provision accounts at startup. Remove it once accounts exist. |
| `LABEL_LENS_BOOTSTRAP_RESET_PASSWORDS` | Optional | Set to `1` only to reset provisioned passwords; otherwise existing passwords are left unchanged. |
| `LABEL_LENS_BOOTSTRAP_ADMIN_EMAIL` / `_PASSWORD` | With bootstrap | Admin account. Password ≥ 12 chars. |
| `LABEL_LENS_BOOTSTRAP_AGENT_EMAIL` / `_PASSWORD` | With bootstrap | Agent account. |
| `LABEL_LENS_BOOTSTRAP_SELLER_EMAIL` / `_PASSWORD` | With bootstrap | Seller account. |

Bootstrap is **idempotent** and **fail-closed**: with `LABEL_LENS_BOOTSTRAP_ON_START=1`
set, missing credentials abort startup rather than starting a half-provisioned
server. It never prints passwords or full secret-bearing URLs, redacts emails in
logs, and exposes no public bootstrap route. Repeated restarts are safe: existing
accounts are left unchanged unless `LABEL_LENS_BOOTSTRAP_RESET_PASSWORDS=1`.

Startup emits non-secret logs, for example:

```text
[startup] Applying database migrations…
[startup] Migrations applied.
[startup] admin a***@example.com → created
[startup] agent a***@example.com → created
[startup] seller s***@example.com → created
[startup] Starting the production server…
```

To promote the deployment to a new hostname later, follow the
[hostname promotion runbook](deploy/hostname-promotion.md).

## Health check

`GET /api/health` → `200 { "status": "ok", "appendSigningKeyConfigured": <bool> }`.
It runs no OCR/image/filesystem work. If `appendSigningKeyConfigured` is `false`
in production, the signing secret is missing and pre-checks will fail — set the
environment variable and redeploy.

## Build & start

Standard persistent-Node path:

```bash
npm ci --include=dev
npm run build
npm run start
```

`--include=dev` protects the build when the hosting platform sets
`NODE_ENV=production` before dependency installation; the TypeScript and Next.js
build tooling lives in `devDependencies`.

Container/standalone alternative (used by the Dockerfile):

```bash
node .next/standalone/server.js   # reads PORT and HOSTNAME from the environment
```

## Hostinger deployment path (current)

1. In Hostinger, create a **Web App** and import the GitHub repository.
2. Select the `main` branch, the **Next.js** framework preset, **Node 22.x**, and
   root directory `./`.
3. Add `LABEL_LENS_APPEND_SIGNING_KEY` in Hostinger's environment-variable store.
4. Add `LABEL_LENS_BUILD_COMMIT` with the exact `main` commit SHA being deployed.
5. Deploy to `ttb-test.com`.
6. Verify `/api/health`, run the bundled M Cellars sample, and download both the
   JSON and HTML reports.
7. Confirm the report's application-build provenance contains the deployed commit
   rather than the development fallback.

Hostinger's default Next.js build settings successfully produced the live
application on 2026-07-17. If a future build omits development dependencies, set
the explicit install/build command to `npm ci --include=dev && npm run build`.

## Production smoke test — 2026-07-17

The first Hostinger deployment completed an end-to-end run at `ttb-test.com`:

- the bundled M Cellars sample ran through real server-side OCR;
- alcohol was observed as `12.5% ALC./VOL.` with an OCR evidence score of `0.91`;
- alcohol syntax and declared-value comparison returned deterministic `PASS`;
- brand extraction remained honestly `AMBIGUOUS` (`CELLARS`, score `0.31`) and
  routed the canonical brand comparison to `NEEDS_REVIEW`;
- external-evidence-dependent rules remained `not_run`;
- checksum-protected JSON and readable HTML exports downloaded successfully; and
- the HTML report checksum matched the canonical JSON export checksum.

Known gap discovered by the smoke test: application-build provenance reported
`development build (no deployed commit)`. Configure `LABEL_LENS_BUILD_COMMIT` and
redeploy before treating exported provenance as deployment-complete.

The bundled-sample path does not provide a browser-local image preview. A separate
manual-upload smoke test should verify preview rendering, review-region drawing,
human confirmation history, and regenerated exports.

## Render path (secondary / preview-capable)

`render.yaml` remains a ready blueprint: a Node web service that can auto-deploy
`main`, create per-PR preview environments, and health-check `/api/health`.

1. In Render: **New → Blueprint**, connect the GitHub repo, select `render.yaml`.
2. Set `LABEL_LENS_APPEND_SIGNING_KEY` when prompted.
3. Leave `LABEL_LENS_BUILD_COMMIT` blank unless an explicit override is needed;
   Render supplies `RENDER_GIT_COMMIT` automatically.
4. Create the service. The blueprint installs, builds, and starts the application.

The Render free plan may spin down when idle. It is useful as a secondary demo or
preview path, while Hostinger currently serves the custom production-test domain.

## Portable path — Docker (Railway / Fly.io / VPS / Render-Docker)

Use the committed `Dockerfile` (Debian slim, standalone output, non-root):

```bash
docker build -t label-lens-ttb .
docker run -p 3000:3000 \
  -e LABEL_LENS_APPEND_SIGNING_KEY=$(openssl rand -hex 32) \
  -e LABEL_LENS_BUILD_COMMIT=$(git rev-parse HEAD) \
  label-lens-ttb
```

- **Railway / Fly.io:** point the service at the repo/Dockerfile and set the same
  environment variables. Fly needs `flyctl launch` (Dockerfile detected);
  Railway detects it automatically.
- Health check path: `/api/health`.

## Live-version strategy

- **Stable custom-domain build:** Hostinger service tracking `main` at
  <https://ttb-test.com>.
- **Tester/staging build:** Render PR previews or a second Hostinger/Docker service.
- Only tested, merged changes should reach the stable domain.

## Redeploying

- **Hostinger:** merge to `main`, then allow GitHub-connected deployment or trigger
  redeployment from the Hostinger Web App dashboard.
- **Render:** merge to `main` for automatic deployment, or use **Manual Deploy**.
- **Docker:** rebuild the image and restart the service.
- Update `LABEL_LENS_BUILD_COMMIT` whenever the deployed commit changes unless the
  platform is later integrated to provide equivalent commit metadata automatically.
- Rotating `LABEL_LENS_APPEND_SIGNING_KEY` invalidates append tokens held by
  browsers from before the rotation; re-run the pre-check to receive a fresh token.

## Trusted-tester access

Share the stable URL, a preview URL, or a staging URL. No login exists — it is an
advisory demo. Testers can upload a wine label, review evidence/findings, append
human workflow records, and download JSON and HTML exports. The advisory and
non-government language is always visible.

## What is intentionally NOT deployed

Cloud OCR fallback, non-wine categories, corpus annotation, and any benchmark —
all documented future work. Persistence (MySQL) and provisioned role-based
accounts are part of the review-portal slice; there is no public self-service
registration.
