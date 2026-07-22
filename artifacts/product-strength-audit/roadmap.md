# Three-horizon roadmap

The approved order is product-confidence → usefulness proof → hardening. The package and human handoff are the product; OCR is a bounded helper. Official TTB integration is not a substitute for any horizon.

## Horizon 0 — Regain product confidence

### 1. Correct and preserve this product audit

- **Problem:** the first audit draft used superseded 61% alcohol detection and 57% parsed accuracy as the current aggregate baseline.
- **User:** maintainer and every downstream product decision-maker.
- **Evidence:** current [`alcohol baseline`](../alcohol-digit-ocr-diagnosis/summary.md), governed [`truth correction`](../alcohol-truth-correction/metric-diff.md), and the corrected files in this directory.
- **Outcome:** all 19 audit artifacts use 70/103 detection (68.0%), 68/103 parsed accuracy (66.0%), false certainty 0, absent-alcohol false positives 0/13, and the 64/6/45 state histogram; older figures are labeled historical when retained.
- **Dependency:** approved narrowed thesis and correction supplied by the maintainer.
- **Success metric:** stale aggregate-language scan is clean; all artifact validation passes; one scoped audit commit is created.
- **Stop condition:** no production or repository-wide documentation edits; stop at preservation.
- **Type:** audit/documentation.

### 2. Diagnose and reproduce the live package-integrity failure

