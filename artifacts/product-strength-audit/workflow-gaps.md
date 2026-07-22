# Workflow gaps

## The core break

```text
Seller prepares package
  → revision 1 is finalized
  → seller sees waiting status
  → agent sees queue row
  → agent reads package (when integrity passes)
  ✕ no claim
  ✕ no internal decision
  ✕ no change request
  ✕ no seller correction of submitted revision
  ✕ no revision 2
  ✕ no completion event produced by an agent action
```

Evidence: [`src/app/api/package/submit/finalize/route.ts`](../../src/app/api/package/submit/finalize/route.ts), [`src/app/seller/page.tsx`](../../src/app/seller/page.tsx), [`src/app/agent/page.tsx`](../../src/app/agent/page.tsx), and the GET-only [`src/app/api/agent`](../../src/app/api/agent) directory.

## Gap register

| Gap | User consequence | Current evidence | Confidence |
| --- | --- | --- | --- |
| Agent action model absent | Agent cannot complete the review job | No claim/decision/change-request API, UI, or database table; [`0014`](../../docs/adr/0014-state-transitions-concurrency-and-idempotency.md) is still proposed | High |
| Seller response model absent | “Changes requested” cannot become corrected work | Thin [`/seller`](../../src/app/seller/page.tsx); finalize route creates only v1 | High |
| Revision comparison absent | Agent cannot know what changed | Schema supports revisions, workflow does not; [`0013`](../../docs/adr/0013-immutable-revisions-and-snapshot-provenance.md) overstates current behavior | High |
| Live handoff confidence not demonstrated | One deployed waiting submission observed during the audit failed stored-integrity verification [LIVE-09](limitations.md#live-observation-log) | P0 diagnosis is required before feature work; the observation does not prove a general design or persistence failure | High for the dated observation; cause and generality unknown |
| Demo isolation mismatch | Public activity can contaminate the “real” queue | Finalizer writes `isDemo=false`; [`queries.ts`](../../src/server/submissions/queries.ts) trusts that flag; live waiting=1/demo=0 [LIVE-08](limitations.md#live-observation-log), [LIVE-10](limitations.md#live-observation-log) | High |
| No retention/deletion/reset | Shared users can leave persistent artwork without lifecycle control | [`panel-storage.ts`](../../src/lib/panel-storage.ts), [#17](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/17), missing ADR-0015 reset route | High |
| Package finalize UI not covered end-to-end | API tests may not catch actual browser handoff failure | [`route.test.ts`](../../src/app/api/package/submit/finalize/route.test.ts) is strong; [`package-preparation.spec.ts`](../../tests/e2e/package-preparation.spec.ts) stops at local export; no `AgentReviewSubmissionDock` test | High |
| Legacy and package review do not converge | Seller decisions/dispositions in legacy do not enter portal | [`src/app/review/legacy/page.tsx`](../../src/app/review/legacy/page.tsx), [`src/app/api/precheck/disposition/route.ts`](../../src/app/api/precheck/disposition/route.ts), package routes | High |
| Create does not feed review | Eight facts/scaffold are a dead-end relative to the primary case | [`CreateWorkspace.tsx`](../../src/features/create/CreateWorkspace.tsx), [`src/app/review/page.tsx`](../../src/app/review/page.tsx) | High |
| Usefulness instrumentation absent | Cannot decide whether annotation/OCR helps | [#38](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/38) remains open | High |
| Real-image deployed pre-check confidence open | Bundled sample success cannot prove ordinary uploads work | [#125](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/125), [LIVE-06](limitations.md#live-observation-log) | High |

## Required minimum loop

The smallest complete loop is: agent records one of `internally_accepted` or `changes_requested` with a structured reason and optional note; seller can read that event; for changes, seller creates an immutable revision 2 from revision 1; agent sees a provenance-preserving diff and records the next decision. It should not include official TTB transmission. The existing status vocabulary and revision schema can support this direction, but they are not evidence that the behavior exists. Evidence: [`src/lib/product-language.ts`](../../src/lib/product-language.ts), [`src/db/schema.ts`](../../src/db/schema.ts), and [`README.md`](../../README.md).

## Stop adding breadth

Issues for more fields or label-maker assistance should not outrun this loop. [Issue #142](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/142) already marks its label-maker improvements as deferred. The same discipline should apply to field expansion and official-integration ideas: neither substitutes for a completed human workflow or proven time advantage.
