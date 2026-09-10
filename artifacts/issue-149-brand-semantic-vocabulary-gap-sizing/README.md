# Issue #149 — vocabulary gap sizing

**Verdict: `BOUNDED_LEXICON_HYPOTHESIS_PARTIAL`.** A bounded core of **11 of 18**
sits in two concepts with **zero** governed-Brand token collision, alongside a
genuine long tail. Gap sizing only — **no vocabulary added, no predicate designed,
production behaviour changed: no.**

| | |
| --- | --- |
| Branch | `research/brand-semantic-vocabulary-gap-sizing` |
| Dependency | `d52f9e2a` → … → `8de5b9fc`. **Evaluation dependency only** |
| Frozen method | `35f75024b616f858b6224a1814987640403e02d52fd5caf25533fbd12b09c00d` |
| Evidence captured | **482 kept Brand candidates** across all 115 cases, **124 governed Brand values** |
| Determinism | **PASS**, fail-closed |

## Lexicon shape

**14 distinct exact phrases → 7 distinct concepts.**

| Concept | Cases | Coverage |
| --- | --- | --- |
| `APPELLATION_OR_GEOGRAPHY` | **7** | top-1 = 7/18 (39%) |
| `PRODUCER_ENTITY_DESIGNATION` | **4** | top-2 = 11/18 (61%) |
| `OCR_FRAGMENT_OF_BRAND` | 2 | top-3 = 13/18 (72%) |
| `PRODUCT_DESCRIPTOR` | 2 | top-5 = 16/18 (89%) |
| `WINEMAKING_ROLE` · `OTHER_PROPER_NAME` · `DISTRIBUTOR_IMPORTER` | 1 each | singletons |

## Collision analysis — measured against the whole corpus

| Concept | Governed-Brand token collisions | Kept-candidate collisions |
| --- | --- | --- |
| `APPELLATION_OR_GEOGRAPHY` | **0 / 124** | 18 / 482 |
| `PRODUCER_ENTITY_DESIGNATION` | **0 / 124** | 9 / 482 |
| `WINEMAKING_ROLE` | **0 / 124** | 1 / 482 |
| `OTHER_PROPER_NAME` | 1 / 124 | 2 / 482 |
| `OCR_FRAGMENT_OF_BRAND` | 2 / 124 | 4 / 482 |
| `DISTRIBUTOR_IMPORTER` | 3 / 124 | 3 / 482 |
| `PRODUCT_DESCRIPTOR` | **7 / 124** | 14 / 482 |

No phrase collides **exactly** with any governed Brand. The two largest concepts —
covering 11 of 18 — have **zero** token collision with governed Brand values.

`PRODUCT_DESCRIPTOR` is the collision-heavy one, and self-evidently so: its
tokens include `curious`, which **is** the governed Brand in
`approved-wine-046` (`Red Wine Blend Curious`), plus the generic `red`, `wine`,
`blend`. Surfaced, not suppressed.

## Two findings that shrink the apparent opportunity

**The largest concept may already exist.** `LOCATION_OR_APPELLATION_PHRASE` is
already in the codebase (`napa valley`, `livermore valley`, `delray beach`…).
The seven appellation cases — `GAVI` ×3, `TABURNO`, `COLLIO`,
`MUSCOLINE-ITALIA`, `CALIFORNIA` — may therefore be **missing entries in an
existing concept**, not a missing concept. That is a materially cheaper repair,
and a different one.

**Two of the 18 are not vocabulary problems at all.** `VANNI` and
`JULIETTE VRIL` are OCR fragments *of the Brand itself* — precisely the pair
`structure` protected before S′ removed it. Counting them toward a lexicon
opportunity would inflate it, so they are reported as `OCR_FRAGMENT_OF_BRAND` and
excluded from any lexicon claim.

Excluding them, **11 of 16** vocabulary-shaped failures fall in the two
zero-collision concepts.

## Populations kept separate

- **Existing-vocabulary polarity cases (2)**: `approved-wine-012`,
  `approved-wine-110` — `BRAND_DESIGNATOR` with positive polarity. Excluded from
  the 18-case numerator; a different repair, not combined to enlarge the number.
- **Vision-earned case (1)**: `m-cellars-baseline`. Current deterministic
  OCR/context evidence is insufficient for this one case under the established
  audit. It remains **the only** current Brand case that has earned richer
  semantic or perceptual investigation. Not addressed here.

## Why `PARTIAL` and not `SUPPORTED`

A bounded, apparently safe core exists (11 cases, two concepts, zero governed
collision). But three concepts are singletons, one concept carries real collision
risk, and the largest concept may be an existing-list gap rather than a new one.
That is a meaningful long tail, which is what `PARTIAL` describes.

## Smallest next discriminating experiment (proposed, not authorized)

A read-only candidate-level semantic counterfactual over the two zero-collision
concepts only, measuring true wrong-winner suppression, correct-Brand collateral,
Brand-absent behaviour and authority consequences. **Not authorized**, and no
predicate is designed here — this experiment establishes only that such a
counterfactual is worth specifying.

## Carried-forward gaps, still unreported

Per-arm **authority state** and **full-corpus collateral for E/S** remain
unreported from the factorial experiment.
