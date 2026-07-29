# Preregistration — PSM 7 on segmentation-suspected Brand cases

Refs Issue #149. **Evaluation-only.** This document is frozen **before any OCR is
run**. No production code, fixture, threshold, parser, ranking, normalization,
selection rule, Brand truth, Alcohol logic, or Government Warning logic is
changed by this experiment. PR #195 untouched.

Base: `origin/main` `9b02a55690fe3df61870888ffee4907abc07d5e1`, including merged
PR #205.

## Question

Does line-oriented page segmentation (Tesseract PSM 7, single line) improve
Brand OCR on the five frozen cases that a blinded, geometry-only review labeled
`SEGMENTATION_SUSPECTED`?

This is a **mechanism-existence test on five cases**. It is not a rate estimate,
not a production proposal, and not a capability measurement.

## Evidence basis

From merged PR #205:

- 5/5 of the geometry audit cases were labeled `SEGMENTATION_SUSPECTED`;
- every reader-estimated baseline was within 2 degrees of horizontal;
- no case is preregistered as irregular/curved baseline, so **PSM 13 is not
  eligible** here;
- **no orientation experiment is authorized** for this frozen set.

Those labels come from a **single isolated model annotator** and remain
provisional pending an independent second reader. This experiment inherits that
provisionality: it tests a hypothesis suggested by those labels, and does not
validate the labels themselves.

## Frozen case set

Exactly these five, fixed before any OCR:

- `approved-wine-023`
- `approved-wine-027`
- `approved-wine-035`
- `approved-wine-085`
- `approved-wine-091`

No case may be added, substituted, dropped, or re-scored after results are seen.
Post-hoc case selection and best-of-two reporting are prohibited.

## Design — one variable

Both arms use identical source images, identical governed Brand region geometry,
identical crop pixels, and identical preprocessing. **The only difference is the
Tesseract page segmentation mode.**

| Variable | Control | Treatment |
| --- | --- | --- |
| `psm` | **11** (sparse text) | **7** (single line) |
| `scale` | 3 | 3 |
| `padding` | ratio 0.03, min 4 px | ratio 0.03, min 4 px |
| `grayscaleMethod` | `sharp-grayscale` | `sharp-grayscale` |
| `contrastMethod` | `normalise` | `normalise` |
| `localContrast` | `none` | `none` |
| `thresholdMethod` | `none` | `none` |
| `sharpening` | `none` | `none` |
| `inversion` | false | false |
| `denoising` | `none` | `none` |
| `rotation` | 0 | 0 |
| `cropSource` | `governed-brand-region` | `governed-brand-region` |
| `fieldType` | `brandName` | `brandName` |

Control is `PRODUCTION_BOUNDED_BRAND_CONTROL` — the same bounded Brand control
used by the merged preprocessing experiments. PSM 11 is the page segmentation
mode production uses for governed region passes (`PAGE_SEG.SPARSE_TEXT`).

Explicitly excluded: no PSM sweep, no PSM 13, no rotation change, no
preprocessing change, no crop change, no model or traineddata change, no parser,
ranking, threshold, normalization, or selection change.

Single-variable isolation is enforced mechanically by
`validateConfigurationIsolation`, which fails closed unless `psm` is the only
differing configuration key.

## Freeze, before OCR

1. Case IDs (above).
2. Source image paths and expected image sha256, from the governed research
   manifest.
3. Crop byte hashes, derived from the frozen configuration and written to
   `crop-provenance.json`; the five crops must be **distinct** and must
   correspond to the five frozen cases.
4. Control and treatment configurations, hashed in `configuration-freeze.json`.
5. Tesseract engine identity and vendored traineddata sha256.
6. Git SHA.

At run time the crop bytes actually handed to OCR are re-hashed and must equal
the frozen hashes for **both** arms. Any mismatch fails the run closed.

## Truth handling

Brand truth is **not** used in OCR invocation, filenames, prompts, metadata,
pass planning, ranking, or selection. Raw OCR output for both the primary and
the repeat run is written to disk **before** any normalization against truth or
any truth comparison. Truth is read only afterwards, for evaluation.

