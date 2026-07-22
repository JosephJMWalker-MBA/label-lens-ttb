# Capability inventory

## Current end-user capabilities

| Surface | Current capability | Connection to primary case | Assessment and evidence |
| --- | --- | --- | --- |
| `/` | Six-intent choice hub; four active, two unavailable | Navigation only | Broad framing obscures the primary journey. [`IntentHub.tsx`](../../src/features/home/IntentHub.tsx), [LIVE-01](limitations.md#live-observation-log) |
| `/create` | Session-local eight-fact summary, scaffold, export | None | Functional UI, but no durable case, review handoff, or demonstrated job advantage. [`CreateWorkspace.tsx`](../../src/features/create/CreateWorkspace.tsx), [`GuidedFacts.tsx`](../../src/features/create/GuidedFacts.tsx), [LIVE-02](limitations.md#live-observation-log) |
| `/review` | Multi-panel upload decisions; seller regions/values; package analysis; local drafts/exports; authenticated submission | Primary seller path | Strongest product core, but manual annotation precedes machine assistance. [`src/app/review/page.tsx`](../../src/app/review/page.tsx), [`package-workflow.ts`](../../src/features/package-preparation/package-workflow.ts), [LIVE-03](limitations.md#live-observation-log) |
| `/review/legacy` | One-image OCR, deterministic findings, seller confirmations, disposition, local downloads | Separate compatibility path | Useful diagnostic/demo, but duplicates concepts and does not enter the agent portal. [`src/app/review/legacy/page.tsx`](../../src/app/review/legacy/page.tsx), [LIVE-05](limitations.md#live-observation-log), [LIVE-06](limitations.md#live-observation-log) |
| `/learn` | Lists six checks, citations, evidence needs, and three honest `not_run` checks | Supporting | Accurate, bounded trust surface; not a journey. [`src/app/learn/page.tsx`](../../src/app/learn/page.tsx), [LIVE-04](limitations.md#live-observation-log) |
| `/seller` | Lists submission ID, revision, status | Primary portal | Status is too thin for follow-up: no detail, history, reviewer note, or action. [`src/app/seller/page.tsx`](../../src/app/seller/page.tsx), [LIVE-07](limitations.md#live-observation-log) |
| `/agent` | Filtered queue and detail links | Primary portal | Read-only queue; default separates demos only when `isDemo` is correctly set. [`src/app/agent/page.tsx`](../../src/app/agent/page.tsx), [`queries.ts`](../../src/server/submissions/queries.ts), [LIVE-08](limitations.md#live-observation-log) |
| `/agent/submissions/[id]` | Shows immutable revision, seller evidence, machine observations, panels, provenance, status history | Primary portal | Source is a credible review read model; no decision actions. One deployed waiting submission observed during the audit failed integrity for an unknown reason; this is not generalized. [`page.tsx`](../../src/app/agent/submissions/%5Bid%5D/page.tsx), [`detail.ts`](../../src/server/submissions/detail.ts), [LIVE-09](limitations.md#live-observation-log) |
| `/admin` | Links to queue and documents bootstrap command | Operations adjunct | No demo reset, record repair, retention, deletion, account, or incident controls. [`src/app/admin/page.tsx`](../../src/app/admin/page.tsx), [LIVE-11](limitations.md#live-observation-log) |

## Server capabilities

| Capability | Status | Evidence |
| --- | --- | --- |
| Single-image analysis | Implemented; current real-image deployment confidence remains open | [`src/app/api/precheck/route.ts`](../../src/app/api/precheck/route.ts), [`src/server/precheck-service.ts`](../../src/server/precheck-service.ts), [#125](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/125) |
| Package analysis | Implemented | [`src/app/api/package/analyze/route.ts`](../../src/app/api/package/analyze/route.ts), [`route.test.ts`](../../src/app/api/package/analyze/route.test.ts) |
| Package finalization | Seller-only, idempotent, integrity-checked, creates one immutable revision | [`src/app/api/package/submit/finalize/route.ts`](../../src/app/api/package/submit/finalize/route.ts), [`route.test.ts`](../../src/app/api/package/submit/finalize/route.test.ts) |
| Seller status read | Owner-only status and event read | [`src/app/api/package/submit/status/[id]/route.ts`](../../src/app/api/package/submit/status/%5Bid%5D/route.ts), [`src/server/submissions/access.ts`](../../src/server/submissions/access.ts) |
| Agent queue/detail/panel reads | Agent/admin-only GET routes | [`src/app/api/agent/submissions/route.ts`](../../src/app/api/agent/submissions/route.ts), [`src/app/api/agent/submissions/[id]/route.ts`](../../src/app/api/agent/submissions/%5Bid%5D/route.ts), [`src/app/api/agent/submissions/[id]/panels/[panelId]/route.ts`](../../src/app/api/agent/submissions/%5Bid%5D/panels/%5BpanelId%5D/route.ts) |
| Agent decisions/claims/change requests | Not implemented | No non-GET route exists under [`src/app/api/agent`](../../src/app/api/agent); [`auth-portal.spec.ts`](../../tests/e2e/auth-portal.spec.ts) only verifies reading |
| Resubmission | Not implemented in workflow | [`finalize/route.ts`](../../src/app/api/package/submit/finalize/route.ts) hard-codes revision 1 and rejects an existing submission; ADR claim differs in [`0013`](../../docs/adr/0013-immutable-revisions-and-snapshot-provenance.md) |
| Public sign-up | Intentionally blocked | [`src/app/api/auth/[...all]/route.ts`](../../src/app/api/auth/%5B...all%5D/route.ts), [`src/lib/auth.ts`](../../src/lib/auth.ts) |
| Durable panel storage | Configured filesystem with authenticated streaming | [`src/lib/panel-storage.ts`](../../src/lib/panel-storage.ts), agent panel route above |
| Retention/deletion/reset | Not implemented | No lifecycle job or delete/reset route; [#17](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/17) remains open |

## Supported product content

The package profile requires two categories—brand name and alcohol statement—and treats neither as absent-allowed. The system registers six wine checks, but only three can run from artwork; it produces no aggregate compliance verdict. Evidence: [`package-profile.ts`](../../src/features/package-preparation/package-profile.ts), [`src/app/learn/page.tsx`](../../src/app/learn/page.tsx), [`README.md`](../../README.md), and [LIVE-04](limitations.md#live-observation-log).

This narrow content boundary is acceptable if the workflow saves meaningful review effort. It is not evidence that the product should add fields before usefulness is demonstrated.
