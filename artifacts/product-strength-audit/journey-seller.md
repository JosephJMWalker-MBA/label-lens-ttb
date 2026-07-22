# Seller journey

## End-to-end trace

| Step | What the seller can do | Evidence | Stop or friction |
| --- | --- | --- | --- |
| Discover | Choose among `/create`, `/review`, `/review/legacy`, `/learn`, and two unavailable intents | [`IntentHub.tsx`](../../src/features/home/IntentHub.tsx), [LIVE-01](limitations.md#live-observation-log) | The primary job is not obvious; four top-level tools look equally important. |
| Start package | Open `/review` without signing in; draft remains in browser | [`src/app/review/page.tsx`](../../src/app/review/page.tsx), [LIVE-03](limitations.md#live-observation-log) | Public demo persistence implications are not stated on the route. |
| Resolve panels | Upload front; explicitly upload or rule out back/additional panels | [`package-workflow.ts`](../../src/features/package-preparation/package-workflow.ts), [`package-preparation.spec.ts`](../../tests/e2e/package-preparation.spec.ts) | Good explicit absence semantics; front artwork is mandatory. |
| Mark evidence | For brand and alcohol, draw a region and type the seller value | [`package-profile.ts`](../../src/features/package-preparation/package-profile.ts), [`package-model.ts`](../../src/features/package-preparation/package-model.ts) | Seller has already performed the core visual identification and transcription before OCR helps. |
| Save and analyze | Save seller evidence, run machine analysis, see observations separately | [`src/app/api/package/analyze/route.ts`](../../src/app/api/package/analyze/route.ts), [`package-model.ts`](../../src/features/package-preparation/package-model.ts) | Weak OCR can create review/correction work; net benefit is unmeasured. |
| Resolve discrepancies | Acknowledge a discrepancy and retain seller authority; stale analysis is rejected | [`packageReadyForAgentReview`](../../src/features/package-preparation/package-model.ts), [`latestAnalysisIsCurrent`](../../src/features/package-preparation/package-model.ts) | Honest, but usefulness depends on how often machine output saves rather than adds work. |
| Export locally | Download local package artifacts | [`src/features/package-preparation`](../../src/features/package-preparation), [`package-preparation.spec.ts`](../../tests/e2e/package-preparation.spec.ts) | Local export is not the same as workflow completion. |
| Submit internally | Sign in as seller and finalize a durable revision with images, evidence, observations, and receipt | [`AgentReviewSubmissionDock.tsx`](../../src/features/package-preparation/AgentReviewSubmissionDock.tsx), [`finalize/route.ts`](../../src/app/api/package/submit/finalize/route.ts) | Finalization UI lacks a full browser E2E covering live seller-to-agent handoff; API behavior is well tested. |
| Check status | View ID, v1, and “Waiting for agent review” in `/seller` | [`src/app/seller/page.tsx`](../../src/app/seller/page.tsx), [LIVE-07](limitations.md#live-observation-log) | No submission detail, status event history, reviewer message, or next action. |
| Respond to review | — | [`src/lib/product-language.ts`](../../src/lib/product-language.ts) defines language for future states, but no seller detail/action route exists | **Hard stop:** seller cannot receive a specific change request, correct a submitted revision, or create revision 2. |

## Exact workflow stop

The seller workflow stops after submission status. A status vocabulary can say “Changes requested,” but the seller has no route to read the requested change and no API/UI to resubmit a new immutable revision. [`src/db/schema.ts`](../../src/db/schema.ts) can represent multiple revisions, while [`src/app/api/package/submit/finalize/route.ts`](../../src/app/api/package/submit/finalize/route.ts) always creates revision 1 and rejects an existing submission. That is a data-model foundation, not a product loop.

The deployed demo stopped earlier in the paired journey: the seller saw one waiting submission, but the agent could not open that record because stored integrity verification failed ([LIVE-07](limitations.md#live-observation-log), [LIVE-09](limitations.md#live-observation-log)). This was one dated observation with unknown cause, not proof that submissions generally fail integrity.

## Manual alternative

A seller can currently put front/back images in a shared folder and add brand/alcohol values plus screenshots/coordinates to a two-row worksheet, then email the reviewer. Label Lens is more structured and traceable, but until the reviewer can respond inside the system and total time is measured, it has not shown that the added annotation and analysis steps beat that baseline. See [usefulness-assessment.md](usefulness-assessment.md) and [#38](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/38).
