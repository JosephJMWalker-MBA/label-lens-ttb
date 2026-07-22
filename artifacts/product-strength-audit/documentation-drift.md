# Documentation drift

## Material mismatches

| Document | Documented model | Current implementation | Risk |
| --- | --- | --- | --- |
| [`docs/architecture.md`](../../docs/architecture.md) | Stateless one-image `/api/analyze-label`, AI vision/fuzzy comparison, planned file tree, no auth/database/image persistence | Tesseract/local extraction, `/api/precheck` and package routes, Better Auth, MySQL, persistent panel bytes, seller/agent portals | A new maintainer can make architecture decisions against a product that no longer exists. |
| [`docs/product-plan.md`](../../docs/product-plan.md) | Primary user is an agent; avoid auth/persistence; one-image AI MVP; success includes reviewer belief/builder demonstration | Seller-led package and authenticated persistence are the strongest current slice | Confuses portfolio narrative with product strategy and user value. |
| [`docs/remaining-work-plan.md`](../../docs/remaining-work-plan.md) | One-image/local baseline and persistence as future work; prioritizes field expansion | Multi-panel persistence exists; agent decisions/resubmission and usefulness are the actual gaps | Directs work toward breadth before completion. |
| [`ADR-0012`](../../docs/adr/0012-panel-asset-storage.md) (`Proposed`) | Cloudflare R2, 10 MB/6 panels, demo prefixes, cleanup cron, `/api/package/panel/[panelId]/image` | Configured filesystem, 15 MB per image, authenticated agent panel route, no cleanup | Security/operations assumptions are false if read as accepted architecture. |
| [`ADR-0013`](../../docs/adr/0013-immutable-revisions-and-snapshot-provenance.md) (`Proposed`) | Every resubmission creates a new immutable revision | Finalize hard-codes revision 1 and rejects an existing submission | Makes the missing resubmission loop appear implemented. |
| [`ADR-0014`](../../docs/adr/0014-state-transitions-concurrency-and-idempotency.md) (`Proposed`) | Transition guards, claim concurrency, mutative endpoint idempotency, idempotency purge | Only package finalization has the implemented idempotency slice; no agent mutation routes | Overstates decision/claim readiness. |
| [`ADR-0015`](../../docs/adr/0015-demo-isolation-and-resettable-seeds.md) (`Proposed`) | Fixed demo UUIDs, reset endpoint, explicit demo queue semantics | No reset route; finalizer writes `isDemo=false`; live demo filter empty while public seller record appeared in waiting | Creates false confidence in demo safety and repeatability. |
| [`README.md`](../../README.md) | Internal agent/government transmission listed out of scope | Internal agent transmission is implemented; government transmission remains out | Top-level boundary is partially stale. |
| [`docs/original-vision-and-scope.md`](../../docs/original-vision-and-scope.md) | Clearly marked historical, but contains a “Current Status” section about moving into implementation | Product has moved well beyond it | Header reduces risk, but embedded “current” language is still easy to quote incorrectly. |

## What remains authoritative

- Current route/source behavior and tests.
- [`README.md`](../../README.md) for the narrow machine fields, separation doctrine, public account warning, and deferred agent writes, subject to the internal-transmission wording noted above.
- [`docs/extraction-full-corpus/extractor-report.md`](../../docs/extraction-full-corpus/extractor-report.md) for current committed machine-reading measurements.
- [`docs/compliance-readiness-boundary.md`](../../docs/compliance-readiness-boundary.md) and [`docs/validation-rules.md`](../../docs/validation-rules.md) for bounded rule/authority semantics.
- Open issues [#38](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/38), [#57](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/57), [#125](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/125), [#136](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/136), and [#17](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/17) for unresolved gaps.

## Maintainability impact

The source has clean boundaries and extensive tests, but the repository’s conceptual surface is much larger than the product: multiple route generations, compatibility behavior, many research artifacts, proposed ADRs that read as decisions, and old plan documents. This increases onboarding and change risk even without code-quality defects. The absence of a browser E2E from package finalization through agent detail is especially material because the live deployment failed exactly at that cross-boundary value moment. Evidence: [`tests/e2e/package-preparation.spec.ts`](../../tests/e2e/package-preparation.spec.ts), [`tests/e2e/auth-portal.spec.ts`](../../tests/e2e/auth-portal.spec.ts), and [LIVE-09](limitations.md#live-observation-log).

## Recommendation

Do not rewrite repository-wide documentation during this audit. Open a focused “current architecture truth map” issue: name authoritative current docs, mark superseded plans, change ADR statuses only with evidence, and add one diagram of the implemented seller/package/agent path plus explicit missing mutations. Documentation should follow the product-narrowing decision, not precede it.
