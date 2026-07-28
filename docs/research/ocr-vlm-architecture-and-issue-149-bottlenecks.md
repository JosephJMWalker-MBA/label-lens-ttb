# OCR/VLM Architecture and Issue #149 Bottlenecks

## Purpose

This document records the current evidence from Issue #149 and PRs #196–#202, identifies the most likely remaining bottlenecks, and defines a restrained architecture direction for future OCR and vision-language work in Label Lens.

The governing doctrine remains:

- OCR and VLM systems produce evidence only.
- Deterministic rules produce findings.
- Humans remain authoritative.
- Seller truth must not enter OCR or ranking.
- Any stronger recognizer or VLM must be introduced as an explicit, testable evidence source rather than as an authority.

## What the completed experiments established

Four independent Brand pixel-preprocessing treatments produced the same result:

- 4× scaling (#197)
- unsharp-mask sharpening (#198)
- CLAHE contrast enhancement (#199)
- corrected Otsu thresholding (#200)

Each produced:

- 0/11 control
- 0/11 treatment
- zero recall gain
- visually different outputs
- truth-blind behavior

This is not merely a sequence of failed tweaks. It is evidence that pixel preprocessing is unlikely to be the dominant Brand bottleneck on the governed corpus.

The region-coverage diagnostic is especially important:

- all 10 examined cases had 1.00 region coverage
- zero cases were classified as `REGION_NOT_COVERED`
- first-failure classes were:
  - `REGION_COVERED_NO_TEXT_RECOGNIZED`: 3
  - `ORIENTATION_OR_SEGMENTATION_FAILURE`: 5
  - `REGION_COVERED_SEVERE_GLYPH_MISRECOGNITION`: 2

The crop is reaching the correct location. The failure occurs later, during line grouping, orientation handling, or glyph decoding.

Alcohol Experiment A (#202) also produced a clean negative result:

- production already performs all-pass reselection in every eligible case
- control/treatment delta: 0/50
- Alcohol accuracy remained 5/38
- zero false reliable reads
- zero wrong reliable reads
- zero absence false positives
- Brand, Warning, OCR trace, and production response remained unchanged
- production parity remained 115/115

Therefore, Alcohol reselection logic is not the current bottleneck.

## Most likely remaining bottlenecks

### 1. Brand text-line segmentation and orientation grouping

This is the largest classified Brand failure bucket: 5 of 10 diagnostic cases.

The relevant variable is not whether the pixels are sharper or higher contrast. The relevant variable is how the OCR engine groups the region into a line, word, or sparse-text structure, and whether orientation is handled correctly.

### 2. Brand glyph-recognition ceiling on stylized typefaces

Two cases are already classified as severe glyph misrecognition, and some of the three no-text cases may belong to the same underlying class.

Decorative wine and spirits typography may sit outside the effective recognition vocabulary of the shipped Tesseract model. If so, no amount of additional sharpening, contrast adjustment, denoising, or thresholding will solve the problem because the recognizer cannot map the visible shapes to the correct characters.

### 3. Alcohol recovery eligibility and trigger scope

PR #202 established that final reselection is already functioning as designed.

The remaining Alcohol bottleneck is therefore upstream:

- which cases receive a recovery pass
- whether `LOW_CONFIDENCE` and `AMBIGUOUS` cases should be eligible in addition to `NOT_OBSERVED`
- whether narrow or rotated recovery strips are readable once recovery is invoked

## Why the completed experiments could not move the metrics

### Brand preprocessing experiments

Scaling, sharpening, CLAHE, and Otsu all modify pixels before recognition.

The diagnostic study located the observed failures downstream of image acquisition and crop coverage:

- segmentation/orientation
- no text recognized despite region coverage
- severe glyph misrecognition

Those experiments were still necessary because they ruled out the hypothesis that Brand failure was primarily a simple image-quality problem.

### Alcohol Experiment A

Experiment A tested a proposed reselection change against behavior that was already present in production.

Because there was no actual control/treatment logic delta, the metric could not move.

## Minimum discriminating experiment set

### Brand experiment: single-line PSM versus current sparse-text behavior

Scope this experiment only to the five cases classified as `ORIENTATION_OR_SEGMENTATION_FAILURE`.

The question is:

> Does forcing single-line segmentation recover correct raw Brand transcripts where sparse-text mode fails?

Interpretation:

- If correct transcripts appear, segmentation is confirmed as a fixable bottleneck.
- If the transcripts remain wrong or absent, the evidence shifts toward a glyph-recognition ceiling.

This experiment should not include additional preprocessing changes. The segmentation variable must be isolated.

### Brand audit: stylized-font inspection

Visually inspect the two severe-glyph-misrecognition crops and the three no-text-recognized crops.

Record whether they use:

- decorative scripts
- highly condensed or expanded lettering
- custom logotypes
- outlined or shadowed type
- arched or curved baselines
- unusual ligatures
- extreme contrast or texture effects

This is an observational audit, not a production change. Its purpose is to determine whether future work should target Tesseract configuration or recognizer capability.

### Alcohol experiment: trigger expansion

Test recovery eligibility for `LOW_CONFIDENCE` and `AMBIGUOUS` cases in addition to `NOT_OBSERVED`.

This experiment should occur before tuning Alcohol recovery-strip PSM because trigger expansion determines which weak cases are even searched.

The question is:

> Does broader recovery eligibility improve governed Alcohol accuracy without increasing false reliable reads, wrong reliable reads, or absence false positives?

## Experiments not worth running now

Do not run additional Brand preprocessing variants such as:

- stronger sharpening
- alternative CLAHE parameters
- more thresholding variants
- denoising permutations
- repeated scaling combinations

Four orthogonal pixel-domain interventions already produced identical zero-gain results, and the diagnostic evidence places the failure after crop coverage and basic pixel quality.

Do not change Brand candidate ranking before determining whether OCR can produce a usable correct token. Ranking cannot promote text that was never recognized.

Do not run further Alcohol reselection tuning. PR #202 established that reselection already matches the proposed treatment.

## Architecture direction

There are two broad OCR/document-AI patterns:

1. OCR-first pipelines, where text and coordinates are extracted and then evaluated.
2. End-to-end vision-language systems, where a model reads pixels directly and emits text or structured output.

Label Lens should continue to favor a governed OCR-first architecture because it preserves inspectable evidence, provenance, coordinates, confidence, and deterministic rule evaluation.

A future layered architecture may be appropriate:

### Tier 1 — deterministic local OCR

Use Tesseract or another lightweight local recognizer as the normal evidence source.

### Tier 2 — specialized recognition fallback

Invoke a stronger local or self-hosted recognizer only for narrowly eligible failures, such as:

- region covered but no text recognized
- segmentation/orientation failure
- severe glyph misrecognition

The fallback must be evaluated separately and must not silently replace the primary OCR path.

### Tier 3 — VLM advisory evidence

A multimodal model may inspect the same crop and propose candidate text or explain uncertainty.

Its output must be:

- explicitly labeled advisory
- non-authoritative
- unable to independently create a regulatory finding
- scored for exact transcription, hallucination rate, abstention behavior, latency, and cost

### Tier 4 — deterministic adjudication

Deterministic rules compare all evidence, enforce confidence and provenance boundaries, and either:

- produce a supported finding
- remain conservative
- defer to human review

## Why not replace Tesseract immediately

A full replacement would be premature because:

- the Brand segmentation hypothesis has not yet been tested directly
- Alcohol trigger expansion has not yet been tested
- stronger models increase compute, latency, deployment complexity, and cost
- multimodal models can hallucinate text or infer plausible-but-unobserved content
- Label Lens requires evidence discipline, not merely fluent transcription

The appropriate next step is not a platform rewrite. It is a sequence of narrow experiments that determine whether the remaining failures arise from segmentation, recognizer capability, or recovery eligibility.

## Research conclusion

Issue #149 has already demonstrated that deterministic experimentation can eliminate entire classes of hypotheses.

The governed corpus now supports rejecting the following as dominant bottlenecks:

- image scaling
- sharpening
- CLAHE contrast enhancement
- Otsu thresholding
- Alcohol reselection logic

The remaining search space is narrower and better defined:

- Brand segmentation and orientation
- Brand stylized-glyph recognition
- Alcohol recovery trigger scope
- Alcohol recovery-strip read quality

The central principle remains:

> Label Lens does not need the model that can say the most. It needs the evidence system that knows when it has actually seen enough to support a finding.
