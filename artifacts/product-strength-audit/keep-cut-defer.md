# Keep / cut / defer

“Hide” means remove from the default journey after confirming navigation and migration evidence. It does not instruct deletion.

## KEEP PRIMARY

| Capability | Reason and evidence |
| --- | --- |
| `/review` package preparation | This is the strongest coherent seller path. [`src/app/review/page.tsx`](../../src/app/review/page.tsx), [`package-preparation.spec.ts`](../../tests/e2e/package-preparation.spec.ts) |
| Durable package handoff | Ownership, checksums, integrity, idempotency, and revision foundations are product assets; the one dated live failure requires P0 attribution before feature work but does not invalidate the design generally. [`finalize/route.ts`](../../src/app/api/package/submit/finalize/route.ts), [LIVE-09](limitations.md#live-observation-log) |
| Seller/machine separation | Keep as a constitutional boundary. [`package-model.ts`](../../src/features/package-preparation/package-model.ts), [LIVE-06](limitations.md#live-observation-log) |
| Deterministic checks and honest abstention | Explicit absence, `NEEDS_REVIEW`, `not_run`, and no aggregate verdict preserve authority. [`package-workflow.ts`](../../src/features/package-preparation/package-workflow.ts), [`src/app/learn/page.tsx`](../../src/app/learn/page.tsx) |
| Provenance | Immutable source/version/evidence relationships are a core advantage over loose files. [`src/db/schema.ts`](../../src/db/schema.ts), [`src/server/submissions/detail.ts`](../../src/server/submissions/detail.ts) |
| Agent package read model | Keep and complete with decision/change-request actions after P0 diagnosis. [`detail.ts`](../../src/server/submissions/detail.ts), [`src/app/agent/submissions/[id]/page.tsx`](../../src/app/agent/submissions/%5Bid%5D/page.tsx) |

## KEEP SUPPORTING

| Capability | Reason and evidence |
| --- | --- |
| `/learn` | Contextual help for the package workflow, not a peer product destination. [`src/app/learn/page.tsx`](../../src/app/learn/page.tsx) |
| Governed evaluation corpus | Internal quality infrastructure, not end-user value by itself. [`brand metrics`](../brand-evidence-path-diagnosis/metrics.md), [`alcohol baseline`](../alcohol-digit-ocr-diagnosis/summary.md) |
| Research diagnostics | Preserve falsifiable experiments and failure taxonomy as internal product infrastructure. [#149](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/149), [`alcohol-digit-ocr-diagnosis`](../alcohol-digit-ocr-diagnosis/README.md) |

## HIDE FROM DEFAULT JOURNEY

| Surface/claim | Reason and evidence |
| --- | --- |
| `/create` | It is a disconnected, unmeasured scaffold and permits an empty export path. [`CreateWorkspace.tsx`](../../src/features/create/CreateWorkspace.tsx), [LIVE-02](limitations.md#live-observation-log) |
| `/review/legacy` | It is a diagnostic/demo/legacy path that duplicates review concepts but does not enter the primary case. [`src/app/review/legacy/page.tsx`](../../src/app/review/legacy/page.tsx) |
| Unavailable intent cards | “Improve a draft” and “find professional help” advertise roadmap rather than current value. [`IntentHub.tsx`](../../src/features/home/IntentHub.tsx) |
| Research-first/OCR-first messaging | Current aggregate alcohol performance is 68.0% detection and 66.0% parsed accuracy; operator usefulness remains unmeasured. [`alcohol baseline`](../alcohol-digit-ocr-diagnosis/summary.md), [#38](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/38) |
| Unreachable queue/status language | “Begin review,” changes requested, and completed imply a workflow not implemented. [`src/lib/product-language.ts`](../../src/lib/product-language.ts), [`src/app/agent/page.tsx`](../../src/app/agent/page.tsx) |

## DO NOT DELETE YET

Retain `/create`, `/review/legacy`, `/learn`, and their underlying contracts until the narrowed navigation is approved, direct-access dependencies are inventoried, and migration evidence exists. Hiding a secondary surface is reversible; deleting it before observing dependencies is not. Evidence: [`IntentHub.tsx`](../../src/features/home/IntentHub.tsx), [#142](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/142).

## Defer

| Work | Defer until | Evidence / rationale |
| --- | --- | --- |
| New fields or warning-language insertion | Completed loop plus measured usefulness | [#142](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/142) already defers label-maker expansion; breadth cannot fix workflow value. |
| Beer, spirits, and broader category support | Domestic-wine workflow proves value | [`src/app/learn/page.tsx`](../../src/app/learn/page.tsx) accurately states no profiles exist. |
| OCR-provider/model expansion | Paired study identifies a bounded beneficial role | Current alcohol accuracy is better than the superseded #57 aggregate but still cannot carry the product promise. [`alcohol baseline`](../alcohol-digit-ocr-diagnosis/summary.md), [#38](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/38), [#149](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/149) |
| Official TTB integration | A complete internal human workflow is useful and operationally governed | Integration is not a substitute for user value and is outside current authority. [`README.md`](../../README.md) |
| Multi-tenant/commercial expansion | Demo isolation, retention, deletion, backup, account operations, and pilot value are proven | [#17](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/17), [security-operations.md](security-operations.md) |

## Summary

Keep the evidence package, evidence boundaries, and internal review read model as primary. Keep learning and research evidence as supporting infrastructure. Hide secondary tools and research-first messaging from the default journey without deleting them yet. Defer breadth and integration. The product should become smaller before it becomes larger.
