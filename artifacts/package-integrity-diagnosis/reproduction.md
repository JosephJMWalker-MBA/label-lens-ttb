# Reproduction

## Synthetic payload

The reproducer used a repository-owned synthetic seller package with one 1x1 PNG panel. To isolate `canonical_json`, the padding was placed in `applicationBuild`, which is part of the signed canonical envelope and is not copied into seller evidence or machine snapshot `TEXT` columns.

Test source: `src/app/api/package/submit/finalize/route.test.ts:578-603`.

## Pre-fix strict MySQL result

Schema state: original `submission_revisions.canonical_json` as MySQL `TEXT`.

SQL mode:

```text
ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION
```

Input canonical byte length: `83,532`, greater than `65,535`.

Observed boundary:

- `/api/package/submit/finalize` returned `500`.
- Bounded commit log showed `ER_DATA_TOO_LONG`, errno `1406`, SQL state `22001`.
- The transaction failed at insert before producing a readable waiting revision.

This proves that strict MySQL cannot store a valid canonical package beyond the `TEXT` ceiling.

## Pre-fix permissive MySQL result

Schema state: original `submission_revisions.canonical_json` as MySQL `TEXT`.

SQL mode:

```text
empty string
```

Observed boundary:

- `/api/package/submit/finalize` returned `200`.
- Stored `canonical_json` byte length was `65,535`.
- Stored signature character length was `67`.
- Stored signature version was `v1`.
- Verification of the stored canonical bytes and stored signature was `false`.

The permissive result can explain the deployed symptom shape: a waiting record can exist, but the agent read path fails closed with stored integrity failure. This was not established as the deployed root cause because production SQL mode and row metadata remain unknown.

## Post-fix strict MySQL result

Schema state: `submission_revisions.canonical_json` as MySQL `mediumtext`.

Observed result:

- Information schema reported `mediumtext` with maximum length `16,777,215`.
- The large canonical test passed under strict MySQL.
- Stored canonical byte length matched expected byte length.
- Stored canonical digest matched expected digest.
- Stored signature verified.

Migration source: `src/db/migrations/0001_tiny_marauders.sql:1`.

## Existing-row migration result

The upgrade-path regression created the `0000` MySQL schema with `canonical_json` as `TEXT`, inserted a valid signed row below the `TEXT` ceiling, verified it opened through `buildSubmissionDetail`, applied `0001_tiny_marauders.sql`, and proved:

- stored canonical bytes were byte-for-byte unchanged;
- stored signature was byte-for-byte unchanged;
- the same revision still opened through `buildSubmissionDetail`;
- a deliberately truncated post-migration row still returned `integrity_failed`.

Evidence: `src/server/migrate.test.ts`.

## First failing boundary

The first reproduced failing boundary was database storage of signed canonical revision bytes, not canonicalization, HMAC verification, agent detail rendering, panel authorization, or idempotency.

`MEDIUMTEXT` prevents future MySQL `TEXT` truncation. It cannot reconstruct an already truncated canonical JSON value, does not authorize resigning or silently repairing one, and does not change the fail-closed result for invalid historical rows. The previously failing deployed record was not modified by this work and must continue to fail closed until separately adjudicated.
