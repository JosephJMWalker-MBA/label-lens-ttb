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
| `LABEL_LENS_TRUSTED_IP_HEADERS`, `LABEL_LENS_TRUSTED_PROXIES` | Optional | See [Trusted client IP behind the Hostinger proxy](#trusted-client-ip-behind-the-hostinger-proxy) below. Leave unset until the values are verified — do not guess them. |
| `LABEL_LENS_PROXY_DIAGNOSTIC`, `LABEL_LENS_PROXY_DIAGNOSTIC_TOKEN`, `LABEL_LENS_PROXY_DIAGNOSTIC_HMAC_SECRET` | Optional, **temporary** | See [Temporary Hostinger proxy header diagnostic](#temporary-hostinger-proxy-header-diagnostic-issue-183) below. Leave unset by default; enable only for the one bounded evidence-gathering round, then disable and remove the code. |

**No secrets are committed to the repository.** Set the signing key only in the
hosting platform's secret store. The build commit is not a secret.

## Trusted client IP behind the Hostinger proxy

Better Auth's default rate limiter needs a trustworthy client IP to key its
per-path buckets. Behind any reverse proxy — Hostinger's managed "Web App"
product included — the raw socket address seen by the Node process is the
proxy's own address, not the visitor's, so Better Auth reads it from a
forwarded header instead (`x-forwarded-for` by default). Without a configured
**trusted proxy boundary**, Better Auth will only trust that header when it
contains exactly one hop; behind most reverse proxies it is null, and every
visitor collapses into a single shared per-path rate-limit bucket. That is the
non-blocking startup warning:

> Rate limiting could not determine a client IP and is falling back to a
> single shared per-path bucket…

**Hostinger does not publish a documented, stable reverse-proxy header or IP
contract for its managed "Web App" Node.js hosting product** (checked
Hostinger's own Node.js Web App hosting support docs and hPanel
documentation). Committing a guessed proxy IP/CIDR or header name as source
would satisfy the warning message without any guarantee it reflects reality,
and a wrong trusted-proxy entry is worse than the current fallback: it could
let a forged header be trusted as the real client. So this repository does
**not** hardcode a value. Instead, `src/lib/trusted-ip-config.ts` reads two
optional environment variables and wires them into Better Auth's
`advanced.ipAddress` option (see `src/lib/auth.ts`):

| Name | Format | Effect |
|---|---|---|
| `LABEL_LENS_TRUSTED_IP_HEADERS` | comma-separated header names | Overrides which header(s) Better Auth reads the client IP from (default: `x-forwarded-for` only). |
| `LABEL_LENS_TRUSTED_PROXIES` | comma-separated IP/CIDR entries | The proxy hop(s) Better Auth is allowed to strip from a forwarded-for chain to find the real client. Required for a multi-hop chain to resolve at all. |

Leaving both unset is byte-for-byte the same as omitting `advanced.ipAddress`
— today's fallback behavior (and its warning) is unchanged.

**Before setting either variable in production**, confirm the real values —
do not guess:

1. Use the temporary, privacy-preserving diagnostic below (issue #183) — or
   ask Hostinger support directly — to observe what header(s) a live request
   actually carries, and whether Hostinger's edge consistently forwards from
   one internal IP or IP range.
2. Set `LABEL_LENS_TRUSTED_PROXIES` to that confirmed range (as narrow as
   possible — a single IP or the smallest CIDR that covers Hostinger's proxy
   layer) and, only if Hostinger uses a non-default header, set
   `LABEL_LENS_TRUSTED_IP_HEADERS` to match.
3. Confirm the startup warning disappears under real traffic and that
   `npm test -- trusted-ip` still passes (it exercises Better Auth's real
   `getIp`/`trustedProxies` resolution against representative header values,
   including a spoofed extra hop, without needing network access).
4. A malformed or empty `LABEL_LENS_TRUSTED_PROXIES` entry does not open a
   trust boundary — Better Auth drops invalid CIDR entries and degrades to
   "no trusted proxies configured," the same safe fallback as leaving it
   unset.

## Temporary Hostinger proxy header diagnostic (issue #183)

**This section, and the code it documents, must not exist once the evidence
below has been collected.** It is scaffolding for exactly one deployment
round to observe Hostinger's live reverse-proxy header behavior — never a
permanent debug endpoint. Do not leave it enabled, and do not leave the route
in the tree, once step 6 is done.

### What it is

`GET /api/admin/proxy-diagnostic` (`src/app/api/admin/proxy-diagnostic/route.ts`,
logic in `src/lib/proxy-diagnostic.ts`) returns a small, fixed-shape JSON
report: for each candidate proxy header (`x-forwarded-for`, `x-real-ip`,
`forwarded`, `cf-connecting-ip`, `true-client-ip`, `x-client-ip`,
`fastly-client-ip`, `x-cluster-client-ip`) it reports only whether the header
is present, how many comma-separated hops it contains, and one keyed
HMAC-SHA256 digest per hop — enough to tell whether two observations are the
**same** value without ever exposing what that value **is**. It also reports
`peerAddressAvailable: false` / `peerAddressDigest: null` always: Next.js
Route Handlers only ever see a standard Web `Request`, with no access to the
underlying TCP socket, so the direct peer address genuinely cannot be
observed from this runtime layer — that limitation is recorded explicitly
rather than approximated.

It never inspects, retains, or returns cookies, `authorization`, session
values, query strings, the request body, or any header outside the fixed
candidate list above. `src/lib/proxy-diagnostic.test.ts` and
`src/app/api/admin/proxy-diagnostic/route.test.ts` assert this directly —
including planting a raw IP, a session cookie, and a bearer token in request
headers and proving none of them appear anywhere in the response.

### Gating (defense in depth, disabled by default)

1. `LABEL_LENS_PROXY_DIAGNOSTIC` must be the literal string `true`, or the
   route responds `404` — indistinguishable from a route that doesn't exist.
2. `LABEL_LENS_PROXY_DIAGNOSTIC_TOKEN` (≥ 20 chars) and
   `LABEL_LENS_PROXY_DIAGNOSTIC_HMAC_SECRET` (≥ 32 chars) must both be set,
   or the route responds `503` without revealing which is missing. Neither
   has a default; there is no fallback secret.
3. The caller must send the exact token via the `X-Diagnostic-Token` header,
   compared in constant time (`verifyDiagnosticToken`, digest-then-compare so
   neither length nor content is leaked through timing). A missing or wrong
   token responds `404`, the same as the route being disabled — an attacker
   who reaches this endpoint learns nothing about *why* it refused them.

### Operator steps

1. **Deploy with the diagnostic disabled** (leave `LABEL_LENS_PROXY_DIAGNOSTIC`
   unset). This ships as inert code — no behavior changes until it's turned on.
2. **Temporarily enable it**: set `LABEL_LENS_PROXY_DIAGNOSTIC=true`, a fresh
   `LABEL_LENS_PROXY_DIAGNOSTIC_TOKEN` (e.g. `openssl rand -hex 24`), and a
   fresh `LABEL_LENS_PROXY_DIAGNOSTIC_HMAC_SECRET` (e.g. `openssl rand -hex 32`)
   in the hosting platform's secret store, then redeploy.
3. **Make controlled requests** from at least two known external networks
   where practical, e.g.:
   ```bash
   curl -s -H "X-Diagnostic-Token: <token>" https://ttb-test.com/api/admin/proxy-diagnostic
   ```
   Repeat from a second network/device. Compare the two JSON responses:
   matching `hopDigests` for the *last* hop across both requests, with
   different digests for the earlier hop(s), is the signature of a stable
   proxy hop sitting in front of varying real clients.
4. **Inspect Hostinger's runtime logs** for the deployed process, if
   available, as a cross-check — the diagnostic itself does not write
   anything server-side; it only returns the report in the HTTP response.
5. **Record only the redacted comparison results** (never raw digests
   correlated with real IPs you happen to know) in the issue/PR: which
   header(s) were present, the hop count, and whether the same hop's digest
   repeated across independent requests/networks.
6. **Disable the diagnostic** (unset `LABEL_LENS_PROXY_DIAGNOSTIC` or set it to
   anything other than `true`) and **remove this temporary code** —
   `src/lib/proxy-diagnostic.ts`, its tests, `src/app/api/admin/proxy-diagnostic/`,
   and this section — in the same PR that acts on the evidence, or in a
   guaranteed immediate follow-up. Do not merge a permanent
   `LABEL_LENS_TRUSTED_PROXIES`/`LABEL_LENS_TRUSTED_IP_HEADERS` configuration
   change in the same commit as leaving this diagnostic in place.

If the evidence is ambiguous — no stable repeating hop, or the candidate
headers are all absent — leave `LABEL_LENS_TRUSTED_PROXIES` and
`LABEL_LENS_TRUSTED_IP_HEADERS` unset and document that explicitly; the
existing shared-bucket fallback from the previous section remains in effect.

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
