# Product thesis

## Recommended one-sentence thesis

> Label Lens is a seller-led domestic-wine evidence-package workflow that preserves declared, mapped, and machine-observed brand and alcohol evidence for an internal human reviewer.

This statement is narrower than the home page, but it is the smallest thesis current source can support without implying regulatory submission, approval, or complete agent decisioning. Evidence: the package contract in [`src/features/package-preparation/package-profile.ts`](../../src/features/package-preparation/package-profile.ts), the primary package route [`src/app/review/page.tsx`](../../src/app/review/page.tsx), finalization in [`src/app/api/package/submit/finalize/route.ts`](../../src/app/api/package/submit/finalize/route.ts), and read-only review in [`src/app/agent/submissions/[id]/page.tsx`](../../src/app/agent/submissions/%5Bid%5D/page.tsx).

## Primary product

The primary product should be `/review` plus the authenticated seller and agent portals. It assembles front/back/additional panel evidence, two seller-declared categories, machine observations, deterministic findings, provenance, and immutable submission data. `/create` does not feed this case, `/review/legacy` produces local pre-check artifacts rather than an internal package, and `/learn` is supporting documentation. Evidence: [`src/app/create/page.tsx`](../../src/app/create/page.tsx), [`src/app/review/legacy/page.tsx`](../../src/app/review/legacy/page.tsx), [`src/app/learn/page.tsx`](../../src/app/learn/page.tsx), and the route relationships in [`src/components/layout/AppHeader.tsx`](../../src/components/layout/AppHeader.tsx) and [`PortalHeader.tsx`](../../src/components/layout/PortalHeader.tsx).

## Primary user and job-to-be-done

**Primary user:** a domestic-wine seller or seller-side preparer who must make artwork evidence intelligible to an internal reviewer.

**Job-to-be-done:** “When I have label artwork ready for internal review, help me assemble the declared values, exact evidence regions, machine observations, and rule outcomes into a traceable package so the reviewer does not reconstruct my evidence from loose images and notes.”

The agent is a necessary second actor, but not the primary user of the current complete value proposition because the agent experience is read-only and cannot deliver a disposition. Evidence: [`src/app/seller/page.tsx`](../../src/app/seller/page.tsx), [`src/app/agent/page.tsx`](../../src/app/agent/page.tsx), and the GET-only routes under [`src/app/api/agent`](../../src/app/api/agent).

## Moment of value

The intended moment of value is when an agent opens an integrity-verified package and can trust where each value came from. The current source can produce that read model; the audited deployment did not demonstrate it because one deployed waiting submission observed during the audit failed integrity verification for an unknown reason ([LIVE-09](limitations.md#live-observation-log)). This single dated observation requires diagnosis but does not prove a general integrity failure. OCR output alone is not the value moment: the bundled live sample misselected the brand and required a person to resolve it ([LIVE-06](limitations.md#live-observation-log)).

## One product or several?

Today it is several partially joined products:

- `/create`: a session-local, eight-field starter scaffold with no package handoff;
- `/review`: a multi-panel, browser-draft, authenticated evidence package;
- `/review/legacy`: a single-image analyzer with separate human confirmations, disposition, and local downloads;
- `/learn`: a six-check requirements catalog;
- `/seller` and `/agent`: an authenticated but incomplete internal portal;
- the corpus/evaluation system: a strong engineering and research asset, not an end-user product.

The home and global header present the first four as peers. Current data contracts do not connect `/create` or `/review/legacy` to a package submission. Evidence: [`src/features/home/IntentHub.tsx`](../../src/features/home/IntentHub.tsx), [`src/features/create/CreateWorkspace.tsx`](../../src/features/create/CreateWorkspace.tsx), [`src/app/review/page.tsx`](../../src/app/review/page.tsx), and [`src/app/review/legacy/page.tsx`](../../src/app/review/legacy/page.tsx).

## Scope boundary

The thesis deliberately excludes “compliance checker,” “TTB submission,” “label generator,” “all beverage labels,” and “AI reviewer.” The current README already disclaims approval and limits machine fields to brand and alcohol; the product should make the navigation and roadmap match that truth. Evidence: [`README.md`](../../README.md), [`src/features/package-preparation/package-profile.ts`](../../src/features/package-preparation/package-profile.ts), and [`src/app/learn/page.tsx`](../../src/app/learn/page.tsx).
