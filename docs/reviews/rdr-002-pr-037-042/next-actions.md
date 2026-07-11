# Rubber Duck Review 002 — Next Actions

- **Review id:** `rdr-002-pr-037-042`
- **Verdict:** [`PAUSE AND EXPAND REAL-WORLD EVIDENCE`](./verdict.md)
- **Governing process:** [Rubber Duck Review 2.0](../../rubber-duck-review-2.0.md), issue [#21](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/21)

These actions follow from [`verdict.md`](./verdict.md) and the factual record in
[`source-brief.md`](./source-brief.md) and [`debate-script.md`](./debate-script.md).

## Blockers before issue #15

1. **Fix the single-candidate uncertainty composition defect** so a lone
   unclassified candidate yields usable uncertainty rather than a typed
   `INVALID_RESPONSE` / invalid-shape failure.
2. **Add selector-to-analyzer integration coverage** that composes
   `selectBrandObservation` through `extractLabelEvidence` and the shared schema.
3. **Rewrite issue [#15](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/15)**
   so it distinguishes:
   - harness plumbing;
   - non-representative preliminary reporting;
   - representative baseline eligibility.
4. **Replace the circular issue sequence with a staged DAG** (per-field
   contract → extraction → normalization → rule metadata → activation).
5. **Acquire additional independent privacy-safe real labels** before
   establishing accuracy thresholds or calling any output a system baseline.

## Targeted hardening before or during issue #15

- Define `UNCLASSIFIED` / `NEEDS_CONFIRMATION`, **or** explicitly allow
  zero-alternate ambiguity with a reason code — pick one and make the shared
  schema and selector semantics agree.
- Add composition tests through `extractLabelEvidence` (not only the selector and
  the schema in isolation).
- Publish corpus maturity metadata (synthetic vs derived vs independent-real
  counts and eligibility state).
- Separate synthetic semantic-regression metrics from real-OCR metrics.
- Mark all early metrics **preliminary and non-representative**.
- Add platform/runtime fingerprinting to OCR measurement.
- Measure total and per-stage latency (the timing ADR 0009 required and Slice 3
  deferred).
- Document integrity / authenticity / authorization distinctions explicitly.
- Add a bounded operator-friction collection plan **without persistent
  telemetry**.

## GitHub issue changes

### New issue

**Title:** `Fix single-candidate uncertainty composition failure`

**Acceptance boundary:**
- lone unclassified candidates produce usable uncertainty, not an invalid
  response;
- shared schema and selector semantics agree;
- composition tests cover `LIVE BOLDLY` and `NAPA VALLEY`;
- no change permits a false brand `PASS`.

### Rewrite [#15](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/15)

**Title:** `Build a corpus-maturity-aware Kaizen evaluation harness`

**Acceptance boundary:**
- separate synthetic, derived, and independent-real strata;
- no representative baseline until a minimum real-label gate is met;
- preliminary outputs labeled non-representative;
- measure false-observed, ambiguity, extraction failure, latency, and
  operator-review burden;
- no aggregate compliance score.

### Revise [#39](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/39), [#40](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/40), [#6](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/6), and [#16](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/16) dependencies

Replace whole-issue gates with staged outputs:

```text
evidence contract
→ extraction
→ field normalization policy
→ rule lifecycle metadata
→ profile activation
```

The `#6`/`#16` dependency then applies only to **profile activation**, not to
evidence-contract or extraction work — which removes the cycle without
abandoning evidence-first sequencing.

### Revise [#21](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/21)

Record that the **manual RDR process worked and exposed defects not found by
CI** (the single-candidate composition failure in particular). **Do not close
#21 yet;** generator automation remains unfinished.

## ADR candidates

- uncertainty-state semantics;
- identity vs integrity vs append authorization;
- corpus truth-label separation;
- corpus inclusion / privacy policy;
- platform-bounded OCR reproducibility;
- evidence-before-expansion with a staged dependency DAG;
- criteria for representative baseline eligibility.

## Stakeholder or legal questions

Only questions requiring external judgment:

- minimum real-label diversity needed before internal performance claims;
- whether public approved artwork may be retained as a privacy-screened fixture;
- acceptable disposition recovery behavior after token loss or key rotation;
- whether public demo uploads may be processed ephemerally without retention.

## Explicitly deferred

- designation / appellation production slice;
- net contents;
- cloud fallback;
- persistence;
- batch workflows;
- government-system integration;
- official compliance claims;
- representative accuracy claims.

## Engineer reflection

- A working vertical slice is not proof of general reliability.
- Test count is not representativeness.
- Uncertainty preservation is a product capability, not a bug to smooth over.
- Corpus design is governance.
- The architecture should now stop expanding while the confirmed defect and the
  evidence gaps are addressed — then resume.
