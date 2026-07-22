# Correction

## Code defect status

No code defect is independently proven or changed for Issue #162.

The repository already contains:

- a valid production start path through `npm run start` / `next start`;
- Next standalone output enabled;
- explicit migration artifact tracing;
- deterministic migration directory resolution for source and standalone layouts;
- fail-closed migration/bootstrap startup orchestration;
- Node 22 configuration;
- a lightweight dynamic health route.

The controlled recovery experiment attributes the first failing boundary to the bootstrap-enabled startup path. The exact bootstrap exception remains unknown because the failed run did not preserve usable runtime logs.

## Applied configuration correction

Codex did not directly change production configuration or initiate a deployment. The maintainer changed only:

```text
LABEL_LENS_BOOTSTRAP_ON_START=1
```

to:

```text
LABEL_LENS_BOOTSTRAP_ON_START=0
```

and redeployed/restarted Hostinger.

All other observed conditions remained unchanged. The runtime recovered. Because one credential-backed admin, agent, and seller account already exists, leave bootstrap disabled.

## Smallest correction by confirmed boundary

| Confirmed boundary | Smallest correction |
|---|---|
| Wrong start command | Set Hostinger start command to `npm run start` for source deployment. Use `node .next/standalone/server.js` only when Hostinger is explicitly launching the standalone artifact. |
| Static-only hosting path | Reconfigure as persistent Node web app using the Next.js framework preset and Node 22.x. |
| Missing `DATABASE_URL` | Add the production MySQL URL in Hostinger env. Verify presence only; do not expose the value. Redeploy. |
| Wrong DB dialect | Ensure `DATABASE_URL` begins with `mysql://` or `mysql2://`; set `LABEL_LENS_DB_DIALECT=mysql` only if URL sniffing is ambiguous. Rebuild/redeploy. |
| DB connectivity failure | Correct Hostinger database credentials/network/database existence. Do not alter schema manually. |
| Migration artifact missing | First inspect build artifact/logs. If artifact lacks `src/db/migrations/meta/_journal.json` despite source config, either correct artifact packaging or set `LABEL_LENS_MIGRATIONS_DIR` to the actual packaged migrations directory. |
| Migration `0001` failure | Keep fail-closed behavior. Use migration logs and metadata-only DB checks to identify the exact SQL/permission issue. Apply only the needed DB/config fix. |
| Bootstrap failure | If accounts already exist, remove or set `LABEL_LENS_BOOTSTRAP_ON_START=0`. If bootstrap is needed in a separate maintenance window, provide all bootstrap email/password variables with passwords at least 12 characters. Do not reset passwords unless explicitly intended. |
| Missing/short append key | Set `LABEL_LENS_APPEND_SIGNING_KEY` to a stable value at least 32 chars; redeploy. This should not be the sole reason `/api/health` is 503. |
| Missing/short integrity secret | Restore the stable `LABEL_LENS_INTEGRITY_SECRET` at least 32 chars. Do not rotate while diagnosing historical records. |
| Missing storage dir | Configure `LABEL_LENS_STORAGE_DIR` to a private writable server path before finalize verification. This is not a health-startup blocker, but it is required for production finalization. |
| Port/proxy mismatch | Configure Hostinger process/proxy to target the platform `PORT`; for standalone launch, ensure host binding is externally reachable. |
| Logs unattached | Use Hostinger deployment/build/process logs or support channel to find the actual process stdout/stderr source. Do not add speculative application logging yet. |

## Proposed next action

Keep bootstrap disabled and complete/record the remaining integrity gate. Track the Better Auth proxy/IP warning as a separate follow-up issue; do not change trusted proxy behavior here.