- **Problem:** one deployed waiting submission observed during the audit failed stored integrity verification and could not be opened.
- **User:** seller, internal agent, and operator.
- **Evidence:** [LIVE-09](limitations.md#live-observation-log), [`src/lib/integrity.ts`](../../src/lib/integrity.ts), and [`src/server/submissions/detail.ts`](../../src/server/submissions/detail.ts).
- **Outcome:** reproduce or bound the observation with a repository-owned fixture and attribute the first failing boundary without modifying private or persisted audit data.
- **Dependency:** deployment diagnostics and a controlled synthetic submission.
- **Success metric:** exact cause or external blocker is evidenced; a supported package survives the relevant finalize/read/deploy boundary and opens for the agent.
- **Stop condition:** stop at the first proven boundary. Do not generalize from the single record or proceed to feature work while the demonstrated handoff cannot be reproduced successfully.
- **Type:** P0 reliability/diagnosis.

Potential mechanisms are hypotheses only: stale seeded data signed under another key, a deployment signing-key change, serialization/version drift, corrupted stored bytes, a migration defect, or a current verifier defect. The dated observation does not prove a general integrity-design or persistence failure.

### 3. Complete agent decision and request-changes

- **Problem:** the authenticated agent queue/detail is read-only and cannot produce the human outcome.
- **User:** internal agent.
- **Evidence:** GET-only [`src/app/api/agent`](../../src/app/api/agent), [`src/app/agent/submissions/[id]/page.tsx`](../../src/app/agent/submissions/%5Bid%5D/page.tsx), and [`tests/e2e/auth-portal.spec.ts`](../../tests/e2e/auth-portal.spec.ts).
- **Outcome:** agent claims a revision and records exactly one append-only current action: request changes or internal acceptance, with rationale, actor, time, provenance, authorization, concurrency, and idempotency.
- **Dependency:** step 2 demonstrates a trustworthy read boundary; explicit minimal transition contract.
- **Success metric:** focused API and browser E2E prove claim → decision, duplicate suppression, stale-write rejection, and immutable prior history.
- **Stop condition:** do not add additional decision taxonomies, government disposition, or TTB transmission without operator evidence.
- **Type:** product workflow.

### 4. Complete seller feedback, revision 2, and resubmission

- **Problem:** `/seller` exposes only a thin status row and finalization is revision-1-only.
- **User:** seller first, then the reviewing agent.
- **Evidence:** [`src/app/seller/page.tsx`](../../src/app/seller/page.tsx), [`src/app/api/package/submit/finalize/route.ts`](../../src/app/api/package/submit/finalize/route.ts), and proposed [`ADR-0013`](../../docs/adr/0013-immutable-revisions-and-snapshot-provenance.md).
- **Outcome:** seller reads the request rationale, branches from immutable revision 1, creates revision 2, and returns it to the queue; agent sees the prior decision and a provenance-preserving change view.
- **Dependency:** step 3 decision record and seller authorization design.
- **Success metric:** E2E v1 → claim → request changes → seller reads rationale → v2 → queue → internal acceptance; v1 and its decision remain visible and unchanged.
- **Stop condition:** no in-place mutation of submitted evidence; stop if revision lineage or ownership cannot be proven.
- **Type:** product workflow.

### 5. Narrow the default product navigation

- **Problem:** `/create`, `/review`, `/review/legacy`, `/learn`, and unavailable intents compete as peer destinations.
- **User:** first-time seller.
- **Evidence:** [`src/features/home/IntentHub.tsx`](../../src/features/home/IntentHub.tsx), [LIVE-01](limitations.md#live-observation-log), and [keep-cut-defer.md](keep-cut-defer.md).
- **Outcome:** default journey emphasizes Prepare package → Submit for internal review → Track and respond. Create, Learn, and Legacy move to an “Other tools” or contextual-help layer; none is deleted yet.
- **Dependency:** steps 3–4 make the primary journey complete; navigation/migration dependency inventory.
- **Success metric:** users select the package path without facilitator clarification; every default promise maps to implemented behavior; secondary direct links remain available.
- **Stop condition:** if a current dependency on a secondary surface is evidenced, preserve direct access and change only default prominence.
- **Type:** product/UX.

### 6. Repair architecture and supersession documentation

- **Problem:** core architecture, product plans, and proposed ADRs describe stateless or future behavior as though it were current.
- **User:** maintainer and contributor.
- **Evidence:** [documentation-drift.md](documentation-drift.md).
- **Outcome:** one authoritative implemented-flow map, explicit missing/now-completed behaviors, truthful ADR statuses, and marked superseded plans.
- **Dependency:** steps 3–5 settle the workflow and navigation truth.
- **Success metric:** auth, storage, revision, demo, route, and decision statements match source; documentation checks add zero new errors.
- **Stop condition:** no indiscriminate repository-wide rewrite; preserve historical records and stop when current authority is unambiguous.
- **Type:** documentation/maintainability.

## Horizon 1 — Prove usefulness

### 7. Implement privacy-safe Issue #38 measurement

- **Problem:** no evidence distinguishes assistance from human repair across the complete workflow.
- **User:** seller, agent, product owner.
- **Evidence:** [#38](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/38) and [north-star-and-metrics.md](north-star-and-metrics.md).
- **Outcome:** versioned privacy-safe events measure preparation, verification, correction, reinspection, fallback, decision, change request, and resubmission without image bytes, raw OCR, declared values, contact data, secrets, or semantic object keys.
- **Dependency:** complete loop from steps 3–4 and an approved event dictionary.
- **Success metric:** every governed test case yields a complete event sequence; prohibited-data scan is clean; manual and product paths share comparable boundaries.
- **Stop condition:** remove any event that cannot be tied to a decision or cannot be collected without sensitive payloads.
- **Type:** measurement.

### 8. Run paired Label Lens versus manual-baseline studies

- **Problem:** machine accuracy does not prove lower total human effort or more trustworthy throughput.
- **User:** representative seller-side preparer and internal reviewer.
- **Evidence:** [#38](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/38), current [`brand metrics`](../brand-evidence-path-diagnosis/metrics.md), and current [`alcohol baseline`](../alcohol-digit-ocr-diagnosis/summary.md).
- **Outcome:** counterbalanced comparison against shared folder, marked-up artwork, worksheet/checklist, reviewer email, and manual revision tracking.
- **Dependency:** step 7 instrumentation; governed fixtures; predeclared analysis and stop rule.
- **Success metric:** trustworthy-disposition time, combined active time, correction, reinspection, fallback, abandonment, and trust are classified positive, neutral/negative, or unmeasured with uncertainty.
- **Stop condition:** stop when the predeclared decision rule is met or repeated cases cannot change the product decision; do not manufacture a positive result by adding fields.
- **Type:** product validation.

### 9. Decide OCR’s role from measured operator outcomes

- **Problem:** current alcohol extraction improved to 68.0% detection and 66.0% parsed accuracy, but OCR’s net effect on handling time is unknown.
- **User:** seller and reviewer.
- **Evidence:** step 8 outcomes, current [`alcohol baseline`](../alcohol-digit-ocr-diagnosis/summary.md), current [`brand metrics`](../brand-evidence-path-diagnosis/metrics.md), and the distinct hard-case crop benchmark in [`ocr-region-isolation-benchmark/report.md`](../../docs/ocr-region-isolation-benchmark/report.md).
- **Outcome:** OCR becomes default-on, targeted/optional, or absent from the primary path according to net human outcome by failure class.
- **Dependency:** step 8 paired study.
- **Success metric:** chosen mode improves the north-star outcome without false-certainty, abstention, provenance, or latency regression.
- **Stop condition:** if OCR adds no meaningful net benefit, stop product-delivery optimization and retain the harness as internal research infrastructure. Any further #57/#149 experiment must be justified by a bounded operator benefit.
- **Type:** product decision.

## Horizon 2 — Harden before expansion

### 10. Harden lifecycle and operations before expanding scope

- **Problem:** public-demo isolation, retention, deletion, reset, backup/restore, replay, account lifecycle, and deployment provenance remain incomplete.
- **User:** operator, data subject, reviewer, and auditor.
- **Evidence:** [#17](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/17), [#136](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/136), [`src/lib/panel-storage.ts`](../../src/lib/panel-storage.ts), and [security-operations.md](security-operations.md).
- **Outcome:** every persisted asset has an enforced lifecycle; public activity is isolated/resettable; deletion/expiry and backup behavior are explicit; deployed build provenance and duplicate-action controls are proven.
- **Dependency:** positive or bounded usefulness decision from step 9 and stable workflow contracts.
- **Success metric:** #17/#136 acceptance criteria pass in production-like storage; zero public-demo records enter the real queue; supported restore/replay/deletion paths are audited.
- **Stop condition:** do not add fields, beverage categories, OCR providers, commercial tenants, or official TTB integration until lifecycle controls and operator value are demonstrated.
- **Type:** security/operations.

## Roadmap summary

The fastest route is not another OCR point. Preserve the corrected truth, diagnose the one failed deployed handoff, complete the human conversation, narrow the surface, measure the complete job against manual work, and let that evidence decide OCR’s role before hardening and expansion.
