# Runtime verification plan

Runtime recovery has been verified after the controlled bootstrap configuration change.

## Gate 1 — dynamic runtime

Expected:

- `GET /api/health` returns HTTP 200.
- Body contains `status:"ok"` and `service:"label-lens-ttb"`.
- `appendSigningKeyConfigured` is `true` for production readiness.

Observed: passed. `/api/health` returned HTTP 200 and `appendSigningKeyConfigured:true`.

## Gate 2 — auth runtime

Expected:

- anonymous `GET /api/auth/get-session` returns a normal no-session response, not 503;
- `/login` renders dynamically;
- public demo accounts can sign in;
- seller cannot access `/agent`;
- anonymous cannot access `/seller`, `/agent`, or agent APIs;
- agent can access `/agent` and agent queue.

Do not expose session cookies or browser storage.

Observed:

| Check | Result |
|---|---|
| Seller login | Passed: sign-in HTTP 200, session endpoint HTTP 200. |
| Seller `/seller` access | Passed: HTTP 200. |
| Seller agent queue API | Blocked: HTTP 403. |
| Agent login | Passed: sign-in HTTP 200, session endpoint HTTP 200. |
| Agent queue API | Passed: HTTP 200. |
| Admin login | Passed: sign-in HTTP 200, session endpoint HTTP 200. |
| Admin `/admin` access | Passed: HTTP 200. |
| Admin agent queue API | Passed: HTTP 200. |

## Gate 3 — build identity

Expected:

- `LABEL_LENS_BUILD_COMMIT` is set to the deployed commit, or runtime provenance otherwise records an approved commit identity.
- A fresh analysis/export records commit `c3dfb9428a3e189d938c3b63f8e22aac45c095fc` or a descendant.

`/api/health` does not expose build identity in current source, so build identity must be checked through an approved bounded provenance surface or Hostinger deployment metadata.

Observed: Hostinger deployment metadata confirms `c3dfb942` for the recovered deploy. Live synthetic analysis/finalization was run after recovery; build identity inside that package was not exposed in this artifact.

## Gate 4 — restart/redeploy stability

Expected:

- after one Hostinger restart or redeploy, `/api/health` returns 200 again;
- startup logs show migrations applied idempotently;
- auth still works;
- no bootstrap password reset occurs unless explicitly requested.

Observed: recovered logs show bootstrap disabled. The maintainer-triggered controlled redeploy/restart recovered the runtime. Codex did not directly initiate a deployment.

## Abort conditions

Stop and do not proceed to integrity verification if:

- `/api/health` is 503 or timeout;
- startup logs show migration/bootstrap failure;
- auth/session endpoint is 503;
- required production secrets are absent/short;
- storage is not configured for persisted panel assets.
