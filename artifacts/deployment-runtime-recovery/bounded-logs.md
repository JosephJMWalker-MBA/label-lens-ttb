# Bounded logs

## Current log evidence

The failed bootstrap-enabled deployment had no usable runtime logs. The maintainer reported that Hostinger's runtime-logs page said:

- No logs found;
- issues 0;
- errors 0.

Treat this as evidence that the visible Hostinger runtime log page had no entries for the failed run. It is not evidence of the exact internal bootstrap exception.

## Recovered runtime log evidence

After changing only `LABEL_LENS_BOOTSTRAP_ON_START=1` to `LABEL_LENS_BOOTSTRAP_ON_START=0`, recovered runtime logs show:

```text
Next.js 15.5.20
0.0.0.0:3000
[startup] Applying database migrations…
[startup] Migrations applied.
[startup] Startup bootstrap disabled
[startup] Starting the production server…
Ready
```

No runtime errors were reported.

## Separate non-blocking warning

Runtime logs contain a Better Auth warning that client IP cannot be determined behind the Hostinger proxy, so rate limiting falls back to a shared per-path bucket.

This is a separate non-blocking follow-up. Do not change trusted-proxy or IP-header configuration in Issue #162 without independent scoping and review.

## Expected safe startup log sequence

The app's startup code emits only bounded, non-secret messages:

```text
[startup] Applying database migrations…
[startup] Migrations applied.
[startup] Startup bootstrap disabled (set LABEL_LENS_BOOTSTRAP_ON_START=1 to enable).
[startup] Starting the production server…
```

If bootstrap is enabled, account emails are redacted by code and passwords are not logged.

## Safe build log evidence to capture

Capture only bounded lines around:

- install command;
- build command;
- start command if shown;
- Node version;
- framework preset;
- root directory;
- build output setting;
- the emitted database graph line: `[build] database dialect graph: ...`;
- any non-secret error code/message.

Do not copy environment variable values, connection strings, session cookies, complete stack traces containing private paths, canonical JSON, signatures, or uploaded bytes.

## Safe runtime evidence to capture

Capture:

- process command;
- cwd/root used by process;
- assigned port/proxy target;
- process start timestamp;
- exit code;
- restart count;
- bounded stdout/stderr around startup;
- whether each expected `[startup]` line appears;
- whether any migration/bootstrap/DB error code appears.

Do not capture:

- `DATABASE_URL` value;
- `BETTER_AUTH_SECRET`;
- `LABEL_LENS_INTEGRITY_SECRET`;
- `LABEL_LENS_APPEND_SIGNING_KEY`;
- `LABEL_LENS_STORAGE_DIR` absolute private path;
- cookies or session material;
- database rows;
- canonical package JSON;
- signatures;
- image bytes.

## Interpretation

| Observed bounded log pattern | Interpretation |
|---|---|
| No `[startup]` line and immediate process exit | Import-time failure, wrong command, missing runtime logs, or server never started. |
| `[startup] Applying database migrations…` then migration failure | First failing boundary is migration/DB/artifact path. |
| `[startup] Migrations applied.` then bootstrap failure | First failing boundary is bootstrap configuration. |
| `[startup] Starting the production server…` then 503 | Process listen/proxy/upstream mismatch or crash after startup. |
| All expected startup lines and `/api/health` 200 | Runtime recovered; proceed to auth and integrity verification. |

## Current interpretation

The recovered logs match the successful startup pattern. The failed-run internals remain unknown, so attribution is limited to the controlled configuration boundary: bootstrap enabled versus disabled.
