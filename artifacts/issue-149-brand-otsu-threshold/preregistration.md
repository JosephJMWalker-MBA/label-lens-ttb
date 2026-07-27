# Issue #149 bounded Brand Otsu-threshold preregistration

- Status: frozen before the first Otsu treatment OCR run on this branch
- Base SHA: `f269a3c78b1053638e2bdae36c3f9f6b29423590`
- Date: 2026-07-27
- Design: one-variable-at-a-time, evaluation-only, default-off
- Implementation ID:
  `histogram-between-class-variance-lower-tie-single-channel-v1`
- Known control behavior hash:
  `b3db6f91ea925a60aee0adc043994a5fef1e57df3cb6df03860f038cc16ffb41`

No treatment OCR output had been generated or inspected when this file was
written. Criteria, slices, implementation, and preprocessing order below must
not be changed in response to treatment output.

## Research question

Does one deterministic, automatic Otsu threshold operation improve bounded
Brand recognition on the governed fixed-truth real-label regions without
increasing false certainty, wrong reliable reads, empty OCR, clean/high-contrast
regression, or unacceptable latency?

## Implementation proof and frozen algorithm

The treatment uses the repository implementation in
`src/fixtures/ocr-research/experiment.ts`:

- `selectOtsuThreshold(grayscale: Uint8Array): number`
- `binarizeGrayscaleWithOtsu(grayscale: Uint8Array): { threshold: number; data: Buffer }`

The selector is a true global Otsu method:

1. It constructs a 256-bin unsigned histogram. Each grayscale byte increments
   exactly one bin at its intensity from 0 through 255.
2. It computes the total intensity-weighted sum
   `sum(i * histogram[i])`.
3. It visits candidate thresholds from 0 through 255. For each candidate with a
   non-empty background and foreground, it computes background and foreground
   weights and means.
4. It maximizes the unnormalized between-class variance
   `wB * wF * (meanB - meanF)^2`. Omitting the constant total-pixel denominator
   does not change the maximizing threshold.
5. It updates only when variance is strictly greater than the current maximum.
   Therefore, equal-variance ties select the first, lowest threshold.
6. Background is `value <= threshold`; foreground is `value > threshold`.
   Binarization emits one unsigned byte per input pixel: background `0`,
   foreground `255`.

The only input is the grayscale byte array. There is no window size, offset,
fixed threshold, histogram smoothing, adaptive region, inversion flag, or
post-output parameter. Empty or single-level grayscale fails closed; it is not
replaced with a fixed fallback.

Deterministic tests in `src/fixtures/ocr-research/experiment.test.ts` pin:

- a two-level histogram selecting threshold `0`;
- a multi-level histogram selecting the lower tied threshold `10`;
- repeated selection equality;
- exact binary output and split boundary;
- fail-closed behavior for empty and uniform input;
- absence of any Sharp `.threshold(...)` invocation in the Otsu branch.

Sharp 0.35.3 with libvips 8.18.3 remains installed, but Sharp thresholding is
not part of this treatment. Sharp is used only for the already-fixed crop,
rotation, cubic resize, grayscale, normalization, raw-buffer extraction, and
PNG encoding.

## Grayscale and output assumptions

Otsu is schema-gated to `grayscaleMethod: "sharp-grayscale"`. The caller
requires the realized raw image to contain exactly one channel and throws
otherwise. The threshold function receives one byte per grayscale pixel. The
custom binarizer returns a same-length one-channel byte buffer containing only
`0` and `255`; Sharp encodes that buffer as PNG without applying a threshold.

## Fixed corpus

The corpus is the committed `tests/fixtures/ocr-research/manifest.json` composed
by current main. It contains:

- 10 governed real-label source fixtures;
- 11 human-approved Brand regions;
- 10 unique source SHA-256 checksum families;
- 8 independent visual/artwork families;
- fixed Brand truth joined only after OCR execution;
- no local-private fixtures;
- deterministic order by fixture ID and region index.

Repeated artwork and multiple regions from one source remain grouped:

- `la-fattoria`: `approved-wine-004`, `approved-wine-005`, and
  `la-fattoria-rotated`;
- `dry-cellar`: both regions from `wine-multi-artifact-04`;
- all other cases have their own independence family.

The required duplicate rule is based on source checksum: a passing gain must
span at least two distinct SHA-256 checksum families. Independence-family
counts are also reported, but do not substitute for the checksum rule.

## Frozen visual slices

Assignments are inherited unchanged from merged PRs #198 and #199 and are
listed in `slice-definitions.md`. They use visible image properties, crop
dimensions, fixture identity/provenance, and existing metadata only. OCR
transcript, correctness, confidence, and treatment output are not inputs.

Composition:

- thin-stroke: 11 yes;
- bold/heavy: 4 yes, 7 no;
- contrast: 1 low, 9 high, 1 mixed;
- outline/shadow: 1 present, 10 absent;
- background: 3 textured, 8 clean;
- crop: 1 small, 6 medium, 4 large;
- layout: 4 single-line, 7 multi-line;
- orientation: 9 horizontal, 2 rotated/unknown.

## Control

The control is the production-equivalent bounded Brand configuration:

- scale: `3`;
- padding: `3%`, minimum `4 px`;
- resize: Sharp cubic;
- grayscale: Sharp grayscale;
- global contrast: Sharp `normalise`;
- local contrast: none;
- threshold: none;
- sharpening: none;
- inversion: false;
- denoising: none;
- PSM: `11`;
- rotation: `0`;
- crop source: governed Brand region;
- OCR: local `tesseract.js`, English, OEM 1, cache disabled;
- production Brand grouping, filtering, ranking, reliability, and authority
  thresholds.

