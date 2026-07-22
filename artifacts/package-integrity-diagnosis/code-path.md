# Code Path

## Integrity primitive

`src/lib/integrity.ts`

- Version: `v1`.
- Secret source: `LABEL_LENS_INTEGRITY_SECRET`.
- Production without a configured 32+ character secret throws before signing or verifying.
- Non-production with an explicit secret uses that secret.
- Non-production without an explicit secret uses a process-local global development secret.
- `signRevision(canonicalJson)` signs the exact passed string with HMAC-SHA256 and returns `v1:<64 hex chars>`.
- `verifyRevision(canonicalJson, signature)` verifies the exact stored string and signature.
- There is no retained source diff in this file for Issue #160. The HMAC algorithm, version format, exact canonical-string input, production missing/short-secret behavior, and timing-safe verifier path remain unchanged.

## Finalize write path

`src/app/api/package/submit/finalize/route.ts:333-349`, `src/app/api/package/submit/finalize/route.ts:392-538`

- The route computes one `canonicalString`.
- It signs that exact string as `signature`.
- Both SQLite and MySQL transaction branches insert `canonicalJson: canonicalString` and `integritySignature: signature`.
- The same transaction writes the submission, revision, panel rows, seller evidence snapshot, machine analysis snapshot, status event, and idempotency record.
- Idempotency returns a committed receipt only when the request hash matches.

## Finalize error boundary

`src/app/api/package/submit/finalize/route.ts:591-637`

- Duplicate conflicts preserve the existing idempotency behavior.
- Non-duplicate commit failures now log only a bounded cause chain containing name, code, errno, and SQL state.
- The raw driver error object is not logged from this catch path, which avoids emitting canonical package JSON or complete signatures.

## Agent read path

`src/server/submissions/detail.ts:111-133`

- Agent detail reads the latest revision row.
- It verifies the exact stored `canonicalJson` and `integritySignature`.
- If verification fails, it returns `integrity_failed` before building the review view.

## Authorized panel streaming

`src/app/api/agent/submissions/[id]/panels/[panelId]/route.ts:22-60`

- Panel bytes are agent/admin only.
- Submission and panel identifiers are validated.
- The route confirms the panel belongs to the requested submission before resolving storage.
- It streams bytes with `nosniff` and `private, no-store`.

## MySQL schema and startup migration

`src/db/schema.ts:91-109`

- MySQL now stores `submission_revisions.canonical_json` as `mediumtext`.
- `integrity_signature` remains `varchar(255)`.

`src/db/migrations/0001_tiny_marauders.sql:1`

- The migration modifies only `submission_revisions.canonical_json`.

`src/server/migrate.ts:88-109`, `src/server/startup.test.ts:174-238`, `src/server/migrate.test.ts`

- Startup applies committed MySQL migrations before serving.
- The MySQL startup integration test proves migration is idempotent and startup remains gated behind migration and bootstrap.
- The MySQL upgrade-path test applies `0000`, inserts a valid signed row below the `TEXT` ceiling, opens it, applies `0001`, proves canonical bytes and signature are unchanged, opens it again, then proves deliberate post-migration truncation still returns `integrity_failed`.
