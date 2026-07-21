# Phase 0 — evidence path and available-data assessment

Base `c2412b4`. Read-only inspection. Nothing was executed except reading
committed files.

## The geometry path, as it exists in production

| Concern | Where | What it gives us |
|---|---|---|
| Pass planning | `src/pipeline/extractor/regions.ts` — `planPrimaryOcrPass`, `planRecoveryOcrPasses`, `MAX_TOTAL_PASSES = 5` | which passes exist, and why |
| Pass execution | `src/pipeline/extractor/regions.ts` — `runOcrPass` → `preprocess` | crop → rotate → scale → grayscale/normalise |
| Crop and rotation transform | `RegionTransform` (`extractor.types.ts:71`) | **`crop` is already in original-image coordinates**, plus `rotate` (0/90/180/270), `scale`, `originalWidth`, `originalHeight` |
| Inverse geometry mapping | `src/pipeline/extractor/geometry.ts` — `mapBoxToOriginalGeometry` (exported, pure, deterministic) | maps any OCR box from preprocessed space back to the canonical frame |
| OCR word boxes | `OcrWord.bbox` (preprocessed space) + `OcrWord.originalGeometry` (canonical frame, populated per pass) | word geometry in both frames |
| Reconstructed lines | `src/pipeline/extractor/field-selection.ts` — `lines()` (private) | line grouping |
| Pass provenance | `RegionOcrResult.passId / passKind / triggerReasons / preprocessing` | pass identity and trigger |
| Pass contribution | `CaseDiagnostics.recoveryPasses`, `finalSelectionPasses`, `brandPrimary*` / `brandRecovery*` booleans | whether a pass fed the final brand candidate set |
| Canonical coordinates | `EvidenceGeometry.imageWidth / imageHeight` | the reference frame is carried with every mapped box |

**The pass footprint needs no reconstruction.** `transform.crop` is stated in
original-image coordinates, so pass-vs-region area coverage is a direct rectangle
intersection. No inverse mapping is required for requirement 1.

## What the committed reports already contain

`docs/extraction-full-corpus/extractor-report.json`
(`schemaVersion: extraction-baseline-report.v5`, 115 cases, 247 pass records,
19.1 MB) carries per case, under `diagnostics.regions[]`:

```
passId · regionName · passKind · triggerReasons · rotate · crop ·
transformedSize · wordCount · rawWordCount · discardedWordCount · timings ·
sampleWords[]
```

and each `sampleWords[]` entry carries `text`, `confidence`, `bbox`, and
`originalGeometry` in canonical coordinates.

**Currency check.** The report was last regenerated on 2026-07-18 (#132). The
brand path in `src/pipeline/extractor/field-selection.ts` last changed on 2026-07-20 (#151), which was
an alcohol-only change. Its brand figures corroborate the current behaviour
exactly — `brandExactMatchRate` 0.2673 × 101 determinate = **27**,
`brandNormalizedAcceptableRate` × 101 = **29**, `brandTop3Recall` × 101 = **33**,
and `brandFailureCounts["ocr-recognition-failure"]` = **24**. These match the
independently measured E3 population exactly.

## Verdict: **partially sufficient. Phase 2 cannot be completed from committed data alone.**

### Sufficient today — requirement 1 (pass-image coverage)

Pass footprints (`crop` in canonical coordinates), rotation, `transformedSize`,
pass kind, trigger reasons, and pass-contribution flags are all present for all
115 cases and all 247 executed passes. **Coverage ratios and the fixed 90 %
classification can be computed with no OCR rerun.**

### Not sufficient — requirements 2 and 3 (word overlap, recognition/segmentation)

Three specific gaps:

1. **Word geometry is truncated.** `sampleWords` is capped at 25 words per region
   (`MAX_SAMPLE_WORDS_PER_REGION` in `src/fixtures/eval/eval-harness.ts`). **229 of 247 regions are
   truncated**; the corpus contains **20 871** OCR words but at most ~6 175 are
   preserved. Requirement 2 asks for *every* word whose centre lies inside the
   region and *every* word with ≥ 50 % box overlap — a brand-region word can
   trivially fall outside a 25-word sample, and the sample is not selected by
   position.
2. **Word-to-line membership is not preserved.** `brandLineTexts` gives line text
   (capped at 12 lines) but no word → line index and no line geometry. Requirement
   2 asks for reconstructed-line membership and the orientation of overlapping
   lines.
3. **`scale` is not recorded on the region entry.** It is derivable from
   `transformedSize` and the rotated crop, and `originalGeometry` is already
   mapped, so this is minor — but it should be recorded rather than inferred.

### A fourth issue: the committed pass set may be stale for *some* cases

Recovery passes are planned when brand **or alcohol** is `NOT_OBSERVED`. For all
13 primary cases brand is `AMBIGUOUS`, not `NOT_OBSERVED`, so **any recovery pass
they ran was triggered by alcohol**. PRs #150 and #151 improved alcohol
recognition after this report was generated, so some cases that previously needed
alcohol recovery may no longer plan it. Committed footprints could therefore
*over-state* today's coverage for those cases.

In the committed report the 13 primary cases show 1 pass (4 cases), 3 passes
(6 cases), and 4 passes (3 cases). The 4 single-pass cases are unaffected; the
9 multi-pass cases carry this risk.

## Minimum missing evidence

Per instruction, I stopped rather than starting a collection run. The minimum
needed to complete Phase 2, scoped to the **13 primary + 6 control cases only**
(19 of 115):

1. For every executed pass: `passId`, `passKind`, `triggerReasons`, full
   `RegionTransform` (`crop`, `rotate`, `scale`, `originalWidth/Height`),
   `transformedSize`.
2. For **every** OCR word in those passes (not a 25-word sample): `text`,
   `rawConfidence`, `bbox`, and `originalGeometry`.
3. Word → reconstructed-line membership and per-line geometry.
4. The pass-contribution flags already present in the report.

This is a **read-only re-execution of the passes production already plans**, on
19 fixtures, using unmodified production code. It is not a treatment, changes no
planning, and produces no new production behaviour. It re-runs OCR **because the
required evidence does not exist**, not for convenience.

**Status: subsequently run**, after the annotations were approved, so regions and
evidence were collected against the same agreed frame. It re-executed only the
passes production already plans, on unmodified production code, for the 10
approved primary cases and the 6 controls.

**What that collection then showed**, which this Phase-0 assessment could not have
known: **no recovery pass runs on any of those 16 cases today** — every one
executes a single primary pass. The staleness risk flagged above was real, and the
committed report would have credited coverage to passes that no longer execute.
See `metrics.md`.
