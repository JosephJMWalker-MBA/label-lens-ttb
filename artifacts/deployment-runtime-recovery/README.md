# Deployment runtime recovery — Issue #162

## Executive result

The dynamic runtime is recovered after a controlled configuration change. No application code change is justified inside Issue #162.

Required attribution:

> The controlled configuration experiment attributes the first failing boundary to the bootstrap-enabled startup path. With bootstrap enabled, the dynamic runtime was unavailable. With bootstrap disabled and all other observed conditions unchanged, the runtime became healthy.

Do not claim the exact internal bootstrap exception. The failed bootstrap-enabled run did not preserve usable runtime logs.

Two production-change facts are intentionally separate:

1. Codex did not directly change production configuration or initiate a deployment.
2. The maintainer changed only `LABEL_LENS_BOOTSTRAP_ON_START` from `1` to `0`, which triggered the controlled Hostinger redeployment/restart that restored the runtime.

The current source defines a fail-closed production launch contract:

1. build a Next.js standalone-capable production artifact;
2. start the Next.js Node server with `npm run start` / `next start`, or start the emitted standalone server with `node .next/standalone/server.js`;
3. execute `src/instrumentation.ts` in the Node runtime;
4. import the database/auth modules;
5. apply committed MySQL migrations;
6. optionally run bootstrap only when `LABEL_LENS_BOOTSTRAP_ON_START=1`;
7. let Next bind/listen and serve dynamic routes;
8. verify `/api/health`.

Hostinger evidence confirms deployment selection, build boundary, and recovered runtime health:

- application status: Running;
- latest deployment state: Completed;
- branch: `main`;
- deployed commit: `c3dfb942`;
- framework: Next.js;
- Node version: 22.x;
- root directory: `./`;
- runtime logs after bootstrap was disabled show Next.js 15.5.20, bind address `0.0.0.0:3000`, migrations applied, bootstrap disabled, production server startup, Ready, and no runtime errors.
- `/api/health` returns HTTP 200 with `appendSigningKeyConfigured:true`.
- `/login` renders and public demo login succeeds.
- production `submission_revisions.canonical_json` is confirmed as `MEDIUMTEXT NOT NULL`.
- both committed migrations are recorded.
- one credential-backed admin, agent, and seller account already exists.
- no historical submission row was modified.

This eliminates stale branch, stale commit, failed deployment status, wrong framework selection, wrong Node major, wrong start command, missing migration artifact, migration failure, DB connection failure at startup, and proxy/listen mismatch for the recovered deployment.

## First failing boundary

Confirmed at the configuration level: bootstrap-enabled startup path.

Exact internal bootstrap exception remains unknown because the failed run did not retain usable runtime logs. The durable correction for this deployment is to leave `LABEL_LENS_BOOTSTRAP_ON_START=0` because required admin, agent, and seller accounts already exist.

## Live deployment gate status

- Seller login and seller route access: passed.
- Agent login and agent queue access: passed.
- Admin login and admin/agent-queue access: passed.
- Anonymous and seller access to agent detail and panel bytes: blocked as expected.
- Synthetic package canonical string: 96,256 UTF-8 bytes, greater than 65,535.
- Finalization: succeeded.
- Agent detail: opened with `integrityVerified:true`.
- Authorized panel delivery: succeeded and matched submitted synthetic bytes.
- DB-stored canonical byte length/digest match: completed by maintainer-side bounded production DB query. The query returned `matching_revisions = 1`, `canonical_utf8_bytes = 96256`, and a row matching the submitted SHA-256 predicate `3986c838fa8457071f7e560c01f8943d11c97c9693c6f2fb0eb0958706273351`.

No canonical JSON, signature, credential, or historical failing-row content was exposed or modified.

## Artifact inventory

- `observation.md` — current bounded observations and what they do / do not prove.
- `deployment-path.md` — exact production launch contract and direct source answers.
- `hypothesis-matrix.md` — bounded external-blocker matrix.
- `bounded-logs.md` — what logs are safe and required.
- `correction.md` — smallest correction by confirmed boundary; no speculative code change.
- `runtime-verification.md` — post-recovery dynamic runtime checks.
- `integrity-verification.md` — deferred post-#161 integrity verification plan.
- `limitations.md` — uncertainty and unperformed checks.
- `commands.sh` — safe endpoint probes and metadata-only SQL.
- `git-sha.txt` — inspected commit.
- `maintainer-hostinger-checklist.md` — Hostinger click-path checklist.

## Source anchors

- `package.json` — `build` is `next build`; `start` is `next start`.
- `next.config.mjs` — `output: "standalone"` and explicit migration tracing.
- `src/instrumentation.ts` — production startup hook.
- `src/server/startup.ts` — migration/bootstrap/server ordering.
- `src/server/migrate.ts` — migration directory resolution and MySQL migration invocation.
- `src/db/client.ts` and `src/db/dialect.ts` — database env and dialect resolution.
- `src/app/api/health/route.ts` — dynamic health behavior.
- `src/lib/integrity.ts`, `src/server/append-token.ts`, `src/lib/panel-storage.ts` — route-use secrets and storage boundaries.
- `docs/deployment.md`, `Dockerfile`, `render.yaml` — documented host command variants.
