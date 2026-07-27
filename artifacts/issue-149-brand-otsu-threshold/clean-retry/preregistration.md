# Issue #149 channel-preserving Otsu clean-retry preregistration

- Status: frozen before any governed clean-retry treatment OCR
- Date: 2026-07-27
- Base SHA: `f269a3c78b1053638e2bdae36c3f9f6b29423590`
- Branch: `codex/issue-149-brand-otsu-threshold`
- Design: one-variable-at-a-time, evaluation-only, default-off
- Selector ID:
  `histogram-between-class-variance-lower-tie-single-channel-v1`
- Output adapter ID: `rgb-rgba-alpha-preserving-png-v1`
- Known control behavior hash:
  `b3db6f91ea925a60aee0adc043994a5fef1e57df3cb6df03860f038cc16ffb41`
- Governed manifest SHA-256:
  `b6b5be1b4b97bf4bdd2c753675326e061fb38e3e523741f3a03f5eb015d2aac9`

No clean-retry treatment OCR output had been generated or inspected when this
file was written. The implementation, ordering, corpus, slices, metrics,
success criteria, kill criteria, and latency ceilings below are frozen and
must not be tuned after output is observed.

## Supersession and evidence separation

This preregistration supersedes the root `preregistration.md` only for the
clean retry. The earlier run was invalid because its one-channel raw
reconstruction stripped a fully opaque alpha channel from 7 of 11
control-equivalent PNGs. Although visible RGB was unchanged by that removal,
the run varied channel layout as well as thresholding.

The earlier run remains in the parent directory with `gate-failure.md` and
`invalid-run-record.md`. Its provisional OCR metrics, hashes, classifications,
and provisional decision are not decision evidence for this retry.

## Frozen implementation and proof

The implementation is confined to
`src/fixtures/ocr-research/experiment.ts`:

- unchanged selector:
  `selectOtsuThreshold(grayscale: Uint8Array): number`;
- unchanged one-channel reference binarizer:
  `binarizeGrayscaleWithOtsu(grayscale: Uint8Array)`;
- channel-preserving binarizer:
  `binarizeRgbOrRgbaWithOtsu(pixels, width, height, channels)`;
- PNG adapter:
  `encodeChannelPreservingOtsuPng(controlEquivalentPng)`.

Frozen source hashes at preregistration:

| File | SHA-256 |
| --- | --- |
| `src/fixtures/ocr-research/experiment.ts` | `f6f0b167cb0a15e443b92b50c4f151aacd0b1dd04acf33e2b31018cb626aa806` |
| `src/fixtures/ocr-research/brand-otsu-threshold.ts` | `07c98d66fc9e6a62796fe97eea0d8755865b1bcac45724d10cb7df879ce18cc4` |
| `src/fixtures/ocr-research/experiment.test.ts` | `a7922cca0df87e9057b38c6f9c5196eacea6e3bb60e03bb6cbea2ababdc0dc7d` |
| `src/fixtures/ocr-research/brand-otsu-threshold.test.ts` | `b42f848194d8bd604535a1fe0829c22bdd54a3eac8eaba468637d11260e431dc` |

The selector is a true global Otsu method:

1. A 256-bin `Uint32Array` histogram is constructed by incrementing the bin
   indexed by each unsigned grayscale byte.
2. The total intensity-weighted sum is
   `sum(intensity * histogram[intensity])`.
3. Candidate thresholds are visited in increasing order from 0 through 255.
   Candidates with an empty background are skipped; iteration stops when the
   foreground becomes empty.
4. For each valid split, background and foreground weights and means are used
   to calculate the unnormalized between-class variance
   `wB * wF * (meanB - meanF)^2`.
5. The best threshold changes only when variance is strictly greater than the
   current best. Equal maxima therefore select the first, lowest threshold.
6. There is no fixed fallback or hidden tunable parameter. Empty input throws
   `OTSU_REQUIRES_NON_EMPTY_GRAYSCALE`; a single-level image throws
   `OTSU_REQUIRES_AT_LEAST_TWO_GRAYSCALE_LEVELS`.

The selector itself is unchanged from the invalid run.

## Frozen RGB and RGBA semantics

The adapter accepts only a non-palette, 8-bit RGB or RGBA PNG produced by the
fixed control-equivalent preprocessing pipeline.

