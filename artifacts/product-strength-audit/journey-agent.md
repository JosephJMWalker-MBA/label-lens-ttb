# Agent journey

## End-to-end trace

| Step | What the agent can do | Evidence | Stop or friction |
| --- | --- | --- | --- |
| Sign in | Use a provisioned agent account; public sign-up is blocked | [`src/lib/auth.ts`](../../src/lib/auth.ts), [`src/app/api/auth/[...all]/route.ts`](../../src/app/api/auth/%5B...all%5D/route.ts), [`auth-portal.spec.ts`](../../tests/e2e/auth-portal.spec.ts) | Appropriate for an internal prototype. |
| Triage queue | Filter waiting, in review, changes requested, completed, and demo submissions | [`src/app/agent/page.tsx`](../../src/app/agent/page.tsx), [LIVE-08](limitations.md#live-observation-log) | Several filters describe states the product cannot currently create. |
| Separate demo work | Open the demo filter | [`queries.ts`](../../src/server/submissions/queries.ts), [LIVE-10](limitations.md#live-observation-log) | Finalization sets seller submissions `isDemo=false`; a shared public seller’s record appeared in the real waiting queue while demo was empty. |
| Open package | Read seller evidence, machine observations, panels, provenance, integrity, and status history | [`src/app/agent/submissions/[id]/page.tsx`](../../src/app/agent/submissions/%5Bid%5D/page.tsx), [`detail.ts`](../../src/server/submissions/detail.ts) | One deployed waiting submission observed during the audit failed integrity verification; cause and generality are unknown ([LIVE-09](limitations.md#live-observation-log)). |
| Inspect artwork | Stream a panel through authenticated, cross-submission-checked route | [`src/app/api/agent/submissions/[id]/panels/[panelId]/route.ts`](../../src/app/api/agent/submissions/%5Bid%5D/panels/%5BpanelId%5D/route.ts), [`agent-portal.test.ts`](../../src/app/api/agent/agent-portal.test.ts) | Implemented read security; no agent annotation or feedback tool. |
| Claim/start | — | No mutation route under [`src/app/api/agent`](../../src/app/api/agent) | **Hard stop:** the “Begin internal review” queue language is a link, not a claim or state transition. |
| Decide | — | [`src/app/agent/submissions/[id]/page.tsx`](../../src/app/agent/submissions/%5Bid%5D/page.tsx) has no accept/request-change controls | **Hard stop:** no structured decision, reasons, note, or actor/time record. |
| Request change | — | No route, table, or event-writing service implements it | **Hard stop:** seller cannot receive actionable feedback. |
| Review resubmission | — | Finalize is revision-1-only | **Hard stop:** no comparison or disposition of revision 2. |

## Exact workflow stop

In source, the agent can reach a detailed read model and then stops. In the audited deployment, one observed waiting record stopped at integrity verification before the read model rendered. Both distinctions matter: the product design is incomplete even if that record-specific deployment failure is repaired or proven stale.

The E2E test named around reviewing a submission verifies authentication, queue reads, detail reads, and isolation; it does not record a review outcome. Evidence: [`tests/e2e/auth-portal.spec.ts`](../../tests/e2e/auth-portal.spec.ts). The status labels and ADRs make the missing loop look closer than it is; see [`src/lib/product-language.ts`](../../src/lib/product-language.ts) and [`docs/adr/0014-state-transitions-concurrency-and-idempotency.md`](../../docs/adr/0014-state-transitions-concurrency-and-idempotency.md).

## Agent value today

If detail integrity passes, the agent receives a better-organized record than loose images: seller assertions, regions, machine output, rules, and provenance are separated. That is real potential value. It has not yet been measured against the time to inspect the same two fields manually, and the agent cannot complete the job in the product. Evidence: [#38](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/38) and [#57](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/57).
