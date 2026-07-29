# Preregistration — duplicate Brand crop adjudication

Refs Issue #149. **Evidence and adjudication only.** No OCR is run. No
traineddata experiment is run. No production code, fixture, fixture truth, or
prior frozen artifact is modified. Neither case is substituted, removed,
rescored, or deleted. PR #195 untouched.

This document is frozen **before** any crop is recomputed.

Base: `origin/main` `49e9e85fb034f4e8b24f90946ed9f183458a3cca`, including merged
PR #206.

## The issue

`approved-wine-004` and `la-fattoria-rotated` have byte-identical committed
approved Brand crops, sha256 `fab1b411…`, in
`artifacts/issue-149-brand-otsu-threshold/control/crops`. PR #205 recorded that
the 5/5 case-level stylization result therefore rests on four distinct images
rather than five. No corrective action has been authorized.

## Question

Why are the two crops identical, is the duplication legitimate, and what
corrected governed case set — if any — is eligible for the later stronger
Tesseract traineddata/config experiment?

## Candidate classifications

Exactly one is assigned:

- `LEGITIMATE_DUPLICATE_SOURCE` — both case IDs intentionally reference the same
  underlying image or crop.
- `COPY_OR_MAPPING_ERROR` — one crop was copied, mapped, or emitted under the
  wrong case ID.
- `DISTINCT_SOURCE_SAME_CROP` — different source images legitimately produce
  identical crop pixels.
- `STALE_ARTIFACT` — a committed crop no longer matches the current manifest,
  source image, or geometry.
- `INDETERMINATE` — evidence is insufficient.

## Evidence to be gathered, in this order

1. **Provenance trace** for both cases: governed research manifest record, the
   legacy evaluation manifest record, source image path and sha256, approved
   Brand region geometry, crop-generation source artifact, crop rectangle, crop
   sha256, commit history, and any prior annotation or adjudication record.
2. **Git history**, including pickaxe searches, to establish when each case ID,
   each source image, and each committed crop entered the repository.
3. **Recomputation**, only after this document is frozen.

## Recomputation method

The approved Brand crop is recomputed for both cases from the **current** frozen
source image and the **current** manifest geometry, using the governed crop
rectangle logic: normalized region scaled to pixels with `floor` on the left and
top edges and `ceil` on the right and bottom, then padded by
`max(minPx 4, round(dimension * ratio 0.03))` on each axis, clamped to the image
bounds. This mirrors `cropFor` in `src/fixtures/ocr-research/experiment.ts` for
the `governed-brand-region` case at `rotation: 0`.

Because the mirror is a copy of production-adjacent evaluation logic rather than
the function itself, it is **validated**: all eleven governed Brand crops are
recomputed and compared against their committed counterparts. If the mirror is
faithful, every non-suspect case reproduces byte-for-byte. Any case that does
not reproduce is reported as a candidate stale artifact rather than explained
away.

Recomputed crops are written to a **separate** directory. No committed artifact
is overwritten, and no prior frozen artifact is touched. Every source and
derived file is hashed. Committed and recomputed crops are compared both
byte-for-byte and pixel-for-pixel on decoded raw buffers.

Recomputation is deterministic: rerunning reproduces identical bytes.

## Decision rules, fixed in advance

- `LEGITIMATE_DUPLICATE_SOURCE` — preserve both historical case records, but
  count them as **one** independent image in future analysis; do not use both as
  independent treatment evidence.
- `COPY_OR_MAPPING_ERROR` — **stop.** Do not fix fixtures or artifacts in this
  PR. Document the exact correction needed for a separately reviewed follow-up.
- `DISTINCT_SOURCE_SAME_CROP` — preserve both cases, treat image independence
  cautiously, and explain why identical crop pixels occurred.
- `STALE_ARTIFACT` — **stop.** Document the stale artifact and the required
  regeneration path. Do not overwrite it here.
- `INDETERMINATE` — **block** the traineddata/config experiment until more
  provenance is available.

## Truth handling

Brand truth is excluded from crop generation and from every comparison. It may
appear **only** in a post-provenance adjudication table, and only where needed to
decide whether case identity is duplicated. No truth string influences any hash,
any crop, any pixel comparison, or the classification of the crop evidence
itself.

## Visual comparison

A human-readable artifact is produced with neutral labels only: both source
images, both approved-region overlays, both committed crops, and both recomputed
crops. No OCR transcript appears in any panel. The panels necessarily render the
label artwork itself; that is the evidence under review.

## Interpretation boundaries

- This does not revisit the blinded reader's labels.
- This does not change the historical 5/5 case-level audit result recorded in
  PR #205.
- It determines only how many **independent images** are eligible for future OCR
  experiments.
- No prevalence claim, no causal claim, no capability-ceiling claim.
- No production behavior change.

## What this authorizes

Nothing beyond producing this adjudication. Any corrective action to fixtures or
artifacts, and the later traineddata/config experiment, require separate review
and separate preregistration.
