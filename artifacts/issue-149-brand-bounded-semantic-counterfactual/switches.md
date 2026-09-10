# Frozen G and P treatment vocabularies

Frozen **before** any outcome counting. Counterfactual only. **No production
vocabulary or predicate is modified.** Descends from `6e5fc530` as an
**evaluation dependency only**.

## Matching semantics — deliberately minimal

A candidate is treated as non-Brand **only when its entire normalized value
equals a frozen form exactly**. Normalization is
`NFD → strip diacritics → lowercase → per-token strip of non-alphanumerics →
single-space join → trim`. There is **no** substring, prefix, stem, morphology or
language generalization. The treatment vocabulary is exactly the observed forms.

Consequence, stated up front: `azienda agricola terre sparse` and
`azienda agricola` are **two separate forms**; neither implies the other.

## G — appellation / geography (7 diagnosed cases, 5 distinct forms)

| Form | Cases | Status against existing concept machinery |
| --- | --- | --- |
| `gavi` | 3 | **absent entry** in `LOCATION_OR_APPELLATION_PHRASE` |
| `taburno` | 1 | **absent entry** |
| `collio` | 1 | **absent entry** |
| `california` | 1 | **absent entry** |
| `muscoline italia` | 1 | **absent entry** |

`LOCATION_OR_APPELLATION_PHRASE` already exists and holds whole phrases
(`napa valley`, `livermore valley`, `delray beach`, …). **None of the five
diagnosed forms is present in it.** G is therefore an *absent-entry* extension of
an existing concept, not a new concept.

## P — producer-entity designation (4 diagnosed cases, 2 distinct forms)

| Form | Cases | Status |
| --- | --- | --- |
| `azienda agricola terre sparse` | 2 | **concept absent** |
| `azienda agricola` | 2 | **concept absent** |

`PRODUCER_WORD` is `produced|bottled|made|vinted|cellared|grown|packed|blended`
and contains no such terms, and `isProducerLine` additionally requires a literal
`by` token. P is therefore a genuinely distinct proposed concept, not an
absent entry. No broad regex or language ontology is introduced.

## Treatment semantics — filtering, not scoring

Traced from code: the architecture represents semantic negatives by **rejecting
the candidate**, not by subtracting points. `analyzeBrandSpan` returns
`{ kept: false, filterReason }` for `location-or-appellation` and `producer-line`.
The counterfactual therefore applies at that same stage, reusing those existing
dispositions:

- a G match fails the existing **`location-or-appellation`** check;
- a P match fails the existing **`producer-line`** check.

`evaluateBrandFilterChecks` is extended identically so `filterChecks` and
`activeRejectionReasons` stay consistent and the diagnostic invariants hold. No
score, weight, ranking input or authority threshold is touched; the altered
candidate population flows through the **unchanged** real ranking, selection and
authority code.

## Scope — full corpus, not oracle suppression

G and P apply to **every matching candidate in all 115 cases**, never only to the
11 targets. Every treatment hit outside the 11 is recorded, so collateral is
measurable rather than assumed.

## Arms

`G0P0` baseline · `G1P0` · `G0P1` · `G1P1`. No other semantic concept.

## Deliberately excluded, and not to be pulled in to improve coverage

- the **2** `OCR_FRAGMENT_OF_BRAND` cases (`VANNI`, `JULIETTE VRIL`) — not
  vocabulary targets;
- the **2** `PRODUCT_DESCRIPTOR` cases — intentionally excluded for collision risk;
- the **3** singleton concepts;
- the **2** existing-vocabulary polarity cases (`approved-wine-012`, `-110`) — a
  separate mechanism;
- **`m-cellars-baseline`** — the only Brand case with richer semantic/perceptual
  research earned.

## What a clean result would and would not mean

A clean result means only: *these frozen concepts appear safe and useful enough to
justify predicate-design research*. It does **not** mean "add these strings to
production". Predicate design, multilingual coverage, morphology, phrase
boundaries and maintenance are later, separate questions.
