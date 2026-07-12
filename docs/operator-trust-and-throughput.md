# Operator Trust and Throughput Policy

## Status

Accepted.

- Date: 2026-07-12
- Supersedes: the previous truncated draft of this policy.
- Review source: [RDR-003 — extraction-accuracy workflow pivot](reviews/rdr-003-extraction-accuracy-workflow-pivot/verdict.md).

## Purpose and scope

Label Lens TTB exists to help a compliance reviewer complete **more accurate
reviews with less interruption**. This policy governs how the prototype earns and
keeps operator trust, and how it measures throughput, so that a faster workflow is
never mistaken for a better one.

The governing principle behind the whole system is unchanged:

> AI and OCR may extract evidence. Deterministic rules evaluate that evidence.
> Human reviewers remain authoritative.

RDR-003 sharpens this into a frozen operating principle that this policy adopts:

> The applicant declares what should appear. The machine locates and compares
> evidence. The applicant resolves correctable differences. The reviewer
> classifies genuine ambiguity. Human authority remains final.

**Operator trust** is treated here as a *measurable operational property*, not a
sentiment: it is the degree to which a reviewer can rely on the tool's output
without re-doing the work, being misled by unsupported certainty, or being left
without an explanation when something fails. It is observed through the workload,
correction, and abandonment measures in this document — not asserted.

**Throughput** means *completed, accurate, reviewable work* — cases carried to a
defensible, auditable outcome — not raw images processed per minute. A case that
is processed quickly but leaves the reviewer to correct a fabricated field, or to
re-enter facts the tool discarded, has produced negative throughput.

