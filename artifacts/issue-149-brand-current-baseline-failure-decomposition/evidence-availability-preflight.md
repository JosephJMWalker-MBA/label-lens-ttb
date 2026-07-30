# Evidence-availability preflight

Read-only. Performed **before** any classification and before the draft PR was
opened, to establish whether the seven required determinations can be made
honestly from committed artifacts alone.

**Outcome: the analysis can be performed**, with three limitations stated below
and carried into `limitations.md`. No OCR was run and no owner authorization for
a rerun is requested.

## What was inspected

| Source | Role |
| --- | --- |
| `docs/extraction-baseline/report.json` | current fixed-corpus report, 15 cases |
| `artifacts/brand-evidence-path-diagnosis/cases.json` | 115-case evidence-path probe output |
| `src/fixtures/eval/eval-manifest.json` | governed corpus and Brand truth |
| `src/pipeline/extractor/field-selection.ts` | candidate construction, ranking, selection, authority |
| `src/pipeline/extractor/regions.ts`, `extractor.ts` | OCR pass planning and assembly |
| `src/fixtures/eval/metrics.ts` | governed Brand normalization |

## The fixed-corpus report is not sufficient on its own

`docs/extraction-baseline/report.json` covers **15** cases and its raw OCR
evidence is **truncated**: `diagnostics.regions[].sampleWords` is capped at 25
entries while `wordCount` reaches 252.

| Case | full-image `wordCount` | `sampleWords` retained |
| --- | --- | --- |
| `three-steves-winery` | 252 | 25 |
| `patricia-green-cellars` | 199 | 25 |
| `nebla-mencia` | 160 | 25 |
| `m-cellars-baseline` | 124 | 25 |

Determination 1 — *does governed truth appear in any raw OCR evidence* — cannot
be answered from a truncated word list: absence from the retained 25 does not
establish absence from the recognized 252. **Inferring an OCR miss from this file
alone would be exactly the "do not infer absent stages from final output" error**,
so it is not used for stage attribution. It is retained as a cross-reference only.

## The 115-case evidence-path artifact supplies every required determination

`artifacts/brand-evidence-path-diagnosis/cases.json` carries, for all 115 cases,
with no missing fields:

| Required determination | Field |
| --- | --- |
| 1. truth in any raw OCR evidence | `truthInRawOcr`, `truthOnReconstructedLine`, `lineTexts` |
| 2. truth-bearing candidate constructed | `truthReachedCandidate`, `truthAmongKeptCandidates`, `truthFilterReasons` |
| 3. in the top three | `truthInTop3` |
| 4. top-ranked | `truthInTop1`, `truthRank` |
| 5. selected | `selectedValue`, `selectedExactMatch`, `selectedNormalizedMatch` |
| 6. authority alone prevented OBSERVED | `state`, `abstentionReason`, `authorityGate`, `correctButNotObserved` |
| 7. incorrect candidate accepted as OBSERVED | `wrongAndObserved`, `state`, `selectedNormalizedMatch` |

`truthRank` is `null` on 79 cases. That is a *finding* — the truth is absent from
the ranked output — not a missing field.

## Staleness: checked by diff, not assumed

The artifact was produced at `a9fe943a7293230af88d857104f4e6e2aa74ae02`, **52
commits** before this sprint's base `7c34ef2a5f94cd3736599fdfca39c38928094729`.
Derived evidence from an older base is only usable if the code path that produced
it is unchanged. Every file that can affect the Brand path was diffed:

| File | Change | Effect on the Brand path |
| --- | --- | --- |
| `field-selection.ts` | +27 / −2 | **None.** `selectBrandObservation` was refactored to take options. `DEFAULT_BRAND_SELECTION_OPTIONS.allowCoherentPlausibleLineMerge` is `false`, and with it false the new guard `if (!hasPositiveLine && !options.allow…) continue` is logically identical to the removed `if (upper.brandClass !== "positive" && lower.brandClass !== "positive") continue`. The added `selectBrandObservationWithCoherentLineMergeTreatment` is a separate opt-in entry point that production never calls. |
| `regions.ts` | +129, insertions only | **None.** Every addition is the new `seller-region` feature: one template, four constants, one interface, one map entry, and `sellerRegionCrop`/`sellerRegionCropPlan` appended after `planRecoveryOcrPasses`. `planPrimaryOcrPass` and `planRecoveryOcrPasses` bodies are untouched. |
| `extractor.ts` | +179 / −1 | **None on Brand.** The one deletion is an import line. The seller-region pass writes to `sellerRegionReadings`; `brand` is still built from `[primaryPass]` or `passes`. |
| `extractor.types.ts` | +80, insertions only | New seller-region types. |
| `government-warning.ts` | new file | A different field. |
| `ocr-engine.ts`, `geometry.ts`, `assets/eng.traineddata` | **unchanged** | Raw OCR is byte-identical. |
| `eval-manifest.json`, `eval-full-corpus-overrides.mjs`, `metrics.ts`, `eval-loader.ts` | **unchanged** | Truth and normalization identical. |
| `eval-harness.ts` | +3, insertions only | Adds an `extractionDebug` passthrough; extraction behaviour unchanged. |

**Conclusion: the Brand path from image to authority state is behaviourally
identical between the two bases.** The artifact is therefore *current-equivalent*.

That phrase is deliberate. It means "verified equivalent by reading the diffs",
**not** "re-measured at the current base". Re-measuring would require running OCR,
which this sprint forbids.

## Independence mappings

The corpus has **115 distinct source images** with no byte-identical duplicates —
the manifest's two duplicate entries are already `excluded_duplicate`.

No crop-cluster or verified visual-design clustering exists for this corpus in
committed artifacts. The crop and design clusters used elsewhere in Issue #149
belong to a different five-case subset and do not apply. **Distinct brand
identity** — the set of acceptable truth values — is used as the available
duplication control and is labelled a proxy everywhere it appears.

## Three limitations carried forward

1. **`truthInRawOcr` is carried forward, not re-derived.** The committed evidence
   retains reconstructed line texts, not the complete per-word OCR list, so the
   raw-OCR determination is trusted as the probe computed it. Every downstream
   determination *is* independently re-derivable from `rankedCandidates`,
   `truthRank` and `state`, and was re-derived here.
2. **Current-equivalence is a code-reading claim.** It is strong — the OCR engine,
   model, pass planning and selector are all unchanged — but it is not a
   measurement.
3. **Distinct brand identity is not distinct visual design.** Two cases of one
   brand may use different artwork; two brands may share a template.

## What was not done

No OCR. No recognizer downloaded or executed. No production code, ranking,
selection, authority threshold or state semantics changed. No fixture truth
altered, no alias added, no normalization changed, no corpus expanded or
substituted. PR #195 untouched; PR #214 and PR #216 not reinterpreted.