For every pixel, grayscale is computed only from RGB:

`floor((2126 * R + 7152 * G + 722 * B + 5000) / 10000)`.

The 256-bin Otsu histogram is built from those bytes. The comparison boundary
is frozen:

- luminance `<= threshold` becomes RGB `0,0,0`;
- luminance `> threshold` becomes RGB `255,255,255`.

For RGB input, output is RGB and no alpha is added. For RGBA input, output is
RGBA and the fourth byte of every pixel is copied byte-for-byte. Alpha is not
flattened, stripped, added, interpreted as background, or included in
luminance.

Width, height, 8-bit depth, PNG color type, sRGB space, channel count,
progressive setting, palette status, density, profile, orientation, resolution
unit, and every non-`IDAT` PNG chunk are required to match the
control-equivalent PNG. The adapter replaces only compressed `IDAT` pixel data.
It uses Sharp only to decode the already-encoded RGB/RGBA bytes and to encode
the same channel count with the harness's default PNG settings; the
progressive setting is copied and palette output is disabled. Sharp performs
no thresholding, grayscale conversion, color-space conversion, alpha
operation, flattening, inversion, CLAHE, sharpening, denoising, or adaptive or
fixed thresholding in this adapter.

Any metadata, layout, alpha, or binary-RGB mismatch throws before that case is
passed to OCR. A second pair audit compares the independently produced control
and treatment artifacts for every primary and repeat case.

## Frozen control and treatment

Both arms use:

- scale `3`;
- padding ratio `0.03`, minimum `4 px`;
- cubic resize;
- Sharp grayscale;
- Sharp global `normalise`;
- local contrast `none`;
- denoising `none`;
- sharpening `none`;
- inversion `false`;
- PSM `11`;
- rotation `0`;
- governed Brand-region crop;
- unchanged local `tesseract.js` OCR and production Brand
  grouping/filtering/ranking/reliability/authority logic.

The control has `thresholdMethod: "none"`. The treatment has
`thresholdMethod: "otsu"`. Configuration isolation must report exactly
`["thresholdMethod"]`.

No Sharp thresholding, fixed threshold, adaptive thresholding, CLAHE,
sharpening, inversion, denoising, or post-output parameter tuning is allowed.

## Frozen preprocessing order

1. Extract the governed padded crop.
2. Apply fixed explicit rotation `0`.
3. Resize 3x with cubic interpolation.
4. Apply the fixed Sharp grayscale operation used by both arms.
5. Apply Sharp global `normalise` used by both arms.
6. Apply no local contrast.
7. Apply no denoising.
8. Apply no sharpening.
9. Apply no inversion.
10. Encode the control-equivalent PNG with the fixed harness PNG defaults.
11. Control: pass that PNG unchanged to OCR.
12. Treatment only: decode RGB/RGBA without channel conversion, calculate the
    frozen RGB luminance, select the unchanged Otsu threshold, replace RGB with
    binary values, copy alpha if present, restore the exact non-image PNG
    structure, and audit isolation.
13. Run unchanged OCR and downstream Brand logic.
14. Join seller truth only after OCR for scoring.

## Frozen corpus and slices

The corpus remains the committed
`tests/fixtures/ocr-research/manifest.json`: 10 governed real-label source
fixtures, 11 human-approved Brand regions, 10 source SHA-256 checksum families,
and 8 visual/artwork independence families. Local-private fixtures are
excluded. Order remains deterministic by fixture ID and region index.

The exact source checksum families are:

- `la-fattoria-rotated`:
  `78a45dc3df09a29615ebb19687803d4c0b9e50c0ffdcea833d6cc332bd3ee4e8`;
- `approved-wine-004`:
  `02c272bc23e836befc6024a0c7fa1e3b448dc7d31b2e691cdff1f37457377aa5`;
- `approved-wine-005`:
  `4098ba3ddd706354a51ac55015aac04cd1a67a12aaa1947cfef59a523fd13ef9`;
- `approved-wine-023`:
  `ab9f888e0673afed9e08d6db30f6d5623c0c30a9bb69fc55e028ac82381fd010`;
- `approved-wine-027`:
  `76910b129a3b4e0d50892da3f9643ab699510ded8c0f61656afd2a0505a156fe`;
- `approved-wine-031`:
  `512afcf475b691396481d289dbcb461f6880cb81c03ec02e8db4a54faea6a4b2`;
