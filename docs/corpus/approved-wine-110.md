# Approved-Wine Corpus Acquisition (110 screenshots)

This document records a **bounded corpus-acquisition slice**: 110 author-provided
screenshots of previously approved wine-label artwork, ingested into the fixture
corpus as governed **inventory**. It is provenance and identity only.

- **No expected-answer annotations** exist yet (no brand, alcohol, varietal,
  appellation, vintage, net-contents, or domestic/imported facts).
- **No representative-accuracy claim** is made; this is not a measurement
  baseline (see issue #15).
- **No OCR tuning, production-extraction, rule, or parser change** is in this
  slice.
- **No mandatory 110-image OCR run** in CI — every record is disabled from
  real-OCR regression, awaiting annotation and an evaluation-split assignment.

## Composition

- **110 independent approved-label screenshots**, one per fixture directory
  `tests/fixtures/precheck/approved-wine-NNN/`.
- **55 red** (`approved-wine-001`–`approved-wine-055`) and **55 white**
  (`approved-wine-056`–`approved-wine-110`), per author classification.
- Mixed source formats preserved byte-for-byte: **82 JPEG, 28 PNG**. The
  committed filename keeps the true extension (`label.jpeg` or `label.png`).

## Provenance

Each record is an **author-provided screenshot of previously approved wine-label
artwork. Original external source bytes and public-record metadata were not
retained in this ingestion step. Approval status is author-reported and has not
been independently reverified by the ingestion script.**

The corpus does **not** claim the screenshot is the original designer artwork,
the original government-hosted asset, original resolution, domestic origin, a
specific TTB identifier, or representativeness of all wine labels. `sourceAuthority`
is `author-provided-local-acquisition`; `publicRecordId` is `null`.

## Screenshot vs. source vs. synthetic

- **Screenshot (this slice):** a real, independent approved label captured as a
  screenshot — `sourceStratum: approved_artwork_screenshot`,
  `independence: independent_real_label`.
- **Source asset / derivative** (M Cellars): a screened crop of a public record
  and its deterministic derivative.
- **Synthetic** (existing): constructed OCR token lines, no image.

## Reproducible ingestion

`scripts/fixtures/ingest-approved-wine.mjs` enumerates `wine label <n>.(jpeg|jpg|png)`
for n = 1..110 in `~/Downloads` (numeric suffix is **not** part of fixture
identity), validates signature/dimensions/non-emptiness, copies each file
byte-for-byte, runs a bounded automated privacy metadata scan (no OCR), and
writes the inventory and the 110 candidate corpus-index entries.

Verify identities: `npx vitest run src/fixtures/approved-wine-ingest.test.ts`.

## Truth-label boundary

Every candidate carries the unaltered truth-label prohibition and `expectations:
null`. Production code never imports the corpus index or the inventory
(`src/fixtures/truth-boundary.test.ts`). Any future expected values reach only
downstream rules through the declared-facts contract — never the extractor.

## Awaiting a later bounded slice

- **Second-pass annotation**: assign per-record expected brand/alcohol
  observation states and required tokens (no answers are invented here).
- **Split assignment**: `development` / `validation` / `holdout`
  (`splitStatus` is currently `unassigned` for all 110).
- **Multi-panel mapping**: the author reports ~10 front/back / divided-information
  screenshots; exact fixture ids are not yet supplied
  (`multiPanelStatus: unmapped`). See the review queue.
- **Decimal-comma mapping**: some labels use `13,0` instead of `13.0`; exact
  fixture ids are not yet supplied (`decimalCommaStatus: unmapped`). No parser
  change and no expected alcohol values are added here.
- **Non-wine sentinels**: three non-wine samples are **explicitly excluded** from
  this branch (their exact filenames were not provided).

## Privacy screening

An automated byte/metadata scan (embedded email/phone-like strings) ran during
ingestion; 0 files were quarantined. Pixel-level visual screening relies on the
author's attestation that these are approved-label artwork and is flagged for
second-pass review (`privacyReviewStatus:
screenshot-metadata-screened-author-attested`). No OCR dump was generated or
committed as screening evidence.

## Exact source → fixture mapping

| Fixture id | Original Downloads filename | Color | Media type | Dimensions |
|---|---|---|---|---|
| approved-wine-001 | `wine label 01.png` | red | image/png | 975×1500 |
| approved-wine-002 | `wine label 02.png` | red | image/png | 975×1500 |
| approved-wine-003 | `wine label 03.png` | red | image/png | 1350×1650 |
| approved-wine-004 | `wine label 04.png` | red | image/png | 1350×1650 |
| approved-wine-005 | `wine label 05.png` | red | image/png | 1500×1140 |
| approved-wine-006 | `wine label 06.png` | red | image/png | 1506×865 |
| approved-wine-007 | `wine label 07.jpeg` | red | image/jpeg | 720×1168 |
| approved-wine-008 | `wine label 08.png` | red | image/png | 1034×1264 |
| approved-wine-009 | `wine label 09.png` | red | image/png | 1054×1280 |
| approved-wine-010 | `wine label 10.jpeg` | red | image/jpeg | 620×704 |
| approved-wine-011 | `wine label 11.png` | red | image/png | 790×1080 |
| approved-wine-012 | `wine label 12.jpeg` | red | image/jpeg | 900×1200 |
| approved-wine-013 | `wine label 13.jpeg` | red | image/jpeg | 1000×1429 |
| approved-wine-014 | `wine label 14.jpeg` | red | image/jpeg | 1483×1863 |
| approved-wine-015 | `wine label 15.jpeg` | red | image/jpeg | 406×400 |
| approved-wine-016 | `wine label 16.png` | red | image/png | 1157×895 |
| approved-wine-017 | `wine label 17.png` | red | image/png | 400×539 |
| approved-wine-018 | `wine label 18.png` | red | image/png | 1080×1305 |
| approved-wine-019 | `wine label 19.png` | red | image/png | 820×1104 |
| approved-wine-020 | `wine label 20.png` | red | image/png | 1017×1160 |
| approved-wine-021 | `wine label 21.jpeg` | red | image/jpeg | 900×975 |
| approved-wine-022 | `wine label 22.png` | red | image/png | 555×560 |
| approved-wine-023 | `wine label 23.png` | red | image/png | 988×1253 |
| approved-wine-024 | `wine label 24.jpeg` | red | image/jpeg | 1812×1819 |
| approved-wine-025 | `wine label 25.jpeg` | red | image/jpeg | 912×1220 |
| approved-wine-026 | `wine label 26.png` | red | image/png | 650×1174 |
| approved-wine-027 | `wine label 27.jpeg` | red | image/jpeg | 976×1126 |
| approved-wine-028 | `wine label 28.jpeg` | red | image/jpeg | 993×828 |
| approved-wine-029 | `wine label 29.jpeg` | red | image/jpeg | 720×932 |
| approved-wine-030 | `wine label 30.jpeg` | red | image/jpeg | 720×932 |
| approved-wine-031 | `wine label 31.jpeg` | red | image/jpeg | 646×1171 |
| approved-wine-032 | `wine label 32.jpeg` | red | image/jpeg | 1888×2200 |
| approved-wine-033 | `wine label 33.jpeg` | red | image/jpeg | 2475×1200 |
| approved-wine-034 | `wine label 34.jpeg` | red | image/jpeg | 1447×2747 |
| approved-wine-035 | `wine label 35.png` | red | image/png | 557×471 |
| approved-wine-036 | `wine label 36.jpeg` | red | image/jpeg | 722×960 |
| approved-wine-037 | `wine label 37.jpeg` | red | image/jpeg | 608×1130 |
| approved-wine-038 | `wine label 38.jpeg` | red | image/jpeg | 591×503 |
| approved-wine-039 | `wine label 39.png` | red | image/png | 606×768 |
| approved-wine-040 | `wine label 40.png` | red | image/png | 401×717 |
| approved-wine-041 | `wine label 41.png` | red | image/png | 1192×1598 |
| approved-wine-042 | `wine label 42.png` | red | image/png | 1000×700 |
| approved-wine-043 | `wine label 43.jpeg` | red | image/jpeg | 825×1050 |
| approved-wine-044 | `wine label 44.jpeg` | red | image/jpeg | 1516×2224 |
| approved-wine-045 | `wine label 45.jpeg` | red | image/jpeg | 525×600 |
| approved-wine-046 | `wine label 46.jpeg` | red | image/jpeg | 714×1295 |
| approved-wine-047 | `wine label 47.jpeg` | red | image/jpeg | 1831×1200 |
| approved-wine-048 | `wine label 48.png` | red | image/png | 822×942 |
| approved-wine-049 | `wine label 49.jpeg` | red | image/jpeg | 1775×2384 |
| approved-wine-050 | `wine label 50.jpeg` | red | image/jpeg | 686×889 |
| approved-wine-051 | `wine label 51.jpeg` | red | image/jpeg | 1236×954 |
| approved-wine-052 | `wine label 52.jpeg` | red | image/jpeg | 2250×2250 |
| approved-wine-053 | `wine label 53.jpeg` | red | image/jpeg | 1252×840 |
| approved-wine-054 | `wine label 54.jpeg` | red | image/jpeg | 1016×1078 |
| approved-wine-055 | `wine label 55.jpeg` | red | image/jpeg | 587×839 |
| approved-wine-056 | `wine label 56.jpeg` | white | image/jpeg | 493×669 |
| approved-wine-057 | `wine label 57.jpeg` | white | image/jpeg | 487×664 |
| approved-wine-058 | `wine label 58.jpeg` | white | image/jpeg | 908×1064 |
| approved-wine-059 | `wine label 59.jpeg` | white | image/jpeg | 457×588 |
| approved-wine-060 | `wine label 60.jpeg` | white | image/jpeg | 514×551 |
| approved-wine-061 | `wine label 61.jpeg` | white | image/jpeg | 1700×2200 |
| approved-wine-062 | `wine label 62.jpeg` | white | image/jpeg | 2550×3300 |
| approved-wine-063 | `wine label 63.jpeg` | white | image/jpeg | 378×497 |
| approved-wine-064 | `wine label 64.jpeg` | white | image/jpeg | 378×497 |
| approved-wine-065 | `wine label 65.jpeg` | white | image/jpeg | 378×497 |
| approved-wine-066 | `wine label 66.jpeg` | white | image/jpeg | 709×945 |
| approved-wine-067 | `wine label 67.jpeg` | white | image/jpeg | 709×945 |
| approved-wine-068 | `wine label 68.jpeg` | white | image/jpeg | 709×945 |
| approved-wine-069 | `wine label 69.jpeg` | white | image/jpeg | 822×1110 |
| approved-wine-070 | `wine label 70.jpeg` | white | image/jpeg | 797×1683 |
| approved-wine-071 | `wine label 71.jpeg` | white | image/jpeg | 702×1521 |
| approved-wine-072 | `wine label 72.jpeg` | white | image/jpeg | 677×1392 |
| approved-wine-073 | `wine label 73.jpeg` | white | image/jpeg | 670×1385 |
| approved-wine-074 | `wine label 74.jpeg` | white | image/jpeg | 786×1619 |
| approved-wine-075 | `wine label 75.jpeg` | white | image/jpeg | 879×1409 |
| approved-wine-076 | `wine label 76.jpeg` | white | image/jpeg | 503×924 |
| approved-wine-077 | `wine label 77.jpeg` | white | image/jpeg | 584×437 |
| approved-wine-078 | `wine label 78.jpeg` | white | image/jpeg | 727×513 |
| approved-wine-079 | `wine label 79.jpeg` | white | image/jpeg | 411×593 |
| approved-wine-080 | `wine label 80.jpeg` | white | image/jpeg | 418×594 |
| approved-wine-081 | `wine label 81.jpeg` | white | image/jpeg | 366×454 |
| approved-wine-082 | `wine label 82.jpeg` | white | image/jpeg | 978×1246 |
| approved-wine-083 | `wine label 83.jpeg` | white | image/jpeg | 447×927 |
| approved-wine-084 | `wine label 84.jpeg` | white | image/jpeg | 260×679 |
| approved-wine-085 | `wine label 85.jpeg` | white | image/jpeg | 414×464 |
| approved-wine-086 | `wine label 86.jpeg` | white | image/jpeg | 385×411 |
| approved-wine-087 | `wine label 87.jpeg` | white | image/jpeg | 1968×2016 |
| approved-wine-088 | `wine label 88.jpeg` | white | image/jpeg | 521×543 |
| approved-wine-089 | `wine label 89.jpeg` | white | image/jpeg | 495×517 |
| approved-wine-090 | `wine label 90.jpeg` | white | image/jpeg | 558×531 |
| approved-wine-091 | `wine label 91.jpeg` | white | image/jpeg | 303×598 |
| approved-wine-092 | `wine label 92.jpeg` | white | image/jpeg | 370×599 |
| approved-wine-093 | `wine label 93.jpeg` | white | image/jpeg | 674×1122 |
| approved-wine-094 | `wine label 94.jpeg` | white | image/jpeg | 664×1122 |
| approved-wine-095 | `wine label 95.jpeg` | white | image/jpeg | 438×324 |
| approved-wine-096 | `wine label 96.jpeg` | white | image/jpeg | 834×1017 |
| approved-wine-097 | `wine label 97.jpeg` | white | image/jpeg | 835×1016 |
| approved-wine-098 | `wine label 98.jpeg` | white | image/jpeg | 272×228 |
| approved-wine-099 | `wine label 99.jpeg` | white | image/jpeg | 665×1122 |
| approved-wine-100 | `wine label 100.jpeg` | white | image/jpeg | 591×946 |
| approved-wine-101 | `wine label 101.jpeg` | white | image/jpeg | 826×901 |
| approved-wine-102 | `wine label 102.jpeg` | white | image/jpeg | 377×586 |
| approved-wine-103 | `wine label 103.jpeg` | white | image/jpeg | 711×1005 |
| approved-wine-104 | `wine label 104.jpeg` | white | image/jpeg | 983×1048 |
| approved-wine-105 | `wine label 105.png` | white | image/png | 975×1140 |
| approved-wine-106 | `wine label 106.png` | white | image/png | 975×1140 |
| approved-wine-107 | `wine label 107.png` | white | image/png | 1500×1140 |
| approved-wine-108 | `wine label 108.png` | white | image/png | 1500×1140 |
| approved-wine-109 | `wine label 109.png` | white | image/png | 543×748 |
| approved-wine-110 | `wine label 110.jpeg` | white | image/jpeg | 900×1200 |
