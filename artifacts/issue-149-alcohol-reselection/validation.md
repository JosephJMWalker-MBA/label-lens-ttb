# Validation

## Decision evidence

- Baseline reproduction run 1: PASS, 115/115 exact serialized production responses, zero mismatches.
- Baseline reproduction run 2: PASS, 115/115 exact serialized production responses, zero mismatches.
- Baseline behavior after excluding measured timing/cost fields: byte-identical; SHA-256 `adb14e004e3e9f1a9bb7902e9b11c52b317c38b25f393a78f8e07fe17abfbe82`.
- Pre-treatment isolation gate: PASS, 9 files and 164 tests.
- Primary control: PASS, 115/115 parity, 50 evaluable.
- Primary treatment: PASS, 115/115 parity, 50 evaluable.
- Repeat control: PASS, 115/115 parity, 50 evaluable.
- Repeat treatment: PASS, 115/115 parity, 50 evaluable.
- The four governed arms above are the clean conformance run after the treatment
  seam was changed to hand the ordered pass array directly to
  `selectAlcoholObservation`. Earlier reports produced with a shallow array copy
  were superseded and were not used as decision evidence.
- All four arm behavior hashes: `60cffe421856168335f999362b5c68b94d2def05c5c8bea2e61fbeadfd9bf451`.
- OCR trace, Brand, Government Warning, and exact production-response set hashes match across all four arms.
- Control/treatment latency deltas: median +3.601396% (10% ceiling), p95
  +0.433759% (15% ceiling).
- Governed report reconciliation: PASS, 19/19 focused tests.
- All Issue #149 and OCR research experiment tests: PASS, 12 files and 117 tests.

## Static, unit, and integration validation

- `npm run format:check`: PASS.
- `npm run lint`: PASS, zero warnings/errors.
- `npm run typecheck`: PASS.
- `git diff --check`: PASS.
- `npm run docs:check`: PASS, zero new errors; three known baselined errors and 20 existing warnings were reported.
- Full `npm test` with loopback/process permission, immediately before the final
  evaluation-only direct-array handoff change: PASS, 164 files passed, 3 opt-in
  generator files skipped; 1,820 tests passed and 3 skipped.
- Sandboxed `npm test`: infrastructure-blocked in 55 local-VLM/process tests by `listen EPERM: operation not permitted 127.0.0.1`; 1,765 tests passed. The permissioned rerun above is the governing full-suite result.
- Exact-final-head focused tests: PASS, 19/19.
- Exact-final-head `npm run format:check`, `npm run lint`,
  `npm run typecheck`, and `git diff --check`: PASS.
- A second permissioned full-suite exact-final-head rerun was requested but could
  not be authorized because the approval system reported that the user had
  reached the usage limit. It was not bypassed. The final change was confined to
  the evaluation-only selector seam and was covered by the exact-final-head
  focused/static checks above.
- Exact-final-head `DATABASE_URL=file:.local/issue-149-alcohol-reselection.db npm run build`: PASS. Better Auth emitted existing missing-local-secret/base-URL warnings; compilation, type validation, page generation, and build completion succeeded.
- `DATABASE_URL=file:.local/issue-149-alcohol-reselection.db npx playwright test tests/e2e/package-preparation.spec.ts --project=chromium`, immediately before the final evaluation-only direct-array handoff change: PASS, 5/5.
- The first Playwright start without `DATABASE_URL` stopped before test execution; the required configured rerun passed.
- An exact-final-head browser rerun was not attempted after the approval usage
  limit blocked the full-suite rerun.

## Production and safety boundary

- `git diff -- src/pipeline src/app src/server src/lib`: empty.
- Frozen production hashes for extractor, recovery planner/preprocessing, Alcohol selector/parser, Warning selector, package route, manifest, and production parity fixture remain unchanged.
- The evaluation-only seam accepts only arm, primary `FieldSelection`, and the ordered already-collected pass array.
- No fixture, seller, checksum, layout, or expected-value truth is accepted by OCR or selection.
- No recovery trigger, pass, crop, rotation, preprocessing, scale, PSM, language, worker, parser, confidence threshold, reliability threshold, authority state, Brand behavior, Warning behavior, schema, persistence, UI, VLM, cloud OCR, seller hint, or unrelated runtime code changed.
- No production behavior is enabled.

## PR #195

Read-only post-validation check:

- state: OPEN, draft;
- base: `main`;
- head branch: `codex/issue-149-enable-brand-grouping`;
- head SHA: `79f628c2dd3d915325986a1e6c012fe12fe6ac15`;
- updated at: `2026-07-27T19:28:39Z`.

This exactly matches the pre-task identity. PR #195 was not modified, rebased, merged, closed, or used as a dependency.
