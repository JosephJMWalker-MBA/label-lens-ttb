# Question

## Observation boundary

The merged product-strength audit recorded one deployed waiting submission that appeared in the agent queue but could not be opened because stored revision integrity verification failed. The observation is intentionally narrow: one deployed waiting submission observed on 2026-07-21/22 failed closed at the agent detail boundary. It does not prove a general integrity-design, database, storage, migration, or deployment failure.

Committed source: `artifacts/product-strength-audit/limitations.md:5-9` and `artifacts/product-strength-audit/limitations.md:27-31`.

## Diagnostic question

Using repository-owned synthetic data only, where does a valid seller package first stop verifying across this lifecycle?

```text
build package
-> canonicalize
-> sign
-> finalize
-> transaction commit
-> stored row
-> process/module restart
-> read
-> verify
-> agent detail opens
```

## Success gate used

This work targeted the "attributed and fixed" Issue #160 gate:

- reproduce one exact cause locally;
- identify the first failing boundary;
- implement the smallest correction;
- cover it with regression tests;
- prove a newly finalized synthetic package opens after the relevant restart lifecycle;
- preserve fail-closed behavior.

## Non-goals preserved

No agent-decision workflow, seller resubmission loop, navigation redesign, OCR change, rule change, semantic schema expansion, TTB/COLA integration, verifier bypass, historical resigning, production secret rotation, or live data mutation was performed.
