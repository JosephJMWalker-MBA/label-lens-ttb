# Supplemental Corpus — Wine Multi-Artifact Challenge & Category Sentinels

This document records a **bounded corpus-organization slice** that adds two
small, governed strata kept **separate** from the single-image approved-wine-110
benchmark:

- **10 wine multi-artifact challenge screenshots** — each one committed
  screenshot that shows **multiple visible label panels or divided package
  information**;
- **9 out-of-scope category sentinels** — non-wine labels (agave spirit, ale,
  single-malt whiskey) for future scope-boundary testing.

It is acquisition, identity, provenance, documentation, and governance only.
**No** OCR tuning, expected answers, annotations, multi-image production intake,
or beverage-category implementation occurred.

## What these are — and are not

### Wine multi-artifact challenge (10)

- A **separate challenge corpus**, not part of the 110-label single-image
  benchmark, and never counted toward it.
- Each is **one preserved source image** that happens to show multiple visible
  label panels / divided package information. It is **not** multiple uploaded
  files, and it was **not** stitched, split, cropped, or assigned front/back
  identities. Panel boundaries were **not** inferred.
- `role: wine_multi_artifact_candidate`, `beverageCategory: wine`,
  `measurementEligibility: [challenge_inventory]`, `expectations: null`,
  `annotationStatus: unannotated`, `splitStatus: unassigned`, disabled from
  mandatory real-OCR CI.
- No production multi-image workflow has been implemented.

### Category sentinels (9)

- **Out-of-scope, non-wine** records: 3 agave spirit, 3 ale, 3 single-malt
  whiskey. Their purpose is **future scope-boundary testing** — to verify that,
  once an intake-classification step exists, unsupported beverage categories are
  not silently treated as domestic wine.
- They are **not** agave/beer/whiskey evaluation sets, **not** evidence those
  categories are implemented, **not** suitable for category-accuracy claims, and
  are **never** run through the current domestic-wine rules in this branch.
- `role: category_sentinel`, `beverageCategory` = the out-of-scope class
  (`agave_spirit` / `ale` / `single_malt_whiskey`),
  `measurementEligibility: [sentinel_inventory]`, `expectations: null`, disabled
  from mandatory real-OCR CI.
- **No new beverage category has been implemented.** The non-wine
  `beverageCategory` values exist only as evaluation metadata and are constrained
  by role in the schema so ordinary wine fixtures cannot become non-wine and
  sentinels cannot pretend to be wine.

## Provenance

The corpus claims **only**:

> Author-provided public-registry screenshot or downloaded display derivative of
> previously approved label artwork. The delivered PNG/JPEG format may differ
> from the original applicant-submitted format.

Additionally: original external source bytes and public-record metadata were not
retained; approval status is author-reported and **not** independently
reverified. `sourceAuthority: author-provided-local-acquisition`,
`publicRecordId: null`. No fabricated TTB/public-record id was introduced.

## Privacy screening

Ingestion ran a bounded scan over **text-bearing metadata only** (PNG
`tEXt/iTXt/zTXt/eXIf`, JPEG `APPn/COM`) for email/phone patterns — **no OCR**.
All 19 metadata regions were clean; 0 quarantined. (An early raw-byte scan
flagged one file, but the match was inside compressed pixel data — a binary
coincidence, not readable metadata.) Pixel-level visual screening relies on
author attestation and is queued for second-pass human review, consistent with
the approved-wine-110 policy.

## Bytes preserved exactly

Each source file was copied **byte-for-byte** into `label.<true-extension>`
(`label.png` or `label.jpeg`). No convert, resize, crop, rotate, or recompress.
Committed hashes equal the Downloads originals (11 PNG, 8 JPEG).

## Truth-label boundary

Every record carries the unaltered truth-label prohibition and `expectations:
null`. Production code never imports the corpus index or either inventory
(`src/fixtures/truth-boundary.test.ts`).

