# Approved-Wine Corpus — Review Queue

This queue tracks per-record mapping work that requires **explicit author-provided
metadata**. Nothing here was inferred automatically during ingestion. No panel
classification, decimal-comma detection, or expected-answer annotation was
performed on the images in the acquisition slice.

## Multi-panel mapping — OBSOLETE for the 110 (corrected)

**This queue item is obsolete and has been resolved by correction, not mapping.**

_Historical reason it existed:_ during the approved-wine-110 acquisition it was
reported that ~10 of the 110 screenshots demonstrated front/back or
divided-information label structures, so a per-record `multiPanelStatus` field
was added pending an author mapping of exactly which ids.

_Correction:_ **all 110 approved-wine records are single-label examples. None of
the reported multi-artifact examples belongs inside the 110.** The 10 genuine
wine multi-artifact screenshots are a **separate challenge corpus**
(`wine-multi-artifact-01..10`), governed in
[`supplemental-challenge-and-sentinels.md`](supplemental-challenge-and-sentinels.md).

Consequently `multiPanelStatus` on the 110 stays `unmapped` and is **not
applicable** — there is nothing to map. Do not retro-tag the 110 as multi-panel.

## Decimal-comma alcohol examples awaiting author mapping

The author reports that some labels use alcohol notation such as `13,0` instead
of `13.0`. Exact fixture ids have not yet been supplied and were not detected
automatically (no OCR was run).

- Status field per record: `decimalCommaStatus` (currently `unmapped` for all 110).
- When exact ids are supplied and verified, set `decimalCommaStatus: mapped`.
- Do **not** alter parser behavior, normalize image text, or create expected
  alcohol values in this or the acquisition branch.

## Brand / alcohol annotation

All 110 records are `annotationStatus: unannotated`. A later bounded slice must
assign expected observation states and required tokens per record without
inventing answers.

## Evaluation-split assignment

All 110 records are `splitStatus: unassigned`. Development / validation / holdout
assignment is a later bounded slice.

## Non-wine sentinels

Non-wine samples are **not** part of the approved-wine 110. The agave-spirit,
ale, and single-malt-whiskey **category sentinels** (nine files) are now
governed as a separate stratum — see
[`supplemental-challenge-and-sentinels.md`](supplemental-challenge-and-sentinels.md).
They are inventory-only scope-boundary sentinels; no beverage category beyond
wine is implemented.
