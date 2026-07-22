# North star and metrics

## North-star outcome

> The share of seller packages that reach a trustworthy internal review outcome with less combined seller-plus-reviewer time than the manual baseline, without an authority, provenance, or false-certainty regression.

This is intentionally an outcome, not a product-activity count. A package created, OCR pass completed, or queue row opened is not value if the reviewer must redo the work or cannot return a decision. [Issue #38](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/38) provides the measurement contract; current source lacks the decision endpoint needed to observe the full outcome.

## Required comparison design

Use the same repository-owned or explicitly approved evaluation cases in a counterbalanced manual-versus-Label-Lens comparison. Start with the current two-field domestic-wine scope. Measure seller preparation and reviewer disposition separately, then combined. Do not use private applicant material in the public demo. Evidence governance must follow [`docs/fixture-corpus.md`](../../docs/fixture-corpus.md) and [`docs/evidence-retention-and-auditability.md`](../../docs/evidence-retention-and-auditability.md).

## Outcome metrics

| Metric | Definition | Why it matters |
| --- | --- | --- |
| Time to trustworthy disposition | Start of seller preparation to recorded internal outcome, including correction/resubmission | Captures the complete job rather than first OCR result. |
| Net combined operator time | Seller active time + reviewer active time, excluding system wait but reporting it separately | Prevents shifting work from reviewer to seller and calling it a gain. |
| Trustworthy completion rate | Outcome reached without an unresolved wrong populated field or missing required evidence | Prevents speed from hiding unsafe results. |
| Accepted unchanged / corrected / deleted | Field-level disposition of every machine-populated candidate | Distinguishes real assistance from human repair. |
| Wrong populated fields | Machine values a human must correct or that survive incorrectly | A safely contained wrong answer can still impose cost, as #38 notes. |
| Abstentions repaired | Blank/`NOT_OBSERVED` fields that require human work | Separates honest uncertainty from useful completion. |
| Ambiguity escalations | Candidate exists but human selection is required | Different burden from blank abstention; #38 requires separate measurement. |
| Reinspection events | Times a person reopens/rechecks artwork because of system output | Direct measure of machine-induced friction. |
| Change-request cycle time | Decision to seller response to revision-2 decision | Measures the currently missing loop. |
| Abandonment/fallback | Cases finished outside Label Lens after starting | Reveals when manual work remains preferable. |

## Machine-helper metrics

Continue reporting brand and alcohol separately: brand selected match, top-3 recall, authority-state distribution, false certainty, alcohol detection/parsed accuracy, absent false positives, layout slices, median/p95 latency, and failure taxonomy. Current governed baselines are in [`brand-evidence-path-diagnosis/metrics.md`](../brand-evidence-path-diagnosis/metrics.md), [`alcohol-digit-ocr-diagnosis/summary.md`](../alcohol-digit-ocr-diagnosis/summary.md), and [`alcohol-truth-correction/metric-diff.md`](../alcohol-truth-correction/metric-diff.md). Issue [#57](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/57) contains superseded 61%/57% aggregate figures; its usefulness-gate intent remains relevant, but those figures are historical. These are diagnostic metrics, not the north star.

Add operator-linked measures:

- percentage of correct observations accepted unchanged;
- verify time for correct observations versus manual locate/transcribe time;
- correction time for wrong observations;
- additional interactions caused by OCR;
- net time saved/lost by outcome class;
- package throughput with OCR on versus bounded/optional/off.

## Trust, security, and operations guardrails

- zero invented alcohol value in absent cases for any production-enabling gate;
- no collapse of `NEEDS_REVIEW`, `not_run`, or human authority;
- every governed synthetic live package opens with valid integrity across supported deploy/restart events, without treating the one dated failed record as proof of a general failure;
- zero public-demo records in the real queue;
- explicit retention class for every persisted asset;
- no uploaded bytes, raw OCR, declared values, secrets, or semantic object keys in telemetry;
- unauthorized/cross-submission access tests remain passing;
- deployed report includes immutable application/pipeline provenance and duplicate actions are suppressed, per [#136](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/136).

## Decision rule

Do not set a numeric product score. Decide per workflow:

- **Keep/default-on:** trustworthy outcomes improve and combined operator time is meaningfully lower without guardrail regression.
- **Targeted/optional:** benefit is confined to a falsifiable slice (for example, ordinary horizontal alcohol statements) and users can bypass it.
- **Remove from primary flow:** no consistent net benefit, correction/reinspection cost dominates, or the same outcome is faster manually.

The exact meaningful-time threshold should be chosen with operators before the study; it is not established by current evidence.