## Inventory & reproducible ingestion

- Identity/provenance inventory: `tests/fixtures/precheck/supplemental-corpus-inventory.json`.
- Reproducible script: `scripts/fixtures/ingest-supplemental-corpus.mjs`
  (preflights all 19, validates signatures, preserves bytes, writes the
  inventory, and appends corpus-index entries without disturbing existing ones).
- Verify: `node scripts/fixtures/ingest-supplemental-corpus.mjs --verify` and
  `npx vitest run src/fixtures/supplemental-corpus.test.ts`.

## Awaiting later bounded slices

- **Wine multi-artifact**: package-level design and annotation (which panels,
  which fields) — deliberately not attempted here.
- **Sentinels**: an intake-classification step and honest unsupported-category
  behavior — not implemented here.
- No development/validation/holdout split is assigned to any of the 19.

## Exact source → fixture mapping

| Fixture id | Original Downloads filename | Group | Media type | Dimensions | Bytes |
|---|---|---|---|---|---|
| wine-multi-artifact-01 | `wine-multi-artifact-01.png` | wine multi-artifact | image/png | 638×1306 | 1371908 |
| wine-multi-artifact-02 | `wine-multi-artifact-02.png` | wine multi-artifact | image/png | 532×1676 | 1210101 |
| wine-multi-artifact-03 | `wine-multi-artifact-03.png` | wine multi-artifact | image/png | 620×1568 | 541340 |
| wine-multi-artifact-04 | `wine-multi-artifact-04.png` | wine multi-artifact | image/png | 674×1522 | 778791 |
| wine-multi-artifact-05 | `wine-multi-artifact-05.png` | wine multi-artifact | image/png | 1096×1226 | 1001392 |
| wine-multi-artifact-06 | `wine-multi-artifact-06.png` | wine multi-artifact | image/png | 816×1276 | 361029 |
| wine-multi-artifact-07 | `wine-multi-artifact-07.png` | wine multi-artifact | image/png | 400×1554 | 499047 |
| wine-multi-artifact-08 | `wine-multi-artifact-08.png` | wine multi-artifact | image/png | 610×1224 | 499564 |
| wine-multi-artifact-09 | `wine-multi-artifact-09.png` | wine multi-artifact | image/png | 660×1330 | 274529 |
| wine-multi-artifact-10 | `wine-multi-artifact-10.png` | wine multi-artifact | image/png | 832×1186 | 519591 |
| category-sentinel-agave-spirit-01 | `agave-spirit-label-01.jpeg` | sentinel:agave_spirit | image/jpeg | 2381×2380 | 1163609 |
| category-sentinel-agave-spirit-02 | `agave-spirit-label-02.jpeg` | sentinel:agave_spirit | image/jpeg | 1920×1506 | 986122 |
| category-sentinel-agave-spirit-03 | `agave-spirit-label-03.jpeg` | sentinel:agave_spirit | image/jpeg | 1800×1200 | 313309 |
| category-sentinel-ale-01 | `ale-label-01.jpeg` | sentinel:ale | image/jpeg | 3453×3453 | 748311 |
| category-sentinel-ale-02 | `ale-label-02.jpeg` | sentinel:ale | image/jpeg | 1163×678 | 454983 |
| category-sentinel-ale-03 | `ale-label-03.jpeg` | sentinel:ale | image/jpeg | 717×753 | 593894 |
| category-sentinel-single-malt-whiskey-01 | `single-malt-whiskey-label-01.jpeg` | sentinel:single_malt_whiskey | image/jpeg | 1033×644 | 150813 |
| category-sentinel-single-malt-whiskey-02 | `single-malt-whiskey-label-02.png` | sentinel:single_malt_whiskey | image/png | 944×1444 | 338554 |
| category-sentinel-single-malt-whiskey-03 | `single-malt-whiskey-label-03.jpeg` | sentinel:single_malt_whiskey | image/jpeg | 937×593 | 213515 |
