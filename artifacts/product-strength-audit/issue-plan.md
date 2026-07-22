# Proposed issue sequence

No follow-on issues were created. The corrected audit must be preserved first. Creating any proposal below requires explicit maintainer approval after the audit pull request merges; this file is a planning record, not authorization.

## 1. P0 — Reproduce and attribute the deployed package-integrity failure

- **Gap:** one deployed waiting submission observed during the audit failed stored integrity verification and could not be opened.
- **Scope:** use a repository-owned synthetic package; identify the first failing finalize/sign/store/read/verify/migrate/deploy boundary; record bounded diagnostics; make only the smallest correction supported by evidence.
- **Not established:** this single record does not prove a general integrity-design or persistence failure. Stale seeded data, signing-key change, serialization drift, corrupted bytes, migration defect, and verifier defect are hypotheses only.
- **Depends on:** audit preservation; deployment diagnostic access.
- **Gate:** exact cause or external blocker is evidenced, regression is covered, and a supported synthetic package opens after the relevant deployment lifecycle without weakening fail-closed behavior.
- **Evidence:** [LIVE-09](limitations.md#live-observation-log), [`src/lib/integrity.ts`](../../src/lib/integrity.ts), [`src/server/submissions/detail.ts`](../../src/server/submissions/detail.ts).

## 2. Product workflow — Agent claim, request changes, and internal acceptance

- **Gap:** agent queue/detail is read-only; the value-producing decision does not exist.
- **Scope:** minimal claim/lease contract; append-only `changes_requested` or `internally_accepted`; structured rationale/note; actor/time/provenance; authorization; concurrency; idempotency; accessible UI and tests.
- **Depends on:** Issue 1 proves the package read boundary.
- **Gate:** agent can claim a revision and record exactly one current action; duplicate/stale/unauthorized writes fail safely; prior history remains immutable.
- **Evidence:** GET-only [`src/app/api/agent`](../../src/app/api/agent), [`src/app/agent/submissions/[id]/page.tsx`](../../src/app/agent/submissions/%5Bid%5D/page.tsx), proposed [`ADR-0014`](../../docs/adr/0014-state-transitions-concurrency-and-idempotency.md).

## 3. Product workflow — Seller feedback, immutable revision 2, and resubmission

- **Gap:** `/seller` exposes status without rationale/action; package finalization is revision-1-only.
- **Scope:** seller reads requested changes, branches from v1, resubmits v2, and returns it to the queue; agent sees prior rationale and a provenance-preserving revision comparison.
- **Depends on:** Issue 2 decision record and explicit seller ownership rules.
- **Gate:** E2E v1 → claim → request changes → seller reads rationale → v2 → queue → internal acceptance; v1 and its decision remain visible and unmodified.
- **Evidence:** [`src/app/seller/page.tsx`](../../src/app/seller/page.tsx), [`src/app/api/package/submit/finalize/route.ts`](../../src/app/api/package/submit/finalize/route.ts), proposed [`ADR-0013`](../../docs/adr/0013-immutable-revisions-and-snapshot-provenance.md).

## 4. Product/UX — Make package review the default journey

- **Gap:** `/create`, `/review`, `/review/legacy`, `/learn`, and unavailable intents compete as peers.
- **Scope:** emphasize Prepare package → Submit for internal review → Track and respond; move Create, Learn, and Legacy into “Other tools” or contextual help; inventory direct-access dependencies; do not delete secondary surfaces yet.
- **Depends on:** Issues 2–3 make the primary journey complete.
- **Gate:** every default promise maps to implemented behavior; task testing selects the package path without facilitator clarification; secondary tools remain directly reachable during migration.
- **Evidence:** [`src/features/home/IntentHub.tsx`](../../src/features/home/IntentHub.tsx), [keep-cut-defer.md](keep-cut-defer.md), [LIVE-01](limitations.md#live-observation-log).

## 5. Documentation — Publish current architecture and supersession map

- **Gap:** architecture, plans, and proposed ADRs contradict implemented auth, storage, routes, revisions, demo behavior, and workflow boundaries.
- **Scope:** one authoritative implemented-flow map; explicit missing/now-completed behaviors; truthful ADR statuses; mark plans superseded without rewriting history.
- **Depends on:** Issues 2–4 settle workflow and navigation truth.
- **Gate:** architecture statements match source; documentation checks add zero new errors.
- **Evidence:** [documentation-drift.md](documentation-drift.md).

## 6. Measurement — Implement Issue #38’s privacy-safe event contract

- **Gap:** human usefulness remains `UNKNOWN_NOT_MEASURED`.
- **Scope:** measure preparation, verification, correction, reinspection, fallback, decision, change request, and resubmission; exclude image bytes, raw OCR, declared values, contact data, secrets, and semantic object keys.
- **Depends on:** complete loop from Issues 2–3 and approved event dictionary.
- **Gate:** every governed case yields a complete comparable event sequence; prohibited-data scan is clean.
- **Evidence:** existing [#38](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/38), [north-star-and-metrics.md](north-star-and-metrics.md).

## 7. Product validation — Paired Label Lens versus manual baseline

- **Gap:** accuracy evidence does not show an advantage over shared folder, marked-up artwork, worksheet/checklist, reviewer email, and manual revision tracking.
- **Scope:** counterbalanced governed-fixture study; total seller-plus-reviewer active time; trustworthy disposition; corrections; reinspection; fallback; abandonment; trust; uncertainty.
- **Depends on:** Issue 6 instrumentation.
- **Gate:** each conclusion is positive, neutral/negative, or unmeasured under a predeclared decision rule; no new fields are added to manufacture value.
- **Evidence:** [usefulness-assessment.md](usefulness-assessment.md), [north-star-and-metrics.md](north-star-and-metrics.md).

## 8. Product decision — Keep, target, or remove OCR from the primary path

- **Gap:** current alcohol baseline is 70/103 detection (68.0%) and 68/103 parsed accuracy (66.0%) with zero measured false certainty, but net handling-time value is unknown.
- **Scope:** combine Issue 7 operator outcomes with current brand/alcohol evidence; choose default-on, targeted/optional, or off; document rollback and any eligible bounded experiment.
- **Depends on:** Issue 7.
- **Gate:** role is selected on net human outcome without authority, abstention, provenance, false-certainty, or latency regression; no model/provider implementation is bundled into the decision issue.
- **Evidence:** current [`alcohol baseline`](../alcohol-digit-ocr-diagnosis/summary.md), current [`brand metrics`](../brand-evidence-path-diagnosis/metrics.md), [#149](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/149). The 61%/57% aggregate in [#57](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/57) is historical, though its usefulness-gate intent remains relevant.

## 9. Operations — Harden lifecycle, demo isolation, and provenance before expansion

- **Gap:** retention, deletion, replay, demo reset/isolation, backup/restore, account lifecycle, deployed provenance, and duplicate-action controls remain incomplete.
- **Scope:** coordinate existing [#17](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/17) and [#136](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/136); do not create duplicates unless their scopes are explicitly replaced.
- **Depends on:** Issue 8 determines the useful product boundary.
- **Gate:** enforced asset lifecycle, zero public-demo records in the real queue, deterministic reset, audited deletion/replay/restore, deployed build identity, and duplicate-action suppression.
- **Evidence:** [security-operations.md](security-operations.md), [`src/lib/panel-storage.ts`](../../src/lib/panel-storage.ts), [LIVE-08](limitations.md#live-observation-log)–[LIVE-10](limitations.md#live-observation-log).

## Explicitly not next

Do not create field-expansion, beverage-expansion, OCR-provider, commercial-expansion, generalized AI-agent, or official TTB-integration issues before this sequence produces a complete, useful, and operationally governed internal workflow. [Issue #142](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/142) should remain deferred.
