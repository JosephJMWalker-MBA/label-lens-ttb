# Preregistration — Alcohol recovery-strip orientation attribution

Refs Issue #149. Evaluation-only. No production behavior change. PR #195 untouched.

## Hypothesis

The mandatory 90°/270° rotations applied to edge-strip recovery passes corrupt
horizontally oriented Alcohol text that is otherwise fully contained within the
recovery crop.

## Why this experiment exists

Stage 1 (`artifacts/issue-149-alcohol-low-confidence-recovery-audit/`) found that
forced recovery passes on the six governed `LOW_CONFIDENCE` Alcohol cases produced
no useful OCR text. The initial interpretation was that the edge-strip crops missed
the Alcohol statement entirely.

The geometry audit (`artifacts/issue-149-alcohol-low-confidence-geometry-audit/`)
falsified that interpretation: the Alcohol statement is fully contained inside one
recovery crop for five of the six cases. Correctly targeted crops producing pure
noise pointed at the rotation transform rather than crop placement.

## Frozen case set

Primary (100% Alcohol-region containment, per the geometry audit):

- `patricia-green-cellars` (right crop)
- `approved-wine-020` (left crop)
- `approved-wine-023` (left crop)
- `approved-wine-079` (right crop)
- `approved-wine-097` (left crop)

Separate diagnostic, reported but excluded from the primary conclusion:

- `approved-wine-034` (right crop, 52.3% containment)

No case may be added, substituted, or migrated between groups after this document.

## Arms

All arms use identical source crop pixels, scale (3), page segmentation mode
(`SPARSE_TEXT` = 11), preprocessing chain, parser, ranking, thresholds, model, and
field eligibility. The **only** varied field is `transform.rotate`.

| Arm | Left crop | Right crop | Meaning |
| --- | --- | --- | --- |
| control | 270° | 90° | current production edge-strip templates |
| treatment | 0° | 0° | identical pixels, no rotation |
| rot180 | 90° | 270° | 180° from that side's control rotation |

The `rot180` arm was preregistered before OCR specifically to distinguish
"rotation applied in the wrong direction" from "rotation is unnecessary and
destructive". No arbitrary angle sweep and no best-of-N selection is permitted.

## Execution rules

1. Case IDs, image checksums, crop rectangles, and configuration frozen before OCR.
2. Crop rectangles identical to the frozen geometry audit.
3. Raw OCR output persisted before parsing or truth comparison.
4. Each crop run independently; passes never combined before per-pass reporting.
5. One exact repeat of every arm for determinism.
6. Truth remains outside OCR input, filenames, metadata, ranking, and prompts;
   it is used only for post-hoc comparison after raw evidence is frozen.

## Decision rule

- `ORIENTATION_CONFIRMED` — at least one fully-contained case produces materially
  legible or truth-bearing evidence only in the no-rotation treatment, with a
  deterministic repeat and no new high-confidence wrong candidate.
- `ORIENTATION_NOT_SUPPORTED` — all five fully-contained cases remain OCR misses
  under no rotation.
- `MIXED` — treatment improves legibility without yielding a valid Alcohol
  candidate, or results differ by crop side or case.

## Safety vetoes

- Any new false reliable read fails the experiment regardless of recall gain.
- No production trigger, reselection, PSM, preprocessing, model, parser, threshold,
  ranking, Brand, or Government Warning change.
- This experiment does not authorize Stage 2 trigger expansion.

## Disclosures

Two honesty disclosures about how the harness implemented the above. Neither
changes the recorded outcome, and both are stated so the artifact is not read as
stronger than it is.

1. **The automated safety veto was weaker than the stated rule.** The harness's
   `anyHighConfWrongIntroduced` check used `truth_in_raw` as a proxy for candidate
   correctness rather than comparing the parsed candidate value to truth. Every
   `OBSERVED` treatment candidate was therefore verified manually against manifest
   truth; all matched exactly (13.8 / 14 / 13.5 / 12). The proxy returned the
   correct answer here but should be replaced with a parsed-value equality check in
   any successor experiment.

2. **Crop rectangles were re-derived, not loaded.** The harness recomputed crop
   rectangles from the same constants (`0.44` width fraction, `72px` minimum)
   rather than reading `crop-geometry.json` from the geometry audit. The values
   match, but this is a re-derivation and a successor experiment should load the
   frozen rectangles directly to remove the possibility of drift.

## Interpretation boundaries

This is a mechanism-existence test on five cases. It supports no rate claim, no
prevalence estimate, and no conclusion about the 45 `NOT_OBSERVED` cases where
these templates actually run in production today.
