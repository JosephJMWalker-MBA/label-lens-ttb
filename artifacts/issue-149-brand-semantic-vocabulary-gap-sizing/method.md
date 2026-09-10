# Frozen method — vocabulary gap sizing

Frozen **before** aggregate counts. Gap sizing only. **No vocabulary is added to
production**, no predicate is designed, no term is proposed for rejection.
Descends from `d52f9e2a` as an **evaluation dependency only**.

## Normalization rule

`norm(v) = NFD → strip diacritics → lowercase → collapse whitespace → trim`.
Token comparison additionally strips non-alphanumerics per token. The **exact
observed phrase is recorded first and never merged** with another phrase; lexical
form and semantic concept are kept as separate levels throughout.

## Concept taxonomy (derived from the observed 18, frozen here)

`APPELLATION_OR_GEOGRAPHY` · `PRODUCER_ENTITY_DESIGNATION` ·
`OCR_FRAGMENT_OF_BRAND` · `PRODUCT_DESCRIPTOR` · `WINEMAKING_ROLE` ·
`DISTRIBUTOR_IMPORTER` · `OTHER_PROPER_NAME`

## Phrase-to-concept assignment, enumerated case by case before aggregation

| # | Case | Winner (verbatim) | Concept |
| --- | --- | --- | --- |
| 1 | luigi-giovanni-live | `VANNI` | `OCR_FRAGMENT_OF_BRAND` |
| 2 | approved-wine-008 | `Azienda Agricola Terre Sparse` | `PRODUCER_ENTITY_DESIGNATION` |
| 3 | approved-wine-009 | `Azienda Agricola Terre Sparse` | `PRODUCER_ENTITY_DESIGNATION` |
| 4 | approved-wine-018 | `Indigenous blend` | `PRODUCT_DESCRIPTOR` |
| 5 | approved-wine-046 | `Red Wine Blend Curious` | `PRODUCT_DESCRIPTOR` |
| 6 | approved-wine-048 | `Winemaker` | `WINEMAKING_ROLE` |
| 7 | approved-wine-063 | `TRE FICHI` | `OTHER_PROPER_NAME` |
| 8 | approved-wine-064 | `AZIENDA AGRICOLA` | `PRODUCER_ENTITY_DESIGNATION` |
| 9 | approved-wine-065 | `AZIENDA AGRICOLA` | `PRODUCER_ENTITY_DESIGNATION` |
| 10 | approved-wine-067 | `JULIETTE VRIL` | `OCR_FRAGMENT_OF_BRAND` |
| 11 | approved-wine-078 | `MUSCOLINE-ITALIA` | `APPELLATION_OR_GEOGRAPHY` |
| 12 | approved-wine-084 | `BUTA DISTRIBUTORS INC` | `DISTRIBUTOR_IMPORTER` |
| 13 | approved-wine-088 | `GAVI` | `APPELLATION_OR_GEOGRAPHY` |
| 14 | approved-wine-089 | `GAVI` | `APPELLATION_OR_GEOGRAPHY` |
| 15 | approved-wine-090 | `GAVI` | `APPELLATION_OR_GEOGRAPHY` |
| 16 | approved-wine-093 | `TABURNO` | `APPELLATION_OR_GEOGRAPHY` |
| 17 | approved-wine-105 | `CALIFORNIA` | `APPELLATION_OR_GEOGRAPHY` |
| 18 | wine-multi-artifact-05 | `COLLIO` | `APPELLATION_OR_GEOGRAPHY` |

Assignment is by explicit enumeration, recorded before aggregation, so it is
auditable rather than produced by a heuristic that could be tuned afterwards.

## Collision-testing method

For every observed lexical form and every concept-level token, occurrence is
measured across the **whole frozen 115-case corpus**, not only the 16 controls:

- the 18 wrong winners
- the 16 `E+S′` correct Brands
- **all governed correct Brand values** (every acceptable value, 115 cases)
- **all kept Brand candidates** captured from a fresh full-corpus run
- Brand-absent cases

Three collision levels are reported separately:

- **exact phrase collision** — the whole normalized phrase equals a legitimate value
- **token collision** — any token of the phrase appears in a legitimate value
- **concept collision** — any token of the concept's observed vocabulary appears

A term appearing inside a legitimate Brand is **not** automatically unusable, but
the collision is surfaced rather than suppressed.

## Explicitly out of scope

No predicate is designed. This experiment must not conclude anything of the form
"reject candidates containing X". Coverage and safe predicate design are separate
experiments, and the latter is not authorized.

## Populations kept separate

- The **two** `EXISTING_VOCABULARY_PREDICATE_FALSE_NEGATIVE` cases
  (`approved-wine-012`, `approved-wine-110`) are **excluded from the 18-case
  numerator** and reported separately, since existing vocabulary with wrong
  polarity is a different repair from missing concept vocabulary.
- **`m-cellars-baseline`** is preserved separately and not addressed. Current
  deterministic OCR/context evidence is insufficient for that one case under the
  established audit, and it remains the only current Brand case that has earned
  richer semantic or perceptual investigation.