**Lowest compute cost is not the primary objective.** Cheap inference that stalls,
fails silently, or produces confident-but-wrong output raises total operational
cost (see [Compute cost versus operational cost](#compute-cost-versus-operational-cost)).
The prototype optimizes for *time to a trustworthy, actionable result* and for
*reduced human effort*, subject to honest handling of uncertainty.

**Prototype targets vs. production commitments.** Every numeric value in this
document is a **prototype target** used to steer the current single-image,
domestic-wine proof of concept. None is a production service-level agreement.
This is not a TTB system; it does not approve or reject labels, and it is not a
government or production authorization. Production SLAs, retention, and
institutional workflows are out of scope until the revised core proves it saves
human work (see [RDR-003 verdict](reviews/rdr-003-extraction-accuracy-workflow-pivot/verdict.md)).

## Trust boundaries

The workflow keeps six layers distinct. Collapsing any two of them is a trust
defect, regardless of speed.

```text
Applicant assertion   -> what the seller says should appear (a search target)
Machine observation   -> what OCR/extraction found on the artwork (evidence)
Deterministic finding -> a versioned rule's comparison (PASS/WARN/FAIL/NEEDS_REVIEW/not_run)
Applicant correction  -> the applicant fixes a declaration or replaces artwork
Reviewer classification -> a human's bounded judgment about the evidence
Final human disposition -> the operator's recorded internal-workflow decision
```

Binding rules across these boundaries:

- **Applicant declarations are search targets, not observed truth.** A declared
  brand or alcohol value is normalized into a retrieval target; it is never
  presented, stored, or scored as if the machine read it from the artwork.
  Declarations may be wrong, incomplete, or inconsistent with the image.
- **Machine evidence cannot issue approval or rejection.** The analyzer emits
  evidence-only observations; deterministic rules emit findings; there is **no
  overall pass/fail verdict** and no regulatory conclusion. This is enforced by
  the evidence-only analyzer contract and the result-semantics tests, not by
  convention alone. See [`docs/adr/0002-ai-extracts-rules-decide.md`](adr/0002-ai-extracts-rules-decide.md)
  and [`docs/adr/0003-ocr-is-evidence-not-truth.md`](adr/0003-ocr-is-evidence-not-truth.md).
- **Reviewer classification must not overwrite original machine evidence.** Human
  action is **append-only**: the original machine candidate, geometry, and
  provenance are preserved, and a correction or classification is appended. The
  disposition history never mutates findings.
- **Throughput metrics must never pressure a reviewer into careless approval.**
  No metric in this policy rewards speed at the expense of correctness. Handling
  time is always read together with the false-certainty and override measures; a
  drop in handling time that coincides with a rise in false passes is a **failure**,
  not a win (see [Workload and throughput measures](#workload-and-throughput-measures)).

## Required machine states

The workflow reuses the repository's existing state vocabularies rather than
inventing a parallel model. States below are grouped by the layer that owns them.

**Observation states (implemented, evidence-only).** Emitted by the analyzer and
shown to the operator through plain-language labels:

| Machine state | Operator-facing label | Meaning |
| --- | --- | --- |
| `OBSERVED` | Found | A supported candidate was extracted. |
| `LOW_CONFIDENCE` | Found with low confidence | Present, but weakly recognized. |
| `AMBIGUOUS` | Multiple possibilities | Competing candidates; a human decides. |
| `NOT_OBSERVED` | Not detected | No supported candidate was extracted (this does **not** prove the text is absent from the artwork). |

**Processing states (implemented).** `created` to `extracting` to `evaluating` to
`completed`, or `failed`. The operator is told which stage is active.

**Finding outcomes (implemented, per check — never a global gate):** `PASS`,
`WARN`, `FAIL`, `NEEDS_REVIEW`, `not_run`. Rule execution is recorded as
`executed`, `not_run_insufficient_evidence`, `not_run_external_dependency`, or
`error`. Evidence sufficiency is `sufficient` or `insufficient`.

**Disposition decisions (implemented, operator internal workflow):**
`accepted_for_internal_use`, `correction_requested`,
`additional_evidence_requested`, `escalated_for_human_review`, `superseded`,
`no_action`.

**Claim-verification evidence states (target, RDR-003 — not yet implemented).**
The applicant-declared workflow requires a bounded per-field evidence state that
compares a declared value with candidate artwork evidence: **verified match**,
**acceptable normalized match**, **conflicting evidence** (a different readable
value), **not found**, **unreadable**, and **ambiguous**. These map onto the
observation states above and MUST NOT introduce a contradictory duplicate model;
a different readable value is reported as *conflicting evidence*, never as
*not found*.

**Operational lifecycle states (partly future).** `processing` and `failed` exist
today. `timed out`, `provider unavailable`, and `reprocessing requested` are
**not implemented**; they are defined here as the required vocabulary for the
failure and recovery policy below. There is **no cloud provider today** — "provider
unavailable" describes a future bounded fallback only, never current behavior.

## Interruption and silent-failure limits

These are prototype acceptance criteria for how the tool behaves while working or
failing. They are targets for the proof of concept, not production SLAs.

- **Visible progress.** A processing indicator is shown within **1 s** of a run
  starting, and the active stage (`extracting`, `evaluating`) is named.
- **Maximum time before a state is explained.** No run sits in an unlabeled
  state. Any end-to-end result exceeding **5 s** must name the slow stage rather
  than spin silently; the preferred median is **under 2 s** and preferred p95 is
  **under 5 s** (see [`docs/performance-and-adoption-criteria.md`](performance-and-adoption-criteria.md)).
- **No silent failure.** Every failure surfaces a bounded, user-safe message and
  a recorded typed code (for example `OCR_FAILED`, `OCR_UNAVAILABLE`,
  `CORRUPT_IMAGE`). "Nothing happened" is a defect, not an outcome.
- **Recoverable error messaging.** Error text states what happened and what the
  operator can do next; it never exposes stack traces, absolute paths, secrets,
  or environment data.
- **Preservation of entered applicant facts.** A processing failure never clears
  the applicant's declared brand or alcohol value; the operator can retry without
  re-entering them.
- **Preservation of active reviewer work.** A late or failed machine result never
  discards a reviewer's in-progress classification or a recorded disposition.
- **Safe retry and idempotency.** Extraction is deterministic in its inputs:
  identical bytes and metadata produce an identical result, so a retry is safe
  and does not create divergent evidence. Recording a disposition requires the
  server-issued append token, so retries cannot corrupt history.
- **What the operator can still do during a failure.** The operator may re-run,
  replace the artwork, correct a declared fact, load the bundled sample, or hand
  the case to manual review. The tool never becomes a dead end.

## Ambiguity handling

Ambiguous evidence is a **fast human classification task**, not a technical dead
end. For each supported field the operator view exposes (target workflow,
RDR-003):

1. the **applicant declaration** for that field;
2. **highlighted candidate regions** from the machine, with geometry;
3. a **candidate-selection dropdown**, including an explicit `None of these`;
4. a **bounded classification dropdown** (vocabulary below);
5. an optional **wrong-field subtype**;
6. an optional short **explanation**;
7. an **append action** that preserves the original machine result and adds the
   human correction (append-only), with an **escalation path** to specialist
   review.

Initial classification vocabulary (from RDR-003; adopted unless a governed
conflict is found — none was):

- confirmed match;
- acceptable normalized match;
- present but conflicts with declared value;
- wrong field type;
- not present on artwork;
- artwork unreadable;
- applicant correction required;
- escalate for specialist review.

Wrong-field subtype vocabulary:

- producer or bottler;
- appellation;
- varietal or designation;
- vintage;
- mandatory statement;
- slogan or decorative text;
- other.

**None of these classifications constitutes final regulatory approval or
rejection.** They record what a human concluded about *evidence*; the final
disposition remains an internal-workflow decision, and actual TTB action is out
of scope.

## Workload and throughput measures

The primary success metric is **saved work**, not model accuracy in isolation.
The following indicators are measured; those requiring instrumentation that does
not yet exist are marked *(to instrument)*.

- time to first useful result;
- median and p95 processing time;
- median and p95 reviewer classification time *(to instrument)*;
- reviewer selections or clicks per field *(to instrument)*;
- manual override rate *(to instrument)*;
- false-certainty correction rate;
- applicant-side resolution rate *(to instrument)*;
- reprocessing rate *(to instrument)*;
- abandonment rate *(to instrument)*;
- silent-failure rate;
- completed cases per reviewer hour *(to instrument)*;
- reviewer handling time against a manual baseline *(to instrument)*.

**What counts as "saved work."** Work is saved when a case reaches a defensible,
auditable outcome with *less* human effort than the manual baseline: the machine
either confirmed a declaration, surfaced the correct candidate for a one-click
reviewer selection, let the applicant resolve a discrepancy before review, or
honestly reported that no defensible evidence exists — **without** the reviewer
having to unlearn a wrong suggestion or re-enter discarded facts.

A faster workflow is **not** successful if it increases any of: false passes;
unsupported certainty; reviewer confusion; correction burden; or repeated work.
Any speed gain must be read together with these; a regression in them cancels the
gain.

## Failure and recovery policy

Defined behavior for each failure mode. Nothing here implies a capability that
does not exist today.

- **Local OCR fails** (`OCR_FAILED` / `OCR_UNAVAILABLE`): report a bounded,
  recoverable error, preserve declared facts, and offer retry or manual review.
  Never emit a fabricated field to fill the gap.
- **A future external provider fails** (`provider unavailable`): there is **no
  external provider today**. If a bounded fallback is ever added, its failure
  degrades to the local-first path or to an explained error — never to a silent
  or unbounded call. See [`docs/adr/0004-local-first-replaceable-analysis.md`](adr/0004-local-first-replaceable-analysis.md).
- **Providers disagree:** when multiple evidence sources ever exist, disagreement
  is surfaced as `conflicting evidence` for human classification, not silently
  reconciled into a single confident answer.
- **Processing times out** (`timed out`, future state): the run is marked timed
  out with the slow stage named; declared facts and reviewer work are preserved;
  retry is offered.
- **A result arrives after manual review has begun:** the late result never
  overwrites in-progress human work. It is offered as additional evidence the
  reviewer may accept or ignore.
- **Reprocessing produces a different result:** identical inputs must produce an
  identical result (determinism). A genuine difference (for example, replaced
  artwork) is treated as a **new** submission with its own preserved history, not
  an in-place mutation of the prior evidence record.
- **The applicant replaces artwork or changes declared facts:** this begins a new
  prescreen; the original submission and its correction history are preserved.

## Trust-loss and abandonment indicators

Warning signals that operator trust is eroding:

- repeated overrides of machine output on the same field type;
- reviewers routinely ignoring machine output;
- high correction time per case;
- repeated retries on the same submission;
- unexplained state transitions;
- abandonment before report completion;
- operators re-keying data into a separate tool or spreadsheet.

**Required response when a threshold is exceeded** (choose the least-disruptive
sufficient action, and record it):

- investigate the signal against the measures above;
- halt evidence-scope or field expansion;
- roll back the specific tuning change that correlates with the regression;
- disable the candidate source responsible;
- return the affected path to the manual workflow;
- require a new Rubber Duck Review before resuming.

## Compute cost versus operational cost

Optimizing for inference cost alone is a false economy. Total operational cost
includes, and is usually dominated by, the human-side terms:

- inference or OCR compute cost;
- infrastructure cost;
- reviewer labor;
- applicant rework;
- correspondence burden;
- delay to market for the applicant;
- audit and incident cost;
- trust loss and abandonment.

A change that lowers compute cost while raising reviewer labor, applicant rework,
or false-certainty correction has **increased** total cost and is rejected by
this policy.

## Acceptance table

Every principle below has at least one measurable criterion. All numeric values
are **prototype targets** for the proof of concept, not production SLAs.
"Invariant" means it must always hold regardless of tuning.

| Principle | Metric | Prototype target or required invariant | Measurement source | Action when breached |
| --- | --- | --- | --- | --- |
| Honest absence over false certainty | Absent-field false-positive rate | Invariant: never fabricate a field when no defensible candidate exists. Prototype target: reduce from the 100% absent-brand baseline toward 10% or lower | Full-corpus evaluation harness | Halt tuning/expansion; roll back the candidate source; new RDR |
| Evidence separation | Machine evidence mutated by human action | Invariant: zero — corrections are append-only | Disposition history; export checksum; result-semantics tests | Treat as a defect; block release |
| No regulatory conclusion | Overall pass/fail verdict emitted | Invariant: zero | Evidence-only analyzer contract tests | Governance breach; halt; new RDR |
| Visible progress | Time to a labeled processing state | Prototype target: under 1 s; slow stage named if end-to-end over 5 s | UI processing states; stage timers | Treat unexplained stall as a silent-failure defect |
| Speed without false pass | Median / p95 processing time | Prototype targets: median under 2 s, p95 under 5 s (not production SLAs) | Stage timers; evaluation latency | Report the slow stage; never trade correctness for latency |
| No silent failure | Silent-failure rate | Invariant: zero — every failure surfaces a bounded, recoverable message | Error-path tests; failure logs | Fix; halt if recurring |
| Preserve operator input | Declared facts or reviewer work lost on failure | Invariant: zero | Component and end-to-end tests | Treat as a defect; block release |
| Saved reviewer work | Reviewer handling time vs. manual baseline | Invariant: must not increase. Prototype target: material reduction *(to instrument)* | Planned reviewer timing study | Halt expansion; new RDR |
| Low correction burden | False-certainty override or correction rate | Prototype target: decreasing trend *(to instrument)* | Correction/override logs | Roll back tuning; disable candidate source |
| Applicant self-resolution | Applicant-side resolution rate | Direction: increasing *(to instrument)* | Prescreen correction workflow | Investigate workflow friction |
| Reprocessing stability | Determinism of identical inputs | Invariant: identical bytes produce an identical result | Determinism tests | Treat divergence as a defect |
| Human authority | Late or reprocessed result overwrites human work | Invariant: zero | Failure and recovery tests | Treat as a defect; block release |

This policy is complete and Accepted. It governs the operator-facing behavior of
the current prototype and gates evidence-scope expansion until the measures above
demonstrate reduced human effort without increased false certainty.