- `approved-wine-035`:
  `bf0d8e4ea936e1ddc67ce265345fde413cc29080f2a0b3ba42538912e30dd035`;
- `approved-wine-085`:
  `e9c6de2e35a6f75bf1de128f8c1d2c2f0a824d52628e32fa6e003efb1bb758b6`;
- `approved-wine-091`:
  `d3518e47880e39d38cf47d4692ad3a10d194a5b56e67690ab53c0b1d2306ab73`;
- `wine-multi-artifact-04` (two regions):
  `445d39b8f73d04cd05bb35e03f9678f6ba9e81f6a6f01d5469306ec43c9c5887`.

Visual slices and independence grouping are frozen in
`slice-definitions.md`; they are unchanged from the invalid run and are based
only on source-visible properties and provenance, never OCR output.

## Frozen execution sequence and behavior hashes

The only governed sequence is:

1. primary control;
2. primary treatment;
3. repeat control;
4. repeat treatment.

Primary isolation is audited before the repeat begins. The invalid run is not
loaded or compared by the clean runner.

The primary and repeat control behavior hashes must both equal
`b3db6f91ea925a60aee0adc043994a5fef1e57df3cb6df03860f038cc16ffb41`.
The first clean treatment establishes its behavior hash; repeat treatment must
match it exactly. Timing, memory, artifact paths, and environment noise remain
excluded from behavior hashes.

## Frozen outputs and metrics

The retry writes only beneath `clean-retry/`: configurations, reports, raw
words, retained primary crop/preprocessed/transcript artifacts, repeat reports,
per-case deltas, paired images, behavior hashes, an encoded isolation audit,
mechanism review, decision, and validation evidence.

Metrics remain unchanged: exact and normalized top-one accuracy; raw,
candidate-list, and top-three truth recall; false and wrong reliable reads;
empty OCR; correct-but-conservative cases; recognition versus grouping/ranking
misses; median and p95 latency; RSS where available; Wilson intervals; slice
metrics; and improvement/regression checksum and independence families.

## Frozen success criteria

`ADOPT_FOR_LARGER_EVALUATION` requires all original criteria in both primary
and repeat:

1. at least 2 governed regions improve;
2. improvements span at least 2 source checksum families;
3. normalized top-one accuracy improves;
4. candidate-list or top-three truth recall improves;
5. no previously normalized-correct region regresses;
6. false reliable reads remain zero;
7. wrong reliable reads remain zero;
8. empty OCR does not increase;
9. no clean-background or high-contrast case materially regresses;
10. treatment median latency is at most 125% of paired control;
11. treatment p95 latency is at most 135% of paired control;
12. primary/repeat control and treatment behavior hashes reproduce;
13. configuration isolation reports only `thresholdMethod`;
14. Otsu is combined with neither CLAHE nor sharpening;
15. seller truth remains outside OCR execution;
16. production OCR paths and the PR #195 selector baseline remain unchanged;
17. the preregistered implementation proof gate passes.

The mandatory clean-retry isolation gate additionally requires every primary
and repeat pair to preserve RGB/RGBA layout, alpha bytes, dimensions, bit
depth, color space, density, exposed metadata, and non-image PNG chunks, with
treatment RGB strictly neutral binary `0` or `255`.

## Frozen kill and stop criteria

The original deterministic `KILL` rules remain unchanged: any original success
criterion failure kills the treatment. This includes insufficient independent
gain, accuracy/recall failure, reliable-read error, increased empty OCR,
regression, either latency ceiling, behavior-hash mismatch, truth leakage,
multi-variable configuration, or production/PR #195 change.

The clean retry stops without publishing a decision if any case changes
channel count, alpha, dimensions, bit depth, color space, density, metadata
handling, PNG non-image structure, or non-threshold preprocessing behavior; if
the implementation is not Otsu or deterministic; if it has hidden tunable
parameters; if Sharp threshold/channel conversion or another treatment is
active; or if production imports the evaluation-only implementation.

If no kill fires but governed case or required checksum/slice evidence is
missing, the result remains
`INCONCLUSIVE_CORPUS_EXPANSION_REQUIRED`, naming the missing evidence.

No production enablement, merge, PR #195 modification, adaptive-threshold
follow-up, or post-output tuning is authorized.

