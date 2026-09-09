# Issue #149 — fresh re-derivation of Brand `truthInRawOcr`

Research checkpoint. **Validation experiment, not a product change.** No
production code, filter, threshold, ranking, selector, authority gate, truth or
corpus was modified.

## Identity

| | |
| --- | --- |
| Base SHA | `4bb3140b56dd1b9aee2c7b015e90a09d0902fe34` (= `origin/main`) |
| Branch | `research/brand-raw-ocr-rederivation` |
| Population | `artifacts/brand-evidence-path-diagnosis/cases.json` — 115 cases, 105 brand-present |
| Corpus manifest | `src/fixtures/eval/eval-manifest.json` · sha256 `97aae943…` |
| Governed normalization | `src/fixtures/eval/metrics.ts` · sha256 `712a65a1…` |
| Frozen matching rule | `matching-rule.md` · sha256 `b9e9a6bb191f80bcf380e7d1707bcbde1c60d19b31f940b8b18585285ae9f1bc` |
| OCR | tesseract.js 7.0.0, model `eng` (unchanged) |

Full detail in `identity.json`.

## Why a re-run was necessary

The committed corpus report cannot answer the question. Its per-region word
evidence is capped at **25 `sampleWords`**: 214 of 232 regions are truncated and
only **5,611 of 19,914 words (28.2%)** are committed. Classifying from it would
be systematically biased toward absence. So the real extractor was re-run over
all 115 fixtures to obtain complete per-word lists.

## What the inherited field actually was

`truthInRawOcr` is **byte-identical to the extractor's own diagnostic
`brandOcrContainsAcceptable` in 115/115 cases** — zero disagreements. It was
never an independent evaluator judgement. That diagnostic computes

```
normalizedIncludes(allPrimaryPassWords.join(" "), acceptable)
  || normalizedIncludes(allRecoveryPassWords.join(" "), acceptable)
```

and `normalizeKey` strips every non-alphanumeric character — including the
spaces just used to join — so the haystack is a separator-free concatenation of
every OCR token across every pass and the test is a plain `String.includes`. A
match may therefore span arbitrary word boundaries or sit glued inside a longer
token. The frozen rule restores word boundaries before matching.

## Fresh classification (105 brand-present cases)

| Tier | Cases |
| --- | --- |
| `EXACT_RAW_MATCH` | 78 |
| `NORMALIZED_RAW_MATCH` | 1 |
| `PARTIAL_INSUFFICIENT` | 10 |
| `NOT_PRESENT` | 16 |
| `UNDETERMINABLE` | 0 |

**Fresh `truthInRawOcr` = 79** (exact + normalized). Inherited = 81.

## Agreement with the inherited field

| | |
| --- | --- |
| Agreement | **103 / 105 = 98.1%** |
| Prior positives overturned | **2** |
| Prior negatives overturned | **0** |

No case moved absent → present. The frozen rule is a strict refinement of the
inherited substring test: it cannot manufacture presence.

### The two disagreements, preserved not reconciled

| Case | Truth | Fresh | What the OCR actually contained |
| --- | --- | --- | --- |
| `approved-wine-072` | Ava Gardner | `PARTIAL_INSUFFICIENT` | `…wwwavagardnerorg` — the museum's **website**, never the brand as a unit |
| `amuninni-ferracane` | Amuninni | `PARTIAL_INSUFFICIENT` | `…amuninnivini` inside `importedbymyinvenvyamuninnivini` |

Both are the predicted failure mode of the inherited rule. Note what the
downstream filters did with them: `domain-like` and `sentence-fragment`
respectively. In these two cases the filter **was right** — the brand was not
present as readable text, so its rejection was not a lost-evidence event.

## Rebuilt survival cascade (fresh raw-OCR classification)

| Stage | Cases | Lost here | Prior |
| --- | --- | --- | --- |
| governed Brand truth | 105 | — | 105 |
| truth present in raw OCR | **79** | **−26** | 81 (−24) |
| truth survives candidate construction | 37 | **−42** | 37 (−44) |
| truth reaches top 3 | 33 | −4 | 33 (−4) |
| truth reaches top 1 | 29 | −4 | 29 (−4) |
| truth selected | 29 | 0 | 29 |

## The 44-case claim

**Not supported as stated. The corrected number is 42.**

Candidate construction remains the single largest demonstrated Brand loss, and
by a wide margin: **42 against 26** for true OCR miss.

## Corrected filter decomposition

Recounted over the freshly derived raw-OCR-present population only:

| | Fresh | Prior |
| --- | --- | --- |
| Filter-rejection cases | 39 | 41 |
| `too-many-words` a blocker | 23 | 23 |
| `too-many-words` **sole** blocker | **17** | 17 |
| Distinct Brand identities in the sole-blocker set | **14** | 14 |

The headline filter figure is **unchanged**. Both overturned cases were blocked
by `domain-like` and `sentence-fragment`, not by `too-many-words`.

## Verdict

**VALIDATED.**

The fresh re-derivation materially preserves the earlier decomposition.
Candidate construction remains the dominant demonstrated Brand loss (42 vs 26),
the `too-many-words` sole-blocker population is unchanged at 17 cases across 14
identities, and agreement with the inherited field is 98.1% with no
absent → present movement.

The load-bearing assumption flagged in the prior package's `limitations.md` has
been discharged: the inherited field was generous, but only by two cases, and
not in a way that changes the architectural conclusion.

## Implications

**Brand candidate-filter experiment.** Priority unchanged; the 17-case
sole-blocker population survives re-derivation intact. But the two overturned
cases are a live caution for that experiment: some apparent filter losses are
*correct rejections* of text that was never the brand. The cost conclusion in
`issue-149-brand-candidate-construction-filter-decomposition` remains
`INSUFFICIENT_COST_EVIDENCE`, and this checkpoint does not change it. Any
relaxation still needs its counterfactual measured, including false-positive
admission.

**Brand perception research.** True OCR miss rises from 24 to 26 of 105 (24.8%).
Real, and still well below the 42 lost downstream. The perception layer remains
the secondary lever for Brand.

**Alcohol orientation research.** Unaffected. This experiment touched Brand
only; the `ORIENTATION_CONFIRMED` attribution stands on its own evidence.

## Verification

- Determinism: primary and repeat runs compared byte-for-byte — see
  `determinism.json`. The repeat run additionally executes the rule through the
  shared module, so an identical result also proves the extraction into
  `src/fixtures/eval/issue-149-brand-raw-ocr-match.ts` was faithful.
- Every aggregate count traces to rows in `case-level-rederivation.json`.
- Contamination boundary: enforced structurally (the classifier takes only
  `string[]` word text and one acceptable `string`) and tested — the rule
  module's executable code references no downstream Brand field.
- Inherited and fresh values are kept in separate fields on every row and are
  never merged.

## Files

| File | Contents |
| --- | --- |
| `matching-rule.md` | the rule, frozen before counting |
| `identity.json` | base, corpus, normalization, rule and engine identity |
| `case-level-rederivation.json` | one row per case, fresh + prior + explanation |
| `raw-word-evidence.jsonl` | complete per-word OCR text per brand-eligible pass |
| `aggregate.json` | all aggregate counts |
| `old-vs-new-disagreement.json` | cross-tabulation and the two disagreements |
| `determinism.json` | primary vs repeat digests |
| `primary/`, `repeat/` | the two runs, preserved separately |
| `commands.sh` | reproduction |
