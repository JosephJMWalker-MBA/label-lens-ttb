# Observation

## Hostinger evidence supplied by maintainer

The maintainer inspected Hostinger directly and reported:

- application status: Running;
- latest deployment state: Completed;
- deployed branch: `main`;
- deployed commit: `c3dfb942`;
- commit message: `fix(storage): preserve signed submission revisions in MySQL (#161)`;
- framework: Next.js;
- Node version: 22.x;
- root directory: `./`;
- deployment timestamp: `2026-07-21 23:07`;
- runtime-logs page: No logs found;
- issues: 0;
- errors: 0.

## Controlled recovery experiment

The maintainer changed only:

```text
LABEL_LENS_BOOTSTRAP_ON_START=1
```

to:

```text
LABEL_LENS_BOOTSTRAP_ON_START=0
```

and redeployed.

All other observed environment variables, database configuration, deployed commit, Node version, framework selection, and repository code remained unchanged.

Codex did not directly change production configuration or initiate a deployment. The maintainer performed the controlled Hostinger configuration change and redeployment/restart.

Required attribution:

> The controlled configuration experiment attributes the first failing boundary to the bootstrap-enabled startup path. With bootstrap enabled, the dynamic runtime was unavailable. With bootstrap disabled and all other observed conditions unchanged, the runtime became healthy.

Do not claim the exact internal bootstrap exception, because the failed run did not preserve usable runtime logs.

## Dynamic observations retained

- Static/cached root returns HTTP 200.
- `/api/health` returns HTTP 503.
- `/api/auth/get-session` returns HTTP 503.
- `/login` returns HTTP 503.
- `/agent` times out.

## Confirmed recovery observations

- `/api/health` returns HTTP 200 with `{"status":"ok","service":"label-lens-ttb","appendSigningKeyConfigured":true}`.
- `/login` renders and login succeeds.
- Runtime logs show:
  - Next.js 15.5.20;
  - bind address `0.0.0.0:3000`;
  - `[startup] Applying database migrations…`;
  - `[startup] Migrations applied.`;
  - `[startup] Startup bootstrap disabled`;
  - `[startup] Starting the production server…`;
  - Ready;
  - no runtime errors.
- Production `submission_revisions.canonical_json` is `MEDIUMTEXT NOT NULL`.
- Both committed migrations are recorded.
- One credential-backed admin, agent, and seller account already exists.
- No historical submission row was modified.
- Maintainer-side bounded DB verification for the new synthetic package returned:
  - `matching_revisions = 1`;
  - `canonical_utf8_bytes = 96256`;
  - a row matching the exact submitted SHA-256 predicate `3986c838fa8457071f7e560c01f8943d11c97c9693c6f2fb0eb0958706273351`.

## What this proves

- Hostinger selected the expected repository branch and a post-#161 commit.
- Hostinger dashboard-level deployment completion alone was not enough to prove the Node server was healthy.
- The controlled configuration delta attributes the first failing boundary to the bootstrap-enabled startup path.
- Recovered logs prove the server binds/listens, migrations apply, bootstrap is disabled, and Next reaches Ready.
- Cached/static HTML can remain available while dynamic routes fail, so `/api/health`, auth, and login remain the correct recovery probes.

## What this does not prove

- It does not prove the exact internal bootstrap exception from the failed run.
- The stored canonical byte-length and digest comparison is complete for the new synthetic submission via maintainer-side bounded production DB verification.

## Protected non-actions

Codex did not directly change production configuration or initiate a deployment. The maintainer changed only `LABEL_LENS_BOOTSTRAP_ON_START` from `1` to `0`, which triggered the controlled Hostinger redeployment/restart that restored the runtime. No historical failed record, fixture, OCR, integrity code, or application code was changed by this diagnosis. The live verification created one new repository-owned synthetic package record through the recovered public app workflow.
