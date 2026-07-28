# Issue #149 Experiment A architecture audit

Frozen base: `5d22a6be0407e8df4870983aab9107bc89f7c5d0`  
Audit completed before treatment execution: `2026-07-28T00:25:59Z`

## Execution path

1. `extractLabelEvidenceDetailed` in `src/pipeline/extractor/extractor.ts` verifies and decodes the image, creates the local Tesseract worker, and runs `planPrimaryOcrPass`.
2. The primary pass is a full-image, rotation-0, 1.5x, `PAGE_SEG.SPARSE_TEXT` pass. `runOcrPass` in `src/pipeline/extractor/regions.ts` applies the frozen `extract -> explicit rotate when required -> cubic resize -> grayscale -> normalise -> PNG` preprocessing chain.
3. `selectAlcoholObservation([primaryPass])` constructs the primary Alcohol observation. Only OCR words from Alcohol-eligible passes are grouped into deterministic same-line and adjacent-line windows. Supported windows are parsed by `parseWineAlcoholStatement` in `src/domain/rules/wine-alcohol-parse.ts`.
4. `planRecoveryOcrPasses` receives two booleans: whether primary Brand is `NOT_OBSERVED` and whether primary Alcohol is `NOT_OBSERVED`. It returns no recovery when both are false.
5. Alcohol recovery can add, in this order, a left edge strip rotated 270 degrees, a right edge strip rotated 90 degrees, a distinct focus crop, at most one focus edge strip, and a full-image 180-degree fallback when the primary has at most six words. The global maximum is five passes including primary. Every planned pass retains its pass ID, kind, trigger reasons, field eligibility, transform, preprocessing labels, PSM, timings, and mapped OCR words.
6. Production final selection is:

   ```ts
   primaryAlcohol.observation.state === "NOT_OBSERVED"
     ? selectAlcoholObservation(passes)
     : primaryAlcohol
   ```

7. The Experiment A treatment is evaluation-only:

   ```ts
   passes.length > 1 ? selectAlcoholObservation(passes) : primaryAlcohol
   ```

   No-recovery treatment returns the exact primary `FieldSelection` object. Recovery treatment passes the already-collected ordered pass array to the unchanged selector.

## Alcohol selector semantics

- Candidate parsing: `parseWineAlcoholStatement` is called by the existing candidate-window analyzer; no experiment parser exists.
- Confidence: token confidences are normalized from 0–100 to 0–1 and averaged over present token confidence values.
- Ranking: descending `ocr-evidence-score`, then ascending normalized value key.
- Candidate deduplication/corroboration: the existing Alcohol semantic-key and corroboration functions are unchanged.
- Ambiguity: a non-corroborating rival within the frozen `0.2` confidence margin makes the observation `AMBIGUOUS`.
- Confidence state: an uncontested winner below the frozen `0.6` threshold is `LOW_CONFIDENCE`; otherwise it is `OBSERVED`.
- No candidate: `NOT_OBSERVED`, null value, confidence zero, empty alternates.
- Tie-breaking: the selector's stable comparator is confidence descending, normalized value key ascending; exact comparator ties retain deterministic input order. Pass input order is the planner/executor order listed above.
- Reliability: the production whole-image Alcohol observation has no separate reliability field. The seller-region-only `RELIABLE`/`UNRELIABLE` calculation is outside this experiment. Per-case experiment evidence therefore records Alcohol reliability as `null` with the reason `not-applicable-no-whole-image-reliability-field`.
- Authority: the evidence-only analyzer is prohibited from emitting authority conclusions. Regulatory authority is attached later by deterministic rules, not by OCR selection. Per-case experiment evidence records Alcohol authority as `null` with the reason `not-applicable-evidence-only-selector`.

## Current no-op audit

The governed current full-corpus report contains 50 cases with more than one extractor pass. Every recovery pass in every one of those cases carries the `alcohol-not-observed` trigger. There are zero Brand-only recovery cases.

Therefore, for every currently evaluable recovery-bearing case, production already invokes `selectAlcoholObservation(passes)` with the same complete ordered pass list that the treatment would supply. The treatment has a genuine code-level distinction only for a future case where Brand recovery runs while primary Alcohol is not `NOT_OBSERVED`; no such governed case exists in the frozen corpus.

This finding does not authorize changing recovery triggers, adding a case, changing selector semantics, or treating a synthetic unit fixture as governed decision evidence.

## Serialization and consumers

- `extractor.ts` serializes the selected observation as `AnalyzerEvidenceResponse.fields.alcoholStatement` and validates it against `analyzer-evidence.v2`.
- `src/pipeline/precheck/orchestrator.ts` assesses Alcohol evidence sufficiency and supplies the observation to the deterministic Alcohol rules.
- `src/pipeline/result/assemble.ts` persists the observation and evidence references in the immutable result.
- `src/app/api/package/analyze/route.ts` records panel observations. Government Warning is selected independently from the unchanged OCR pass trace.
- Review, JSON export, and report layers consume the persisted `alcoholStatement` observation; none performs OCR reselection.
- Seller-region machine readings use distinct bounded passes and are outside this experiment.

## Frozen production boundaries

| File | SHA-256 |
| --- | --- |
| `src/pipeline/extractor/extractor.ts` | `9b2712e6bb15552e9524bc5e60be4da2b163bdb325206f452ecbaf44ebf5084c` |
| `src/pipeline/extractor/field-selection.ts` | `3e84fa8a043570713991643830c7b95e0f7189a4ed037b737c783353d519106d` |
| `src/pipeline/extractor/regions.ts` | `910d763e20f47d811348b62c77f17d46ddf3a07b5849a337669a07f6b8efc9ab` |
| `src/domain/rules/wine-alcohol-parse.ts` | `2ec1368cf3f4fcfab264d1507f98267aa6f6112091332d4dda5a76152ea816e7` |
| `src/pipeline/extractor/government-warning.ts` | `bd8b59420a29865f5cfb843b9e52a127c7737737d0128c63cba3c1e4b73794d1` |
| `src/app/api/package/analyze/route.ts` | `2b49932096917c40c88dadc8cdef4017126b72968fb47e0f32104818bd4ff41b` |
| `src/fixtures/eval/eval-manifest.json` | `97aae943a57def5a57be38468556da8c5db1d0c5c0fde6136590b56107689668` |
| `src/fixtures/eval/production-analyzer-parity.baseline.json` | `4ec2851ebe4c65bc41fd17983236f3236fb436e2df9eb0a6814f5d4543c8fb73` |

Production must not import the new evaluation module. A boundary test enforces that the import edge remains evaluation-only and default-off.
