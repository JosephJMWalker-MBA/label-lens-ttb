# Maintainer Hostinger checklist

Use this checklist without copying secret values into GitHub, Codex, email, or chat.

## 1. Deployment logs

Click path:

```text
Hostinger hPanel
→ Websites
→ ttb-test.com
→ Manage
→ Web App / Deployments
→ latest deployment
→ View build/deployment logs
```

Capture:

- deployment id/timestamp;
- repository and branch;
- commit;
- install command;
- build command;
- build output setting;
- Node version;
- root directory;
- any non-secret error code/message;
- whether the build printed `[build] database dialect graph: mysql ...`.

Do not capture environment values or connection strings.

## 2. Environment variables

Click path:

```text
Hostinger hPanel
→ Websites
→ ttb-test.com
→ Manage
→ Web App
→ Environment variables
```

Verify presence and minimum length only:

| Variable | Safe check |
|---|---|
| `DATABASE_URL` | Present; starts with `mysql://` or `mysql2://`. Do not reveal value. |
| `BETTER_AUTH_SECRET` | Present; length at least 32. |
| `BETTER_AUTH_URL` | Present; expected public origin is `https://ttb-test.com`. |
| `LABEL_LENS_INTEGRITY_SECRET` | Present; length at least 32; stable from before #161 if historical verification matters. |
| `LABEL_LENS_APPEND_SIGNING_KEY` | Present; length at least 32. |
| `LABEL_LENS_STORAGE_DIR` | Present and private/writable for persisted panel assets before finalization verification. Do not reveal path. |
| `LABEL_LENS_BUILD_COMMIT` | Present; should identify `c3dfb9428a3e189d938c3b63f8e22aac45c095fc` or current deployed descendant. This is not a secret. |
| `LABEL_LENS_DB_DIALECT` | Optional; if set, should be `mysql`. |
| `LABEL_LENS_BOOTSTRAP_ON_START` | Prefer absent after accounts exist. If `1`, all bootstrap email/password vars must be present. |
| `LABEL_LENS_BOOTSTRAP_*_EMAIL` | Required only when bootstrap flag is `1`; verify presence, not values. |
| `LABEL_LENS_BOOTSTRAP_*_PASSWORD` | Required only when bootstrap flag is `1`; length at least 12; do not reveal values. |

## 3. Deployment/start command

Click path:

```text
Hostinger hPanel
→ Websites
→ ttb-test.com
→ Manage
→ Web App
→ Build / deployment settings
→ Start command
```

Record only the command text and cwd/root. Safe expected values:

- source deployment: `npm run start`;
- direct Next command: `next start`;
- standalone deployment from repo root: `node .next/standalone/server.js`;
- copied standalone artifact root: `node server.js`.

Flag as suspicious:

- static hosting only;
- `npm run db:migrate` as start command;
- `npm run auth:bootstrap` as start command;
- `node server.js` from repository root.

## 4. Application process and restart status

Click path:

```text
Hostinger hPanel
→ Websites
→ ttb-test.com
→ Manage
→ Web App
→ Runtime / Application / Process status
```

Capture:

- process status;
- restart count;
- last start time;
- last exit code if shown;
- assigned port or proxy target if shown;
- whether stdout/stderr logs are enabled for this process.

Do not copy secrets or full private paths.

## 5. Database metadata through phpMyAdmin

Click path:

```text
Hostinger hPanel
→ Databases
→ Manage production MySQL database
→ phpMyAdmin
→ select the Label Lens database
→ SQL
```

Run only metadata queries from `commands.sh`.

Required checks:

1. `__drizzle_migrations` table exists.
2. `submission_revisions` table exists.
3. `__drizzle_migrations` has at least two rows after `0001`.
4. `submission_revisions.canonical_json` reports `mediumtext` and max length `16777215`.

Do not display:

- raw `canonical_json`;
- `integrity_signature`;
- user table rows;
- session rows;
- submitted declared values;
- panel storage keys;
- uploaded image bytes.

## 6. Safe endpoint probes after recovery

From a local terminal or Hostinger's safe HTTP test surface:

```bash
curl -i --max-time 30 https://ttb-test.com/api/health
curl -i --max-time 30 https://ttb-test.com/api/auth/get-session
curl -i --max-time 30 https://ttb-test.com/login
```

Expected:

- `/api/health` returns HTTP 200;
- health JSON reports `status:"ok"`;
- `appendSigningKeyConfigured` is `true`;
- auth/session endpoint no longer returns 503;
- login page no longer returns 503.

Only after those pass should synthetic finalization and agent-detail integrity verification resume.

## 7. Separate follow-up: Better Auth proxy/IP warning

Runtime logs now include a Better Auth warning that client IP cannot be determined behind the Hostinger proxy and rate limiting falls back to a shared per-path bucket.

Record this as a separate non-blocking follow-up. Do not change trusted-proxy, forwarded-header, or IP-header behavior inside Issue #162 unless that work is independently scoped and reviewed.
