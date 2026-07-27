# Issue #149 bounded Brand local-contrast preregistration

- Status: frozen before the first CLAHE treatment run on this branch
- Base SHA: `2dcc26f633199ad6ff5ab71857505edfced84981`
- Date: 2026-07-27
- Design: one-variable-at-a-time, evaluation-only, default-off

## Research question

Does one deterministic local contrast operation improve bounded Brand recognition on the governed, fixed-truth real-label regions without increasing false certainty, wrong reliable reads, empty OCR, clean/high-contrast regression, or unacceptable runtime?

## Fixed corpus

The corpus is the committed `tests/fixtures/ocr-research/manifest.json` composed by the merged PR #197 research platform. Merged main currently provides:

- 10 governed real-label source fixtures;
- 11 human-approved Brand regions;
- fixed Brand truth joined only after OCR execution;
- no local-private fixtures;
- deterministic case order by fixture ID and region index.

Every case reports its source SHA-256 and its preregistered independence family. Repeated artwork and multiple regions from one source are not treated as independent:

- `la-fattoria`: `approved-wine-004`, `approved-wine-005`, and `la-fattoria-rotated`;
- `dry-cellar`: both regions from `wine-multi-artifact-04`;
- every other case has its own independence family.

A passing gain must span at least two unique source checksums and at least two independence families.

## Control

The control is the production-equivalent bounded Brand configuration:

- scale: `3`;
- padding: `3%`, minimum `4 px`;
- resize interpolation: Sharp cubic;
- grayscale: Sharp grayscale;
- global contrast: Sharp `normalise`;
- local contrast: none;
- threshold: none;
- sharpening: none;
- inversion: false;
- denoising: none;
- PSM: `11`;
- rotation: `0`;
- crop source: governed Brand region executed through the production-equivalent seller-region pass;
- OCR: local `tesseract.js`, English, OEM 1, cache disabled;
- production Brand grouping, filtering, ranking, reliability, and authority thresholds.

## Treatment

The treatment differs only in configuration field `localContrast`:

```json
{
  "control": "none",
  "treatment": "clahe-3x3-slope-3"
}
```

The treatment is the repository-installed Sharp 0.35.3 API:

```ts
pipeline.clahe({
  width: 3,
  height: 3,
  maxSlope: 3,
});
```

The installed `ClaheOptions` type accepts these exact integer parameters. No compatibility substitution is needed.

Ordering is frozen as:

1. crop and optional explicit rotation;
2. 3× cubic resize;
3. grayscale;
4. global `normalise`;
5. treatment-only CLAHE;
6. optional denoising (fixed to none);
7. optional sharpening (fixed to none);
8. optional inversion and thresholding (both fixed to none);
9. PNG encoding and OCR.

CLAHE and sharpening are mutually exclusive in the experiment schema. No parameter sweep, adaptive selection, alternate local-contrast method, or second treatment is allowed.

## Hypothesis

Fixed 3× scaling and mild sharpening both failed to recover Brand truth. CLAHE may improve local edge separation where pale strokes, gradients, anti-aliasing, or uneven label tone survive global normalization. It may instead amplify texture, shadows, outlines, compression noise, or line boundaries, merge characters, erode thin strokes, or produce empty OCR. The treatment is useful only if recognition or candidate recall improves across independent source families while all safety and latency gates hold.

## Frozen metrics

Per case:

- fixture and region IDs;
- expected Brand truth, source checksum, and independence family;
- crop and both preprocessed artifact paths;
- raw OCR words and transcript;
- complete kept-candidate list and top three;
- selected and normalized selected candidate;
- mean OCR confidence and selected evidence score;
- reliability, authority state, and failure classification;
- exact and normalized correctness;
- raw, candidate-list, and top-three truth recall;
- empty OCR, latency, RSS, visual slices, output change, improvement, and regression;
- control and treatment behavior hashes;
- one primary mechanism classification for every changed case.

Aggregate and slice metrics:

- exact and normalized top-one accuracy;
- raw OCR, candidate-list, and top-three truth recall;
- false reliable reads and rate;
- wrong reliable reads;
- empty OCR and rate;
- correct-but-conservative count;
- OCR recognition-miss count;
- grouping/ranking-miss count;
- median and p95 latency;
- median RSS delta where available;
- 95% Wilson intervals;
- improvement and regression checksum/independence families.

## Success criteria

`ADOPT_FOR_LARGER_EVALUATION` is allowed only when all are true in both the primary and deterministic repeat:

1. at least 2 governed regions improve;
2. improved cases span at least 2 unique source checksums;
3. improved cases span at least 2 independence families;
4. normalized top-one accuracy improves;
5. candidate-list or top-three truth recall improves;
6. no previously normalized-correct case regresses;
7. false reliable reads remain zero;
8. wrong reliable reads remain zero;
9. empty OCR does not increase;
10. no clean-background or high-contrast case loses normalized correctness, raw/candidate/top-three recall, or becomes empty after non-empty control;
11. treatment median latency is no more than 130% of paired control;
12. treatment p95 latency is no more than 140% of paired control;
13. primary and repeat control/treatment behavior hashes match;
14. configuration isolation reports only `localContrast`;
15. seller truth remains outside OCR execution;
16. no production code path changes.

## Kill criteria

The deterministic decision is `KILL` if any are true:

- zero or one governed region improves;
- gains occur in only one source checksum or one independence family;
- neither normalized top-one nor candidate-list/top-three recall improves;
- a false or wrong reliable read appears;
- empty OCR increases;
- a previously correct case regresses;
- a clean-background or high-contrast case materially regresses under the definition above;
- either paired run exceeds either latency ceiling;
- treatment changes anything besides `localContrast`;
- CLAHE and sharpening are combined;
- seller truth reaches OCR or preprocessing;
- either arm's behavior hash changes on repeat;
- a production OCR path or the PR #195 baseline changes.

If no kill criterion fires but the complete success gate cannot be evaluated because governed cases or required visual/checksum-family metadata are missing, the decision is `INCONCLUSIVE_CORPUS_EXPANSION_REQUIRED`, with the missing slices or families named exactly.

Criteria and parameters must not be weakened after treatment output is observed.

## Mechanism classification

Every changed case receives exactly one:

- `CLAHE_RECOVERED_CHARACTER`
- `CLAHE_RECOVERED_WORD`
- `CLAHE_IMPROVED_CANDIDATE_GENERATION`
- `CLAHE_IMPROVED_RANKING`
- `CLAHE_CHANGED_CONFIDENCE_ONLY`
- `CLAHE_AMPLIFIED_BACKGROUND_TEXTURE`
- `CLAHE_MERGED_CHARACTERS`
- `CLAHE_ERODED_THIN_STROKES`
- `CLAHE_CREATED_ARTIFACT`
- `CLAHE_CAUSED_EMPTY_OCR`
- `CLAHE_NO_MEANINGFUL_EFFECT`
- `UNDETERMINED`

Paired-artifact review may discuss local edge contrast, thin strokes, textured backgrounds, label gradients, shadows/outlines, anti-aliasing, punctuation, character merging, background amplification, and line separation. Transcript movement alone is not causal evidence.
