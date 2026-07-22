# Deployment Observation

## Live observation retained

The prior product audit observed one deployed waiting submission that could not be opened because stored revision integrity verification failed.

Evidence: `artifacts/product-strength-audit/limitations.md:27-31`.

The same audit explicitly preserved the scope as one dated observation and listed the cause as unknown because no deployment logs, signing-key history, stored-byte history, or migration history were available.

Evidence: `artifacts/product-strength-audit/limitations.md:5-9`.

## Current live access

This Issue #160 pass did not mutate or re-access live persisted submission data. The local reproduction used repository-owned synthetic records and a disposable MySQL database.

## What local evidence proves

Local MySQL with the original `TEXT` column can reproduce a committed waiting row whose stored signature format survives but stored canonical bytes are truncated and fail verification.

The permissive result can explain the deployed symptom shape if all of the following were true:

- the deployed row's canonical package exceeded the MySQL `TEXT` ceiling;
- deployed MySQL accepted truncation rather than rejecting the transaction;
- the deployed row was written before the `mediumtext` migration;
- the integrity secret remained otherwise stable enough for signature verification to reach the byte mismatch.

## What remains external

The exact deployed record cause remains unproven without:

- deployed SQL mode at write time;
- deployed `submission_revisions.canonical_json` column type at write time;
- stored canonical byte length or a bounded digest for the failing row;
- stored signature format metadata for the failing row;
- deployed migration table state;
- deployed build identity;
- signing-key continuity history;
- bounded production logs from the write and read events.

This artifact does not say this was the deployed root cause.
