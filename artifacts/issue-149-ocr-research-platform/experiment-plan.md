# OCR experiment program

## Platform contract

Each experiment declares:

- one field track: Brand, Government Warning, or Alcohol;
- one crop source;
- control and treatment configurations;
- exactly one declared changed variable, or `none` for a no-op;
- fixed fixture IDs and truth sources;
- deterministic case order;
- safety and kill criteria before the treatment runs.

Configuration explicitly represents scale, padding, grayscale, contrast, thresholding, sharpening, inversion, denoising, PSM, rotation, crop source, and field type. Factorial design is rejected by schema; adaptive thresholding is represented but deliberately not executable until a deterministic implementation is added.

Truth separation:

```text
fixture metadata
  -> sanitize to image path + checksum + dimensions + region
  -> OCR executor
  -> raw evidence and selection
  -> join fixed truth afterward
  -> metrics and decision
```

The executor cannot receive expected Brand, warning text, Alcohol truth, or truth-source fields.

## Output contract

Every arm records:

- configuration and SHA-256;
- Git SHA and environment;
- deterministic behavior SHA-256;
- raw OCR transcript;
- raw words, boxes, and confidence;
- source crop and preprocessed image;
- candidate or warning-anchor trace;
- parsed/selected output and authority state;
- failure class;
- preprocessing, OCR, selection, and total latency;
- RSS before/after/delta;
- aggregate, per-case, and deterministic slice metrics for field, fixture mode, image orientation, crop size, region provenance, and truth-source kind;
- 95% Wilson intervals for accuracy and false certainty.

The deterministic diff excludes timing and memory from behavioral equality while still reporting their deltas.

## Eligibility gate

A non-no-op treatment runs only when control establishes:

- at least 6 governed evaluable real-label fixtures;
- at least 3 fixed-truth failures;
- no truth missing from evaluated cases;
- exactly one declared configuration variable changed.

Authority rules are not experimental variables in this program.

## Selected experiment

### Question

Does increasing the bounded Brand crop from production-equivalent 3× to 4× improve exact normalized Brand reads on reader-approved real-label regions without adding false reliable reads?

### Why this experiment

- PR #196: six of eight real staging Brands failed at OCR recognition.
- Existing repository: ten governed real-label Brand failures have approved regions and fixed truth.
- Region localization is held constant and already reader-approved.
- Scale is reversible and does not use seller text.
- The control is the exact production bounded settings: cubic resize, grayscale, normalise, PSM 11, rotation 0, 3%/4 px padding.

### Pre-registered safety and kill criteria

- kill if false reliable reads increase;
- kill if correct fixed-truth cases do not increase;
- report any new empty OCR output as a recognition regression;
- report median and p95 latency; no authority threshold may change.

## Results

### No-op

- 10 fixtures / 11 regions;
- control failures: 11;
- correct: 0;
- false reliable reads: 0;
- repeated treatment behavioral deltas: 0;
- decision: `NO_OP_CONFIRMED`.

### 4× scale

| Metric | 3× control | 4× treatment | Delta |
| --- | --- | --- | --- |
| Correct normalized reads | 0/11 | 0/11 | 0 |
| OCR recognition misses | 11 | 9 | -2, but both became empty OCR |
| Empty OCR outputs | 0 | 2 | +2 |
| False reliable reads | 0 | 0 | 0 |
| Median latency | 79.87 ms | 173.04 ms | +93.18 ms |
| P95 latency | 258.39 ms | 551.97 ms | +293.58 ms |

Latency values are wall-clock observations from this recorded run and should not be treated as a stable benchmark. The upper 95% Wilson bound with 0/11 successes is 25.88%; the corpus is small, so this is a bounded negative result, not proof that 4× can never help another label.

Decision: `KILL`. The treatment produced no correct read, changed eight transcripts/selections, created two empty outputs, and materially increased latency. It remains evaluation-only and default-off.

## Next experiment

Mild sharpening is the next most defensible single variable on the same 10-fixture/11-region corpus:

- it targets thin/outlined/script strokes that 4× alone did not recover;
- it is cheap and reversible;
- it can reuse the same fixed truth and crop artifacts.

Do not run it in this PR. First add a pre-registered slice label for thin/outline/low-contrast cases and keep the same kill criteria.

Government Warning localization is higher product importance but is data-blocked because the repository has zero governed exact-warning fixtures. Alcohol has 103 full-image truth cases but is not the dominant failure in the current package-staging evidence.

## Longer staged sequence

1. Recover the seven metadata-only staging originals and seller regions.
2. Annotate at least six exact Government Warning cases, including three clean, two contaminated, and at least one whole-label absence negative.
3. Run bounded Brand mild sharpening.
4. If sharpening fails, test contrast `normalise` vs `none` before thresholding.
5. Add raw line identities or scale-normalized line clustering diagnostics before another PSM experiment.
6. Run warning-localization control only after search adequacy and truth are governed.
7. Use the 103 Alcohol truth cases for recovery-yield/cost work as an independent later track.
