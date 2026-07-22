# Trust-language audit

## Language that earns trust

| Pattern | Why it is strong | Evidence |
| --- | --- | --- |
| “Preparation aid,” not approval/legal determination | Correctly limits authority | [`README.md`](../../README.md), [`src/app/review/page.tsx`](../../src/app/review/page.tsx), [LIVE-03](limitations.md#live-observation-log) |
| No aggregate compliance verdict | Avoids converting partial checks into a false decision | [`README.md`](../../README.md), [LIVE-06](limitations.md#live-observation-log) |
| `PASS`, `NEEDS_REVIEW`, and `not_run` remain distinct | Preserves uncertainty and external evidence requirements | [`src/server/precheck-service.ts`](../../src/server/precheck-service.ts), [`src/app/learn/page.tsx`](../../src/app/learn/page.tsx), [LIVE-04](limitations.md#live-observation-log) |
| Seller and machine records remain separate | Makes disagreement inspectable | [`package-model.ts`](../../src/features/package-preparation/package-model.ts), [LIVE-06](limitations.md#live-observation-log) |
| Local export/internal queue boundary is explicit | Avoids implying TTB transmission | [`src/app/review/page.tsx`](../../src/app/review/page.tsx), [`AgentReviewSubmissionDock.tsx`](../../src/features/package-preparation/AgentReviewSubmissionDock.tsx) |
| Public sign-up is blocked and roles are explicit | Avoids pretending to be a public government service | [`src/app/api/auth/[...all]/route.ts`](../../src/app/api/auth/%5B...all%5D/route.ts), [`src/lib/auth.ts`](../../src/lib/auth.ts) |

## Language or presentation that erodes trust

| Problem | Why it matters | Evidence and recommendation |
| --- | --- | --- |
| Four active tools are presented as peers | Users cannot tell which is the product | [`IntentHub.tsx`](../../src/features/home/IntentHub.tsx), [LIVE-01](limitations.md#live-observation-log). Make “Prepare a package” primary; move learn to support and legacy/create to secondary access. |
| `/create` accepts an empty path and shows a scaffold with no cited requirements | “Create a new label” overstates the value of an empty placeholder export | [LIVE-02](limitations.md#live-observation-log), [`CreateWorkspace.tsx`](../../src/features/create/CreateWorkspace.tsx). Hide from primary navigation until it feeds the case or delivers tested value. |
| Queue says “Begin internal review” | It implies a state transition/claim that is only a detail link | [`src/app/agent/page.tsx`](../../src/app/agent/page.tsx), [LIVE-08](limitations.md#live-observation-log). Use “Open package” until an actual claim exists. |
| Status labels describe future behavior | `in_review`, `changes_requested`, and accepted/completed next actions look implemented | [`src/lib/product-language.ts`](../../src/lib/product-language.ts). Mark unavailable states as planned in internal docs; do not expose unreachable workflow promises. |
| README says “Agent or government transmission” is out of scope | Internal agent transmission now exists | [`README.md`](../../README.md) versus [`finalize/route.ts`](../../src/app/api/package/submit/finalize/route.ts). Change only in a future documentation-truth issue, not this audit. |
| Learn/create copy says nothing is stored | Unqualified product-level reading conflicts with durable package submission | [`src/app/learn/page.tsx`](../../src/app/learn/page.tsx), [`src/app/create/page.tsx`](../../src/app/create/page.tsx), [`src/app/review/page.tsx`](../../src/app/review/page.tsx). Scope every storage statement to that exact route. |
| Public demo warning lives mainly in README | Shared credentials and persisted artwork need an in-product warning before upload | [`README.md`](../../README.md), [LIVE-01](limitations.md#live-observation-log), [LIVE-03](limitations.md#live-observation-log). State shared access, persistence, and “use demo fixtures only” on login and upload. |
| “Demo” queue semantics are contradicted by actual shared-seller records | Users expect demo data isolation | [`queries.ts`](../../src/server/submissions/queries.ts), [LIVE-08](limitations.md#live-observation-log), [LIVE-10](limitations.md#live-observation-log). Classify public demo-originated submissions as demo or prevent durable public uploads. |

## Brand and alcohol claims

The UI accurately says only brand and alcohol are read, but it does not make current accuracy visible at the point of use. [`src/app/learn/page.tsx`](../../src/app/learn/page.tsx) explains what is checked. Current governed evidence reports brand normalized selection 29/105 (27.6%), alcohol detection 70/103 (68.0%), and alcohol parsed accuracy 68/103 (66.0%), with zero measured alcohol false certainty and zero absent-alcohol false positives. That improvement still does not make machine assistance an assumed benefit because operator outcomes are unmeasured. Evidence: [`brand metrics`](../brand-evidence-path-diagnosis/metrics.md), [`alcohol baseline`](../alcohol-digit-ocr-diagnosis/summary.md), and [#38](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/38). The product should disclose that users must verify observations; #57’s usefulness-gate intent remains relevant, but its 61%/57% aggregate is historical.

## Trust conclusion

The microcopy around authority is one of the product’s strongest assets. Product-level trust is weakened by navigation breadth, unreachable workflow labels, shared-demo persistence, and documents that describe a different architecture. Trust language cannot repair missing behavior; the first remedy is a narrower truthful product surface and a complete human loop.
