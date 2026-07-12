# Extraction accuracy baseline (Issue #57)

This directory holds the **measurement system** for the two-field (brand +
alcohol) extractor and its committed baseline. It establishes how well the
current production extractor performs and, crucially, **where** it fails — so
future work is driven by data, not guesses. This PR builds measurement only; it
does **not** tune the extractor.

## What is here

- `../../src/fixtures/eval/eval-manifest.json` — the versioned evaluation set
  (15 labels) with per-case truth. Truth is **evaluation-only**: it is never an
  input to the extractor, and `eval-boundary.test.ts` enforces that.
- `../../src/fixtures/eval/` — the harness (`eval-harness.ts`), pure metrics and
  failure classification (`metrics.ts`), the schema/loader, and their tests.
- `report.json` / `report.md` — the **generated** baseline (this directory is
  prettier-ignored because it is a build artifact).

## Regenerating

```
npm run eval:baseline
```

This runs the **real** extractor over every case (minutes of OCR) and rewrites
`report.json` and `report.md`. It is gated behind `EVAL_BASELINE=1`, so the
normal test suite never pays its cost. The lightweight safeguards
(`metrics.test.ts`, `eval-manifest.test.ts`, `eval-boundary.test.ts`,
`eval-harness.integration.test.ts`) run in CI as usual.

## The product standard

Accuracy is **not** "OCR returned text". A case is a success when the reviewer
received the correct-or-useful evidence candidate **and** uncertainty was
represented honestly. So:

- brand answers are recorded as a set of **acceptable** strings, matched with
  punctuation/diacritic tolerance;
- **genuinely ambiguous** labels (competing brand-like phrases, or brand art
  that is only present in an excluded bottler line) treat an honest `AMBIGUOUS`
  observation as a success, and a confident single pick as a `false-certainty`
  failure;
- a correctly **absent** alcohol statement is a success, never a failure.

## Failure taxonomy

Failures are located by pipeline stage, never collapsed into one "incorrect"
bucket: `ocr-recognition`, `region-coverage`, `line-reconstruction`,
`candidate-generation`, `candidate-filtering`, `candidate-ranking`, `parser`,
plus the two honest outcomes `correct` and `correct-uncertainty`.

## What the current baseline shows

The headline numbers live in `report.md`. The decisive finding is the **failure
distribution**:

- **OCR recognition is rarely the bottleneck** — only 1 brand and 4 alcohol
  misses are true OCR failures.
- **Candidate handling dominates.** Brand losses are mostly
  `candidate-filtering` (the correct brand text is read by OCR but merged into a
  line that trips the mandatory-text/producer exclusion — this is exactly how
  "Luigi & Giovanni" is lost while the fragment "Pir" survives). Alcohol losses
  are mostly `candidate-generation`: the selector only starts from a single
  token containing both a digit **and** `%`, so split OCR (`12.5` · `%`) and
  percent-less statements (`ALC. 14 BY VOL.`) are dropped before parsing.
- **The parser is not implicated** (0 parser failures on this set).

### Next single highest-value change (data-supported)

Relax alcohol **candidate generation** in `selectAlcoholObservation` to assemble
split/percent-less tokens (`14` · `%` · `ALC` · `VOL`) before parsing. It is the
largest homogeneous, low-risk bucket (5 of 9 present-alcohol misses), it targets
the field the reviewer directly compares against the declared value, and it does
not touch brand selection or ranking. Brand `candidate-filtering`
(line-reconstruction before the exclusion filter) is the second-largest bucket
and the natural follow-up. Neither is an OCR-engine change.
