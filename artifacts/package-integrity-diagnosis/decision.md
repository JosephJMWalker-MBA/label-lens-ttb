# Decision

## Decision

Treat the locally reproduced defect as attributed and fixed for future writes:

> MySQL `TEXT` was too small for immutable signed canonical package revisions. Widen `submission_revisions.canonical_json` to `mediumtext`, preserve fail-closed verification, and prevent no-secret seed writes.

## Necessary correction

- `src/db/schema.ts`: change only MySQL `submission_revisions.canonical_json` from `text` to `mediumtext`.
- `src/db/migrations/0001_tiny_marauders.sql`: apply the one-column migration.
- Tests: add restart/detail/panel lifecycle, large-canonical MySQL storage round trip, strict/permissive reproduction coverage, and an existing-row upgrade-path preservation test.

## Defense in depth

- `src/app/api/package/submit/finalize/route.ts`: bound commit-error logging so database failures do not dump raw package values or complete signatures.
- `scripts/e2e-seed.ts`: require a stable configured integrity secret before e2e seed DB side effects.
- `src/lib/integrity.ts`: no retained diff. The production signing/verifying path is unchanged.

## Not done

- No verifier bypass.
- No silent resigning.
- No production secret rotation.
- No historical row repair.
- No historical row automatic validity marking.
- No live data modification.
- No semantic schema expansion.
- No OCR, navigation, or agent workflow work.

## Operational note

After deployment, a synthetic live package should be finalized and opened through the agent route to prove the deployed database has applied `0001` and can preserve canonical bytes. The previously failing row should still be treated as historical evidence, not as automatically repaired.

`MEDIUMTEXT` prevents future truncation of canonical revision bytes. It cannot reconstruct an already truncated historical `canonical_json` value, and existing invalid rows continue returning `integrity_failed`. The previously failing deployed record is not modified by this PR.
