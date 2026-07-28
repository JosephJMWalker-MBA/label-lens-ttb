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

It is evidence that pixel preprocessing is unlikely to be the dominant Brand bottleneck on the specific 11 regions tested — a sample deliberately drawn from known, catastrophic control failures. This has not been tested on marginal or near-threshold Brand cases, where preprocessing could plausibly still matter; the claim should not be extended beyond the hard-failure population it was measured on.

The region-coverage diagnostic is especially important:

- all 10 examined cases had 1.00 region coverage
- zero cases were classified as `REGION_NOT_COVERED`
- first-failure classes were:
  - `REGION_COVERED_NO_TEXT_RECOGNIZED`: 3
  - `ORIENTATION_OR_SEGMENTATION_FAILURE`: 5
  - `REGION_COVERED_SEVERE_GLYPH_MISRECOGNITION`: 2

On the 10 cases examined in the region-coverage study, the crop reached the correct location in every case; the failure occurred later, during line grouping, orientation handling, or glyph decoding. This has not been verified on images with non-identity EXIF orientation, and should not be read as a general claim about crop-mapping correctness across arbitrary incoming images.

Alcohol Experiment A (#202) also produced a clean negative result:

- production already performs all-pass reselection in every eligible case
- control/treatment delta: 0/50
- Alcohol accuracy remained 5/38
- zero false reliable reads
- zero wrong reliable reads
- zero absence false positives
- Brand, Warning, OCR trace, and production response remained unchanged
- production parity remained 115/115

PR #202 established that the specific proposed reselection change (using all-pass evidence when recovery exists) already matches current production behavior for cases eligible under today's `NOT_OBSERVED`-only trigger. This is not yet established for an expanded-eligibility population, and does not rule out a different reselection strategy performing better than the current all-pass approach. Reselection logic should be re-examined once, and only if, trigger eligibility is expanded.

## Most likely remaining hypotheses

### 1. Brand text-line segmentation and orientation grouping

Five of 10 diagnostic cases were classified `ORIENTATION_OR_SEGMENTATION_FAILURE`, the largest bucket in this sample. This is a visual classification, not a validated mechanism. It has not yet been established by intervention that these cases are fixable by segmentation-mode changes, nor has orientation failure been separated from segmentation failure within this bucket. Treat this as the top candidate for further diagnostic work, not as a confirmed leading bottleneck.

### 2. Brand glyph recognition: capability ceiling or configuration issue

Two cases show severe glyph misrecognition consistent with a possible model-capability ceiling on decorative typography. This has been reached largely by elimination rather than direct test, and has not been distinguished from a configuration issue, such as traineddata-pack or engine-mode selection, that a simple model-file swap could resolve at much lower cost. Treat capability ceiling as an untested hypothesis until that configuration test has been run.

### 3. Alcohol recovery eligibility and recovery-strip read quality

Recovery-eligibility expansion to `LOW_CONFIDENCE` affects exactly six governed cases. Expansion to `AMBIGUOUS` affects zero, since no Alcohol case in the 115-case corpus has reached that state.

A six-case diagnostic audit has completed with a preliminary `STOP`, but that result is not yet final. The harness classification predates the later preregistered tiered comparison rule, and the six cases must also be checked for truth freshness against pending or landed truth corrections before the decision is accepted.

At this scale, no claim about trigger scope as the next lever is supported. Corpus expansion to at least 20 independent `LOW_CONFIDENCE` cases is required before this hypothesis can support a population-level claim. `AMBIGUOUS` should be treated as untestable under current production behavior.

## Why the completed experiments could not move the metrics

### Brand preprocessing experiments

Scaling, sharpening, CLAHE, and Otsu all modify pixels before recognition.

The diagnostic study located the observed failures downstream of image acquisition and crop coverage in the 10 examined cases:

- segmentation/orientation
- no text recognized despite region coverage
- severe glyph misrecognition

Those experiments were still necessary because they ruled out these treatments as fixes for the catastrophic Brand failures in the governed hard-failure sample.

### Alcohol Experiment A

Experiment A tested a proposed reselection change against behavior that was already present in production for the currently eligible population.

Because there was no actual control/treatment logic delta, the metric could not move.

## Minimum discriminating experiment set

### Brand mechanism-attribution audit

The five cases currently labeled `ORIENTATION_OR_SEGMENTATION_FAILURE` should first be sub-labeled from geometry alone as:

- `ORIENTATION_SUSPECTED`
- `SEGMENTATION_SUSPECTED`
- `AMBIGUOUS_SUBLABEL`

The labels must be frozen before treatment OCR. Orientation and segmentation must be tested with mechanism-matched interventions rather than pooled under one PSM change.

This is a five-case mechanism-attribution study, not a population-rate experiment. Its output should be a per-case map of orientation-fixable, segmentation-fixable, unresolved glyph decode, or case-specific noise.

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

### Tesseract configuration test

Before declaring a capability ceiling, run one preregistered stronger Tesseract traineddata configuration on the mechanism-attributed severe-glyph cases, with all other variables fixed.

Do not sweep multiple traineddata packs or engine modes in one round. A single fixed comparison is sufficient to distinguish a plausible configuration ceiling from a more fundamental recognizer ceiling.

### Alcohol Stage 1: LOW_CONFIDENCE recovery-evidence audit

The six governed `LOW_CONFIDENCE` Alcohol cases are:

- `patricia-green-cellars`
- `approved-wine-020`
- `approved-wine-023`
- `approved-wine-034`
- `approved-wine-079`
- `approved-wine-097`

Recovery passes may be forced in a standalone evaluation harness, but recovery output must not enter final reselection in Stage 1.

The decision rule must be applied only after raw outputs are frozen. It must distinguish:

- exact numeric match
- right number without a valid alcohol-unit anchor
- right unit with the wrong number
- no useful candidate
- disagreement among recovery passes
- nondeterminism
- parser miss versus OCR miss

The current preliminary `STOP` must not be accepted until:

1. the frozen artifacts are reclassified under the actual preregistered tiered rule;
2. the six truth records are checked against pending or landed truth corrections;
3. any raw transcript containing truth that the parser failed to select is marked `PARSER_MISS` rather than `OCR_MISS`;
4. planner crop overlap with the known alcohol-statement region is documented;
5. materially overlapping recovery crops are not treated as independent evidence.

### Alcohol Stage 2: coupled trigger and reselection eligibility

Stage 2 is authorized only if Stage 1 finds at least one deterministic, non-artifactual case where recovery evidence is genuinely better than primary evidence.

Both gates must change together:

- recovery trigger eligibility
- reselection eligibility

The treatment is:

`NOT_OBSERVED` → `NOT_OBSERVED || LOW_CONFIDENCE`

at both gates. `AMBIGUOUS` remains excluded because the governed corpus contains zero evaluable cases.

Candidate ranking, thresholds, parser behavior, Brand, Warning, and recovery-pass templates remain fixed.

Any result at n=6 supports only further research and corpus expansion, never a production proposal.

## Experiments not worth running now

Do not run additional Brand preprocessing variants such as:

- stronger sharpening
- alternative CLAHE parameters
- more thresholding variants
- denoising permutations
- repeated scaling combinations

Four orthogonal pixel-domain interventions already produced identical zero-gain results on the governed hard-failure sample.

Do not change Brand candidate ranking before determining whether OCR can produce a usable correct token. Ranking cannot promote text that was never recognized.

Do not run further Alcohol reselection tuning against the current `NOT_OBSERVED`-only population. PR #202 established that the specific proposed reselection change already matches current production there. Reselection must be re-evaluated only if the eligible population changes.

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
- mechanism-attributed segmentation/orientation failure
- severe glyph misrecognition after configuration checks

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

- the Brand orientation/segmentation mechanism has not yet been attributed by intervention
- a Tesseract configuration ceiling has not yet been distinguished from a model-capability ceiling
- Alcohol trigger expansion affects only six governed cases and has not produced a final interpretable Stage 1 result
- stronger models increase compute, latency, deployment complexity, and cost
- multimodal models can hallucinate text or infer plausible-but-unobserved content
- Label Lens requires evidence discipline, not merely fluent transcription

The appropriate next step is not a platform rewrite. It is a sequence of narrow audits and experiments that determine whether the remaining failures arise from segmentation, orientation, recognizer configuration, recognizer capability, recovery eligibility, or recovery-strip read quality.

## Evidence threshold for declaring a Tesseract capability ceiling

A capability-ceiling conclusion is not yet eligible. The current evidence supports only that some failures are consistent with a ceiling.

Before such a conclusion is justified, the following must be ruled out on the specific candidate cases:

1. A configuration ceiling, using one preregistered stronger Tesseract traineddata configuration with all other variables fixed.
2. Orientation or segmentation as the proximate failure mechanism.
3. Preprocessing as the explanation on the finalized mechanism-attributed subset.
4. Nondeterministic or case-specific noise.
5. Absence of an observable stylization feature relevant to recognition difficulty.

A population-level ceiling claim requires a larger governed corpus rather than extrapolation from the current small diagnostic set. A reasonable target is at least 20 independently sourced cases, stratified across distinct stylization classes and visual families.

Required failure reporting should distinguish:

- exact or normalized correctness
- partial correct tokens
- specific wrong-character substitutions
- no text detected despite clean isolation
- high-confidence wrong output
- low-confidence correct output

A true model-capability hypothesis is strengthened only when cleanly isolated stylized text remains unreadable or systematically misdecoded under a stronger Tesseract configuration and deterministic repeats.

## Model-agnostic fallback recognizer benchmark

Any comparison between Tesseract and a stronger recognizer must isolate recognition capability from localization and post-processing.

### Governed case set

Use the unresolved governed Brand cases across segmentation-suspected, orientation-suspected, and glyph-ceiling-suspected classes. Add held-out corpus expansion if needed to reach a meaningful sample, targeting at least 20 cases stratified by failure class.

Every engine must receive the same fixed, already-approved crop. Neither engine may perform its own region detection in this benchmark.

Reserve at least 30% of cases as held out from any candidate-model configuration or prompt tuning.

### Truth-leakage prevention

- Truth values must live in a separate file unavailable to the inference call.
- No truth string, substring, fixture identifier, filename, prompt, metadata field, or environment variable visible to the recognizer may contain a hint.
- The invocation process and truth-comparison process must remain separate.
- Prompt-driven candidates must use one fixed generic transcription instruction across all cases.
- Invocation payloads should be audited for truth-bearing filenames or metadata before each run.

### Provenance and raw evidence

Record for every run:

- git SHA
- engine and model version
- model-file checksum
- complete configuration hash
- CPU/GPU and library environment
- thread count
- input-crop checksum
- timestamp
- run identifier

Persist unmodified recognizer output before normalization, ranking, authority gating, or metric computation. Raw output should remain separately inspectable, such as in `raw-output.jsonl`.

### Abstention and confidence states

Represent recognizer output using three explicit states:

- `ABSTAINED`
- `LOW_CONFIDENCE_OUTPUT`
- `HIGH_CONFIDENCE_OUTPUT`

Cross these with correctness. `HIGH_CONFIDENCE_WRONG` is the most safety-critical outcome and disqualifies an engine from any authority-adjacent role if it increases relative to the current baseline.

A recognizer without a native abstention mechanism must have that limitation documented rather than being treated as naturally confident.

### Comparison metrics

Report:

- normalized exact-match rate
- character error rate as the primary continuous metric
- useful-token recall
- false reliable reads under the existing unmodified authority classifier
- median and p95 latency, with cold and warm starts separated
- peak memory at load and inference
- byte-identical repeatability at fixed configuration

Do not force unlike native confidence scores onto a shared numeric scale. Confidence is used only for within-engine abstain/low/high classification, while exact match, CER, useful-token recall, and authority outcomes provide cross-engine comparison.

### Evaluation-only boundary

The benchmark must remain standalone and have no import edge into the production extractor. It must add no production flag or default behavior. Outputs belong only under evaluation artifacts, and production behavior hashes must remain unchanged.

### Repeatability and fair decoding

Run one primary and one full repeat pass for both engines.

For probabilistic or generative candidates:

- force temperature 0 or equivalent greedy/fixed-beam decoding
- allow one canonical output per case
- forbid best-of-N, self-consistency, voting, or hidden retries
- document any residual nondeterminism

A candidate that cannot reproduce its own output at fixed configuration fails the project's reproducibility requirement.

### KEEP, KILL, or insufficient evidence

**KEEP** means the candidate justifies a future narrowly triggered Tier 2 fallback design, not production rollout. It requires:

- a statistically credible CER reduction or exact-match improvement on held-out unresolved cases
- zero increase in false reliable reads
- zero new high-confidence wrong cases
- repeatability at least as strong as the Tesseract baseline
- latency and memory compatible with narrow fallback use

Illustrative evidence thresholds include at least a 30% relative CER reduction with sufficiently separated uncertainty, or exact-match recovery on at least 25% of previously zero-match cases.

**KILL** applies when there is no meaningful improvement, any increase in false reliable or high-confidence wrong reads, repeatability failure, or unacceptable latency/memory without a viable narrow trigger.

**Insufficient evidence** applies when the candidate improves some cases safely but the corpus or uncertainty is too weak for either decision. In that case, expand the governed corpus rather than forcing a binary conclusion.

### First candidate category

The first category worth benchmarking is a locally deployable, open-weight transformer-based scene-text recognizer—not cloud OCR and not a generative VLM.

This is the cleanest test of whether stronger learned glyph representations outperform the current Tesseract configuration while preserving local deployment, single-shot decoding, and a smaller governance and hallucination surface.

Cloud OCR introduces data-governance questions. A VLM introduces fabricated-but-plausible text as a separate risk class. Those should be evaluated only after a local scene-text recognizer fails to resolve the question.

## Governed corpus expansion for rare Alcohol states

Source only new, previously unseen real label images through a broad, outcome-blind intake process. Do not search specifically for spectacular failures or alter thresholds to manufacture target states.

Requirements:

- run each candidate once through the frozen production pipeline before outcome review
- preserve source and rights provenance
- exclude exact duplicate checksums
- tag near-duplicate visual/producer families
- require two independent human truth passes before acceptance
- annotate truth from the raw image before showing pipeline output
- exclude human-illegible cases rather than forcing a truth value
- preserve a deterministic held-out split before analysis or tuning

Target minimums:

- at least 20 independent `LOW_CONFIDENCE` cases across at least three layout slices and 15 visual families
- at least 15 independent `NOT_OBSERVED`-despite-recovery cases where alcohol text is visibly present
- at least 30 correct `OBSERVED` controls
- no forced quota for `AMBIGUOUS`

After a preregistered intake of at least 300 new deduplicated candidates, if fewer than five independent Alcohol cases naturally reach `AMBIGUOUS`, treat that state as too rare under current production behavior for a dedicated rate-based experiment. Future work must then wait for organic accumulation or explicitly acknowledge that it remains untested.

## Research conclusion

Issue #149 has already demonstrated that deterministic experimentation can eliminate classes of hypotheses, but every conclusion must remain scoped to the population actually tested.

On the governed hard-failure sample, image scaling, sharpening, CLAHE contrast enhancement, and Otsu thresholding produced no recall gain. This rules them out as fixes for catastrophic Brand failures in this sample, not as a general claim about preprocessing value elsewhere in the pipeline.

The specific proposed Alcohol reselection change is confirmed inert for the currently eligible population. This does not extend to an expanded-eligibility population, which remains untested at adequate scale.

The remaining hypotheses, none yet confirmed by direct intervention, are:

- whether Brand segmentation and orientation failures are separable and independently fixable
- whether Brand glyph misrecognition is a capability ceiling or a configuration issue
- whether Alcohol trigger-scope expansion helps a population currently measured at only six eligible governed cases
- whether Alcohol recovery-strip planning and read quality are adequate for that population

The central principle remains:

> Label Lens does not need the model that can say the most. It needs the evidence system that knows when it has actually seen enough to support a finding.
