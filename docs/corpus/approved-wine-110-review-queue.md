# Approved-Wine Corpus — Review Queue

This queue tracks per-record mapping work that requires **explicit author-provided
metadata**. Nothing here was inferred automatically during ingestion. No panel
classification, decimal-comma detection, or expected-answer annotation was
performed on the images in the acquisition slice.

## Multi-panel candidates awaiting author mapping

The author reports that 10 screenshots demonstrate front/back or
divided-information label structures. Exact fixture ids have not yet been mapped.
No automatic panel classification was performed during ingestion.

- Status field per record: `multiPanelStatus` (currently `unmapped` for all 110).
- When the exact filenames/ids are supplied, map each to its fixture id and set
  `multiPanelStatus: mapped`; add the `integrated-panels` challenge tag **only**
  when the author confirms the record actually demonstrates it.
- Do **not** stitch, split, infer panel boundaries, or convert one screenshot
  into multiple artifacts.

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

Three non-wine samples are explicitly excluded from this branch; their exact
filenames were not provided and must not be guessed.
