# Issue #149 OCR architecture audit

Base: `e267bdda67293f34131b1c51af556a3f2add91a0` (`main` after merged PR #196).

Scope: production code was read and traced; the research platform has no import edge from production. PR #195 was inspected read-only.

## System boundary

```text
browser package draft + panel bytes + seller normalized regions
  -> POST /api/package/analyze
  -> per-panel byte/MIME/size/checksum validation
  -> extractLabelEvidenceDetailed
     -> verifyAndDecode
     -> createLocalOcrEngine
     -> primary OCR pass
     -> Brand + Alcohol selection
     -> conditional recovery passes
     -> final Brand + Alcohol selection
     -> seller-region OCR passes
     -> analyzer-schema validation
     -> worker termination
  -> Government Warning selection from the already-executed general passes
  -> machine panel serialization
  -> package category comparison + deterministic warning rule
  -> append-only analysis run
  -> package-review UI
```

Seller declaration, machine-discovered observations, bounded seller-region readings, deterministic findings, and human disposition remain separate.

## Entry, runtime, and serialization path

| Stage | File and function | Actual behavior |
| --- | --- | --- |
| Request validation | `src/app/api/package/analyze/route.ts` — `POST` | Accepts multipart package draft plus one PNG/JPEG per ordered panel; checks count, MIME, byte size, metadata, checksum, and decoded dimensions. Panels run sequentially. |
| Seller region mapping | `route.ts` — `sellerRegionTargets` construction | Passes normalized panel-relative geometry and IDs only. Seller expected text is not included in `ExtractionInput`. |
| Extraction | `src/pipeline/extractor/extractor.ts` — `extractLabelEvidenceDetailed` | Decodes, creates one Tesseract worker per panel, executes passes, selects Brand/Alcohol, executes every supplied seller region, validates the evidence-only response, and terminates the worker in `finally`. |
| Warning observation | `src/pipeline/extractor/government-warning.ts` — `selectGovernmentWarningObservation` | Runs after extraction against `debug.passes`; it does not plan its own OCR pass. |
| Panel record | `route.ts` — `machinePayload` | Persists selected Brand/Alcohol observations, one warning observation, seller-region readings, version manifest, checksum, canonical integrity digest, and append token. |
| Package analysis | `src/features/package-preparation/package-model.ts` — `createAnalysisRun` | Derives category comparisons, Brand identity support, package-level warning finding, and readiness. |
| UI | `src/features/package-preparation/PackagePreparationWorkspace.tsx` | Renders machine state, seller-vs-machine comparison, raw/anchored warning transcript, expected warning text, diff, geometry, provenance, and review state. Human action remains authoritative. |

## Image integrity, decoding, and orientation

`src/pipeline/extractor/image-integrity.ts` performs:

1. non-empty byte check;
2. SHA-256 equality check;
3. Sharp metadata decode;
4. PNG/JPEG, single-frame, minimum dimension, maximum width/height, and decoded-pixel budget checks.

The accepted bytes themselves are passed to each OCR preprocessing pipeline. There is no argument-free Sharp `rotate()` auto-orientation step. Explicit pass rotations are applied only after crop extraction. EXIF orientation is therefore not normalized into a canonical derivative before normalized seller coordinates are mapped. The route catches a decoded-dimension mismatch, but that is not the same as canonical EXIF orientation handling.

## Pass planning and preprocessing

`src/pipeline/extractor/regions.ts` owns the fixed templates.

| Pass | Crop | Rotation | Scale | PSM | Field eligibility | Trigger |
| --- | --- | --- | --- | --- | --- | --- |
| Primary | full image | 0 | 1.5 | 11 sparse text | Brand + Alcohol | always |
| Full-image fallback | full image | 180 | 1.5 | 11 | Brand + Alcohol | unresolved field(s), primary has at most 6 words, pass budget remains |
| Left edge | 44% left strip | 270 | 3 | 11 | Alcohol only | Alcohol not observed |
| Right edge | 44% right strip | 90 | 3 | 11 | Alcohol only | Alcohol not observed |
| Focus crop | connected OCR component | 0 | 2 | 11 | Alcohol only | distinct focus component and Alcohol not observed |
| Focus edge | 22% focus edge | 90/270 | 3 | 11 | Alcohol only | focus crop plus preferred edge |
| Seller region | normalized region + 3%/4 px padding | 0 | 3 | 11 | requested Brand or Alcohol | every valid supplied seller region |

Every pass uses:

1. Sharp `extract`;
2. optional explicit rotation;
3. cubic resize to the fixed scale;
4. Sharp grayscale;
5. Sharp `normalise`;
6. PNG encoding;
7. Tesseract recognition.

No production thresholding, sharpening, inversion, or denoising is applied.

`sellerRegionCropPlan` floors the selected left/top, ceils right/bottom, rejects selected dimensions below 4 px, adds max(3%, 4 px) padding independently by axis, clips to image bounds, and reports selected geometry, actual padding, padded crop, and scale.

`mapBoxToOriginalGeometry` in `src/pipeline/extractor/geometry.ts` reverses scale and explicit rotation, offsets by the crop origin, clamps to the original frame, and rejects invalid/degenerate boxes.

## Local OCR runtime and lifecycle

`src/pipeline/extractor/ocr-engine.ts`:

- dynamically imports `tesseract.js`;
- resolves vendored `eng.traineddata` and the local WASM core from deployment-relative paths;
- creates an English OEM 1 (LSTM-only) worker;
- disables Tesseract caching (`cacheMethod: "none"`);
- sets PSM before every recognition;
- requests blocks and flattens block/paragraph/line words into `{text, confidence, bbox}`;
- terminates the worker after one panel.

There is no cross-panel worker pool, per-request cache, or concurrent panel execution. Cleanup is bounded and best-effort; a termination exception does not mask the analysis result.

## Seller-region Brand path

1. `route.ts` validates normalized geometry through the package model and creates a `SellerRegionOcrTarget`.
2. `planSellerRegionOcrPass` maps and pads the crop using original decoded dimensions.
3. `runOcrPass` preprocesses at 3× and PSM 11, runs OCR, and inverse-maps each word.
4. `selectBrandObservation` in `field-selection.ts`:
   - reconstructs lines with a fixed 20 processed-pixel vertical-center tolerance;
   - creates whole-line and selected line-window candidates;
   - creates adjacent multi-line candidates only when a positive Brand line is present on current `main`;
   - filters producer, mandatory/regulatory, long, domain-like, varietal/designation, generic product, location/appellation, low-information, and sentence candidates;
   - scores positive signal, meaningful characters, structure, OCR evidence, prominence, area, centrality, alignment, and line proximity, with penalties;
   - ranks/deduplicates candidates and preserves alternates;
   - returns `AMBIGUOUS` for competing or merely plausible candidates;
   - returns `OBSERVED` only for an uncontested positive Brand signal at mean OCR score at least 0.6.
5. `sellerRegionReadingFromSelection` stores the raw bounded transcript, selected value/geometry, selected/padded crop provenance, padding, scale, PSM, preprocessing, timing, and observation state.
6. Bounded reliability is stricter than Brand authority: only `OBSERVED` at score at least 0.8 becomes `RELIABLE`.
7. `deriveTwoStreamComparison` in `package-model.ts` compares reliable bounded readings with independently discovered full-image evidence while preserving the two streams.
8. Low-confidence, ambiguous, unreadable, or missing bounded text remains insufficient; it does not become a hard conflict.

## Machine-discovered Brand path

The primary full-image pass is always Brand-eligible. Recovery is requested only when the primary Brand state is `NOT_OBSERVED`; `AMBIGUOUS` does not trigger Brand recovery. Edge and focus recovery templates are Alcohol-only. Therefore Brand recovery can only gain a second Brand-eligible pass through the sparse-word 180-degree fallback. In ordinary noisy cases where Brand is `AMBIGUOUS`, the full-image Brand result is final.

## Government Warning path

There is no warning-specific search-region generator in production.

1. The warning selector receives the general passes that Brand/Alcohol planning happened to execute.
2. Each pass is sorted into a reconstructed reading order using a fixed 20 processed-pixel tolerance.
3. `deriveAnchoredGovernmentWarningTranscript` searches for an exact `government warning` anchor; a `government` plus corrupted warning-like token is marked uncertain.
4. Candidates without an anchor, uncertain anchor, distinctive phrase, or at least 35% canonical-token coverage are discarded.
5. Candidate words are bounded from the anchor to the canonical token count plus at most six tokens.
6. Contamination detects large panel coverage, net-contents/ABV text, producer/Brand text, address-like text, and severe token displacement.
7. Candidate ranking prefers exact match, clean evidence, coverage, then OCR mean confidence.
8. Package rule `evaluateGovernmentWarningPackage` is deterministic:
   - no panel observations: `not_run`;
   - panels searched but no warning candidate: `FAIL`;
   - ambiguity, uncertain anchor, or contaminated evidence: `NEEDS_REVIEW`;
   - exact readable anchored text: `PASS`;
   - at least 90% readable but non-exact text: `FAIL`;
   - otherwise: `NEEDS_REVIEW`.

The selector and rule retain raw and anchored transcripts, normalized comparisons, mean token confidence, geometry, orientation, contamination, match signals, and provenance. They do not persist all raw word boxes or rival warning candidates.

## Alcohol path

1. The primary full-image pass is selected first.
2. Only `NOT_OBSERVED` triggers final reselection across recovery passes; an `AMBIGUOUS`, `LOW_CONFIDENCE`, or `OBSERVED` primary result is retained.
3. Alcohol recovery can add left/right edge rotations, a focus crop, one focus edge, and a 180-degree full-image pass within the five-pass ceiling.
4. `selectAlcoholObservation` reconstructs same-line and adjacent-line windows containing digits plus an Alcohol/percent/volume/proof signal.
5. Narrow normalization repairs OCR confusions such as comma/split decimals, `O`/`I`, fused `ALC`, `BYVOL`, and exact `ABV`.
6. The parser accepts explicit alcohol-by-volume patterns, rejects proof-only and weak bare markers, and records acceptance/rejection and normalization traces.
7. Candidates deduplicate by parsed semantic value and rank by OCR evidence score then normalized key.
8. Close, different candidates become `AMBIGUOUS`; otherwise score below 0.6 is `LOW_CONFIDENCE`, and score at least 0.6 is `OBSERVED`.
9. Seller-region Alcohol uses the same 3× bounded pass and the stricter 0.8 bounded reliability gate.

## State transitions

```text
raw OCR words
  -> candidate absent
       -> NOT_OBSERVED
  -> candidate present
       -> competing values -> AMBIGUOUS
       -> selected value below field authority -> LOW_CONFIDENCE or AMBIGUOUS
       -> selected value clears field authority -> OBSERVED

seller-region reading
  -> invalid geometry -> INVALID_REGION / UNRELIABLE
  -> no transcript -> NOT_OBSERVED / UNRELIABLE
  -> transcript but no usable selection -> UNREADABLE / UNRELIABLE
  -> LOW_CONFIDENCE or AMBIGUOUS -> same evidence state / UNRELIABLE
  -> OBSERVED and score < 0.8 -> OBSERVED / UNRELIABLE
  -> OBSERVED and score >= 0.8 -> OBSERVED / RELIABLE

two-stream comparison
  -> reliable agreement -> AGREEMENT
  -> reliable disagreement -> CONFLICT
  -> bounded unreliable -> SELLER_REGION_INSUFFICIENT
  -> independent absent -> MACHINE_DISCOVERY_NOT_FOUND
  -> both weak -> BOTH_INSUFFICIENT
```

## Evidence discarded or compressed

| Boundary | Evidence lost or compressed |
| --- | --- |
| Tesseract adapter | Symbol-level confidence, baselines, block/paragraph/line identity, language alternatives, and engine debug output are discarded. |
| Geometry mapping | Invalid mapped words are discarded; only aggregate discarded count remains. |
| Line reconstruction | Original Tesseract line grouping is gone; selectors rebuild lines with a fixed processed-pixel threshold. |
| Analyzer response | Full pass list, all raw words, rejected lines, and complete candidate diagnostics exist only in `DetailedExtractionResult.debug`, not the validated analyzer response. |
| Production panel payload | Full-image raw words and complete Brand/Alcohol diagnostics are not serialized. |
| Seller-region reading | Raw transcript, selected geometry, aggregate score, and pass provenance persist, but per-word boxes/confidences and rejected candidate traces do not. |
| Warning observation | Best candidate persists; rival candidates and complete raw word lists do not. |
| UI | Displays persisted summaries and selected evidence, not the entire OCR search space. |

The research runner records the normally discarded raw words, crop/preprocessed artifacts, candidate/anchor traces, runtime, and memory delta without changing production serialization.

## Confidence transformations

1. Tesseract raw word confidence is 0–100.
2. Brand and Alcohol normalize each finite value to 0–1 and use the mean as `ocrEvidenceScore`.
3. Candidate ranking consumes this mean as one feature.
4. Brand authority uses 0.6 plus a positive Brand signal; Alcohol authority uses 0.6.
5. Seller-region reliability uses `OBSERVED` plus 0.8.
6. Warning candidate ordering uses mean normalized confidence after exactness, contamination, and coverage.
7. None of these values is a calibrated probability.

## Coupled variables and hidden defects

1. **Warning recovery is coupled to Brand/Alcohol failure.** Warning has no planning input. A readable Brand and Alcohol can suppress every recovery pass even when the warning is vertical, contaminated, or outside the primary OCR result.
2. **Brand recovery is largely non-operational for noisy Brands.** `AMBIGUOUS` does not trigger recovery, and edge/focus templates are Alcohol-only.
3. **Scale changes line grouping.** `lines()` and warning reading order use a fixed 20-pixel tolerance in processed space. Changing scale changes effective original-space line grouping as well as OCR pixel density. The 4× experiment is still one configuration-variable change, but its mechanism is not pure recognition resolution.
4. **Pass templates bundle geometry, rotation, scale, preprocessing, PSM, and eligibility.** Direct production experiments require custom evaluation code to avoid varying several factors.
5. **No canonical EXIF orientation normalization exists before crop mapping.**
6. **Worker startup is paid per panel.** Sequential packages repeat initialization and disable caching.
7. **Warning absence is treated as FAIL after any panel observation exists.** That is deterministic and conservative, but it cannot distinguish “warning truly absent” from “the warning search was not adequate” because warning search adequacy is not a first-class state.
8. **Production telemetry is insufficient for root-cause work.** The most useful word boxes and candidate traces are dropped before persistence.

These findings justify research infrastructure and additional warning truth, not a broad production rewrite.