## Treatment and single changed variable

The treatment differs only in configuration field `thresholdMethod`:

```json
{
  "control": "none",
  "treatment": "otsu"
}
```

There is no Sharp thresholding, fixed threshold, adaptive thresholding, CLAHE,
sharpening, inversion, or parameter tuning. Otsu is schema-incompatible with
CLAHE and sharpening. Adaptive thresholding remains represented but unsupported.

Ordering is frozen:

1. extract the governed padded crop;
2. apply the fixed explicit rotation (`0`, so no rotation);
3. resize 3× with cubic interpolation;
4. convert to one-channel grayscale;
5. apply global `normalise`;
6. local contrast (fixed to none);
7. denoising (fixed to none);
8. sharpening (fixed to none);
9. inversion (fixed to false);
10. treatment only: extract one-channel raw bytes, select the global Otsu
    threshold, and custom-binarize using `value > threshold`;
11. encode one-channel binary PNG;
12. run unchanged OCR, grouping, filtering, ranking, reliability, and authority
    logic.

Normalization remains before thresholding. Nothing is added after thresholding
except PNG encoding and unchanged OCR.

## Expected mechanism

Global binarization may separate Brand foreground from background where
anti-aliased or low-contrast strokes survive normalization. It may instead lose
thin strokes, merge or fragment characters, remove decorative outlines,
amplify texture into binary artifacts, remove punctuation, disrupt line
separation, or cause empty OCR. Transcript movement alone is not causal
evidence.

## Frozen outputs and metrics

Each case records fixture/region IDs, fixed truth, checksum and independence
families, crop and paired preprocessed artifacts, raw words/transcript,
candidate list and top three, selected/normalized candidate, confidence,
reliability, authority state, failure class, exact/normalized correctness,
raw/candidate/top-three recall, empty OCR, latency, RSS, slices, output change,
improvement/regression, behavior hashes, and one mechanism classification.

Aggregate and per-slice reports include exact and normalized top-one accuracy;
raw, candidate-list, and top-three truth recall; false reliable reads and rate;
wrong reliable reads; empty OCR and rate; correct-but-conservative count; OCR
recognition misses; grouping/ranking misses; median and p95 latency; RSS where
available; 95% Wilson intervals; and improvement/regression checksum families.

## Behavior-hash rule

The behavior hash is the platform's deterministic hash of OCR words,
transcript, candidates, selection, reliability, and failure classification; it
excludes timing, memory, artifact paths, and environment noise.

- Primary and repeat control must both equal the known hash
  `b3db6f91ea925a60aee0adc043994a5fef1e57df3cb6df03860f038cc16ffb41`.
- The first treatment run establishes the treatment behavior hash without
  altering any criterion.
- The deterministic repeat treatment must exactly equal that first treatment
  hash.
- Any mismatch is a `KILL`.

## Success criteria

`ADOPT_FOR_LARGER_EVALUATION` is allowed only if all are true in primary and
repeat:

1. at least 2 governed regions improve;
2. improved cases span at least 2 distinct source checksum families;
3. normalized top-one accuracy improves;
4. candidate-list or top-three truth recall improves;
5. no previously normalized-correct region regresses;
6. false reliable reads remain zero;
7. wrong reliable reads remain zero;
8. empty OCR does not increase;
9. no clean-background or high-contrast case materially regresses;
10. treatment median latency is no more than 125% of paired control;
11. treatment p95 latency is no more than 135% of paired control;
12. primary and repeat control/treatment behavior hashes reproduce;
13. configuration isolation reports only `thresholdMethod`;
14. Otsu is combined with neither CLAHE nor sharpening;
15. seller truth remains outside OCR execution;
16. no production OCR path or PR #195 baseline changes.

## Kill and inconclusive criteria

The deterministic decision is `KILL` if any success criterion fails, including:
zero or one improvement; only one improvement checksum family; no normalized
top-one or candidate/top-three gain; any false or wrong reliable read; increased
empty OCR; any previously correct regression; clean/high-contrast material
regression; either latency ceiling exceeded; more than thresholding changed;
Otsu combined with CLAHE or sharpening; seller truth entering OCR; a
non-reproduced behavior hash; production OCR or PR #195 baseline change; or an
Otsu implementation gate failure.

If no kill fires but the complete gate cannot be evaluated because governed
cases or required slice/checksum metadata are missing, the decision is
`INCONCLUSIVE_CORPUS_EXPANSION_REQUIRED`, naming the missing evidence.

## Mechanism classification

Every changed case receives exactly one:

- `OTSU_RECOVERED_CHARACTER`
- `OTSU_RECOVERED_WORD`
- `OTSU_IMPROVED_CANDIDATE_GENERATION`
- `OTSU_IMPROVED_RANKING`
- `OTSU_REMOVED_BACKGROUND_NOISE`
- `OTSU_LOST_THIN_STROKES`
- `OTSU_MERGED_CHARACTERS`
- `OTSU_FRAGMENTED_CHARACTERS`
- `OTSU_REMOVED_DECORATIVE_OUTLINE`
- `OTSU_CREATED_ARTIFACT`
- `OTSU_CAUSED_EMPTY_OCR`
- `OTSU_CHANGED_CONFIDENCE_ONLY`
- `OTSU_NO_MEANINGFUL_EFFECT`
- `UNDETERMINED`

Paired-artifact review may discuss only visible evidence involving
binarization, foreground/background separation, thin-stroke loss, character
merging or fragmentation, decorative outlines, texture, anti-aliasing,
punctuation, and line separation.

