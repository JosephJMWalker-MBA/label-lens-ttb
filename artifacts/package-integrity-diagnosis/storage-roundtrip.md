# Storage Round Trip

## Normal route lifecycle

The route lifecycle test covers:

- finalize through the real route;
- transaction commit;
- read stored revision row;
- reset imported modules;
- reinitialize the database client;
- read through `buildSubmissionDetail`;
- verify `integrityVerified=true`;
- stream the authorized panel asset through the agent panel route.

Evidence: `src/app/api/package/submit/finalize/route.test.ts:526-575`.

## Byte checks

The large-canonical test covers:

- canonical byte length greater than the old MySQL `TEXT` ceiling;
- successful finalize after the migration;
- stored canonical byte length equals expected byte length;
- stored canonical digest equals expected digest;
- stored signature verifies against the stored canonical bytes.

Evidence: `src/app/api/package/submit/finalize/route.test.ts:578-603`.

## Why this preserves integrity

The correction does not change canonicalization, HMAC signing, verification, read reconstruction, or agent detail behavior. It changes only the MySQL storage capacity for the immutable canonical revision string.

Fail-closed behavior remains in `src/server/submissions/detail.ts:130-133`.

## Historical rows

Rows that were already truncated cannot be repaired from the stored row alone. Repair would require the original canonical bytes and signing-key continuity. This work does not silently resign or bypass any historical record.

Existing invalid rows continue returning `integrity_failed`. The MySQL upgrade-path regression proves this by deliberately truncating a post-migration synthetic row and observing fail-closed agent detail behavior.

## Size contract

- Current synthetic large-canonical observation: `83,532` bytes.
- Old MySQL `TEXT` maximum: `65,535` bytes.
- New MySQL `MEDIUMTEXT` maximum reported by information schema: `16,777,215`.
- The finalize route has per-panel byte and dimension bounds: `MAX_PANEL_BYTES = 15 * 1024 * 1024` and `MAX_PANEL_DIMENSION = 20000`.
- The submitted package parser validates structure and some string presence/lengths, but does not impose a single canonical JSON byte ceiling below `MEDIUMTEXT`.
- The multipart/request ceiling is therefore governed by the hosting/runtime boundary and panel limits, not a dedicated canonical-metadata limit in current source.

No arbitrary new canonical JSON limit was added in this issue. `MEDIUMTEXT` is larger than the old column and sufficient for the reproduced valid package, but it is not an unbounded submission contract.
