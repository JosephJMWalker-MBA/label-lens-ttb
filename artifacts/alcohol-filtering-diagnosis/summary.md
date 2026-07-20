# Alcohol candidate-filtering diagnosis — 34 failures on the fixed 115-case corpus

**Commit:** `08ac2a7d4d2a2ab8c40b1615f75aeddb983e5085` · **Corpus:** `docs/extraction-full-corpus/extractor-report.json`
**Method:** read-only analysis of the committed report. No OCR was run, no production code changed.

## Research question

Why does Label Lens reject alcohol evidence that OCR has already read, and what is the smallest
bounded filtering change that improves parsed alcohol accuracy without increasing false certainty
or absent-alcohol false positives?

## Headline answer

The pipeline reads the alcohol statement and then rejects it at a **pre-parse gate** in
`matchAlcoholWindow` (`src/pipeline/extractor/field-selection.ts`). In every one of the 34 cases
the abstention reason is `unsupported-candidates-only` — candidates were built, then all were
refused.

Two distinct causes dominate, and they need different treatments:

1. **Format-strict rejection of complete evidence (7 cases).** The label states the percentage,
   an explicit alcohol marker, and a volume marker — all three are read — but OCR fuses the
   marker to the number (`ALC.13% BY VOL`, `ALC.12% BY VOL.`, `ALC.13.5% BYVOL`). The
   fused-prefix splitter at `field-selection.ts:577` is
   `/\ba[1il]c(?=[0-9oOil])/`, whose lookahead sees the **period**, not a digit, so it does not
   split. Every acceptance regex then fails on the missing whitespace and the window is refused
   as `unsupported-pattern`. Nothing about the evidence is weak; only its spacing is.

2. **Absent volume word (14 cases).** The read text is `14% ALC`, `ALC. 13.5%`, `12.5% ALC` —
   a percentage plus an explicit alcohol marker, but no `VOL`/`BY VOL`. These are refused by the
   volume gate at `field-selection.ts:718`.

## Rejection accounting

| Case-level filtering subtype | Cases |
|---|---|
| `alcohol-rejected-missing-volume-marker` | 26 |
| `alcohol-rejected-unsupported-pattern` | 7 |
| `alcohol-rejected-missing-explicit-alcohol-marker` | 1 |

| Rejection reason (all candidate windows in the 34) | Count |
|---|---|
| `missing-volume-marker` | 437 |
| `unsupported-pattern` | 162 |
| `missing-explicit-alcohol-marker` | 91 |
| `bare-volume-marker-too-weak` | 4 |

## Failure buckets

| # | Bucket | Cases |
|---|---|---|
| 6 | false rejection caused by a defensive filter | **7** |
| 5 | unsupported but valid statement syntax | **14** |
| 3 | token grouping/window failure | **9** |
| 1 | marker detection failure (`ABV` unrecognized) | **1** |
| 8 | no near-truth candidate in OCR (likely OCR miss / possible misclassification) | **3** |

Buckets 2, 4 and 7 did not occur. No new bucket was needed. Bucket 6 and 1 membership is taken
from the simulation (which scans every candidate window), not from a per-case heuristic, so the
counts here and in `candidate-experiments.md` agree.

## Recurring rejected patterns

- `ALC.<n>% BY VOL` / `ALC.<n>% BYVOL` — fused marker, complete evidence (bucket 6)
- `<n>% ALC` / `ALC. <n>%` — no volume word (bucket 5)
- `<n>% ABV` — `ABV` is not in the volume-marker vocabulary (bucket 1)
- `ALC.<n>% BY` / `<n>% by` — window truncated before `VOL` (bucket 3)
- `MAY CAUSE HEALTH PROBLEMS. CONTAINS SULFITES <n>%` — government-warning text merged into the
  window by the sliding-window assembler (noise, present in most cases)

Recurring OCR substitutions observed in the source tokens: `.` fused to digits (`ALC.13`),
whitespace lost inside `BYVOL`, `°` for `%` (`14° ALC.`), comma decimals (`ALC 12,5%`), and
implicit decimals (`135%` for 13.5%).

## Layout distribution

`alcohol-at-bottom` 27 · `front-label` 17 · `back-label` 15 · `alcohol-at-side-or-rotated` 7 ·
`vertical-mandatory-strip` 5 · `dense-text` 5 · `low-contrast` 3 · `low-resolution` 2

**Failures do not cluster by front/back** (17 vs 15) and **do not cluster at the edges**: 27 of 34
are ordinary bottom-positioned statements. This is not a layout-coverage problem — it is a
text-acceptance problem. That is consistent with the corpus-wide split of 34
candidate-filtering failures against only 5 OCR-recognition failures.

## Recoverability

| | Cases |
|---|---|
| Recoverable from **existing OCR output only** (measured by simulation) | **8** (6 + 1 + 1) |
| Additionally recoverable by relaxing the volume-word requirement | 12 (overlaps bucket 5; carries measured regression risk) |
| Likely to require new OCR or preprocessing | 3 (bucket 8: no near-truth candidate present) |
| True unsupported-syntax cases (no volume word anywhere in the read text) | 14 (bucket 5) |
| **New false positives on the 13 absent-alcohol cases, for E1/E2/E3** | **0** |
| Currently-correct cases contaminated by a naive volume-gate relaxation | **2** |

## Doctrine note

Bucket 5 deserves care rather than speed. On rotated and vertical-strip labels, `14% ALC` may be
a **truncated read** of `ALC 14% BY VOL` rather than the label's full text. Accepting it would
promote a statement to `OBSERVED` on incomplete evidence — the exact false-certainty risk the
volume gate exists to prevent. Bucket 6, by contrast, involves evidence that was read completely
and rejected only on spacing, so accepting it invents nothing.

## Caveat on the simulation

The recovery and control numbers come from a transcription of the production canonicalization and
acceptance regexes, not from the production code itself. They size and rank the experiments; they
are **not** a substitute for a corpus run. Any implementation must be re-measured with
`npm run eval:baseline`.