## Metrics, defined before running

Normalization for comparison (the repository's existing rule): NFKD, strip
diacritics, lowercase, remove every character outside `[a-z0-9]`.

- `truth_in_raw` — some acceptable Brand truth value, normalized, appears as a
  substring of the normalized raw transcript.
- `exact_match` — the selected Brand candidate, normalized, equals some
  acceptable truth value, normalized.
- `useful_token_recall` — for each acceptable truth value: split on whitespace,
  normalize each token, keep tokens of length >= 3; recall is the fraction of
  those tokens appearing as substrings of the normalized raw transcript. The
  case value is the **maximum** over acceptable values, or `null` when no
  acceptable value has a qualifying token.
- `false_reliable_read` — the arm reported a reliable Brand read
  (state `OBSERVED` and ocr evidence score >= 0.8) that is **not** an exact
  truth match.
- `determinism_pass` — the exact repeat reproduces, for both arms, the same raw
  transcript, the same word projection (text, confidence, bounding box), the
  same selected value and state, and the same derived classification.

Confidence alone is never treated as improvement.

## Per-case classification, applied in this precedence order

1. **`NONDETERMINISTIC`** — repeated output or classification differs between
   the primary and repeat run.
2. **`REGRESSION`** — treatment loses correct evidence or introduces a wrong
   reliable candidate: control exact match lost, or control `truth_in_raw` lost,
   or a treatment false reliable read where control had none, or
   `useful_token_recall` falls by >= 0.25 absolute.
3. **`SEGMENTATION_MECHANISM_CONFIRMED`** — treatment produces a valid or exact
   Brand candidate that control does not (treatment `exact_match` true while
   control is false), deterministically, with no treatment false reliable read.
4. **`LEGIBILITY_IMPROVED_NOT_RECOVERED`** — treatment improves readable Brand
   fragments without producing a valid or exact candidate: `truth_in_raw` goes
   false -> true, or `useful_token_recall` rises by >= 0.25 absolute **and** by
   at least one whole truth token.
5. **`NO_EFFECT`** — neither materially better nor materially worse; the arms
   are equivalently unsuccessful or equivalent in useful evidence.

## Primary decision rule

- **NONDETERMINISM overrides every other conclusion.** If any case is
  `NONDETERMINISTIC`, the experiment reports `NONDETERMINISTIC` and nothing else
  is concluded.
- **STOP** if any treatment false reliable read exists, whether or not control
  had one. This veto outranks any improvement.
- **PROCEED** only if at least one case is `SEGMENTATION_MECHANISM_CONFIRMED`
  **and** there are zero treatment false reliable reads.
- **STOP** if all five cases are `NO_EFFECT`.
- **MIXED** otherwise — improvement without valid recovery, or gains and
  regressions coexisting.

## Safety vetoes

- Any new treatment false reliable read stops the branch.
- Any regression from correct control evidence to incorrect treatment evidence
  stops production-facing follow-up.
- Confidence alone cannot count as improvement.
- Best-of-two and post-hoc case selection are prohibited.
- Truth may be used only after raw outputs are frozen, and only for evaluation.
- The frozen case set may not be altered after results are seen.

## Interpretation boundaries

- n=5 mechanism-existence test only.
- No prevalence claim and no production-rate claim.
- Success would **not** establish that segmentation is the dominant Brand
  bottleneck generally.
- Failure would **not** establish a Tesseract capability ceiling.
- This says nothing about the separate stylized-typeface subset.
- The blinded labels this rests on are single-reader and provisional.
- PSM 7 success authorizes only a **separately preregistered** policy
  experiment — not a production change.
- PSM 7 failure moves the question toward recognizer/traineddata capability or
  another **separately preregistered** segmentation configuration. It does not
  authorize a sweep.

## What this authorizes

Nothing beyond producing and recording this comparison. No production change, no
default change, no mode sweeping, no retry-on-failure policy.
