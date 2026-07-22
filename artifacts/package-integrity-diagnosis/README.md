# Package Integrity Diagnosis

Issue: [#160](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/160)

Base audited SHA: `8ee6fe40a3ba1cee4bc81a09a6b6ff6e03537cd3`

## Executive result

The current production write/read code signs and verifies exact canonical revision bytes. A stable configured integrity secret survives module-state recreation, and valid synthetic packages open through the real agent detail and authorized panel route on SQLite and MySQL.

The locally reproduced failing boundary is MySQL storage capacity for `submission_revisions.canonical_json` on the committed `0000` schema. A valid synthetic canonical package larger than MySQL `TEXT` behaves two ways:

- Strict MySQL rejects the transaction at insert with `ER_DATA_TOO_LONG`, so no readable waiting revision is committed.
- Permissive MySQL commits a truncated `canonical_json` value at 65,535 bytes while the `v1` signature survives, causing verification to fail on read.

The permissive-mode shape can explain the observed deployed symptom, but the exact deployed record remains unattributed because the diagnosis did not have deployment SQL mode, stored row metadata, deployed build identity, migration table state, logs, or signing-key history.

`src/lib/integrity.ts` has no remaining diff. The HMAC production path is intentionally unchanged.

## Implemented correction

Necessary fix:

- Change MySQL `submission_revisions.canonical_json` from `text` to `mediumtext`.
- Add committed migration `0001_tiny_marauders.sql`.
- Add strict/permissive reproduction and regression coverage.
- Add an upgrade-path test proving an existing valid `TEXT` row remains byte-for-byte valid after `0001`.

Defense in depth:

- Bound finalize commit error logging so raw package payloads and full signatures are not emitted.
- Require the e2e seed path to have an explicit configured integrity secret before DB side effects.

Preserved invariants: fail-closed revision verification, OCR behavior, deterministic rules, evidence semantics, seller ownership, agent authorization, idempotency, status history, and panel integrity.

## Artifact index

- [question.md](question.md)
- [code-path.md](code-path.md)
- [insertion-path-inventory.md](insertion-path-inventory.md)
- [hypothesis-matrix.md](hypothesis-matrix.md)
- [reproduction.md](reproduction.md)
- [storage-roundtrip.md](storage-roundtrip.md)
- [deployment-observation.md](deployment-observation.md)
- [decision.md](decision.md)
- [limitations.md](limitations.md)
- [commands.sh](commands.sh)
- [git-sha.txt](git-sha.txt)
