# Frozen semantic vocabulary inventory (candidate vs line scope)

Extracted from code. Frozen **before** classification. Read-only audit — no rule,
regex, predicate, vocabulary, weight, representation, OCR or model changed.
Descends from `671800a5` as an **evaluation dependency only**.

## Vocabulary and the predicates that consume it

| Vocabulary / trigger | Predicate | Scope | Extra condition before it fires | Context available |
| --- | --- | --- | --- | --- |
| `PRODUCER_WORD` = `produced\|bottled\|made\|vinted\|cellared\|grown\|packed\|blended` | `isProducerLine` | **line** (`OcrWord[]`) | **must also contain a literal `by` token** (`hasProducerWord && hasBy`) | whole line |
| `NON_BRAND_LINE` (large regex: alcohol, government, warning, surgeon, contains, sulfites, imported, distributed, appellation, producer, bottled, health, consumption, …) | `hasNonBrandKeyword` | candidate **and** line `rawText` | — | line rawText + value |
| `VARIETAL_OR_DESIGNATION` (cabernet, sauvignon, merlot, chardonnay, pinot, noir, grigio, …) | `isPurelyVarietalOrDesignation` | candidate value | **every** alpha token must be in the set | value only |
| `VARIETAL_OR_DESIGNATION` + `GENERIC_PRODUCT_TOKEN` (american, bebida, blanco, dry, espanya, …) | `isGenericProductLanguage` | candidate value | **every** alpha token must be in one of the two sets | value only |
| `LOCATION_OR_APPELLATION_PHRASE` (napa valley, delray beach, livermore valley, …) — **whole phrases** | `isLocationOrAppellationLike` | candidate value | phrase match | value only |
| URL / domain shape | `isDomainLike` | candidate value | — | value only |
| short-token ratio | `isLowInformationFragment` | candidate value | — | value only |
| sentence punctuation + `NON_BRAND_LINE` | `isSentenceFragment` | candidate **and** line rawText | — | line rawText + value |
| `BRAND_DESIGNATOR` = `cellars, cellar, estate, estates, vineyard, vineyards, winery, wineries` | `hasPositiveBrandSignal` → `classifyBrandLine` | candidate value | — | value only |
| possessive `'s` | `hasPositiveBrandSignal` | candidate value | — | value only |
| `BRAND_CONNECTOR` (a, an, and, de, del, di, du, la, …) | token filtering | candidate value | — | value only |

## Two structural facts recorded before classification

**1. `BRAND_DESIGNATOR` has positive polarity.** `hasPositiveBrandSignal` returns
true for any candidate containing `winery`, `cellars`, `estate` or `vineyard`,
which sets `brandClass = "positive"` and adds **+2.0** to `score.total` plus a
structure point. A designator-bearing **superset** of the Brand therefore
outscores the exact Brand by construction. The vocabulary exists and is used —
with the polarity that favours the longer form.

**2. `isProducerLine` is line-scope and conjunctive.** It needs a `PRODUCER_WORD`
**and** a literal `by`. A standalone candidate carrying producer wording cannot
fire it, and a sub-window inherits nothing from its line's verdict.

## Correction to the prior post-hoc lead

The earlier diagnosis suggested `AZIENDA AGRICOLA` escapes `isProducerLine`
because of the `by` conjunct. **That was wrong.** `PRODUCER_WORD` contains only
English participles and **no Italian terms**, so `AZIENDA AGRICOLA` has no
producer word to match at all. The broader line
`AZIENDA ESTATE AGRICOLA BOTTLED BY PRINSI` fires only because it contains
`BOTTLED` **and** `BY`. This is tested in the audit rather than assumed.

## Frozen taxonomy

`EXISTING_VOCABULARY_PREDICATE_FALSE_NEGATIVE` — vocabulary already represented
in the system is present, but the applicable predicate does not fire because of
its matching, composition or polarity conditions.
`CONTEXT_REQUIRED_BUT_NOT_PROPAGATED` — the candidate alone is ambiguous but its
line carries deterministic evidence unavailable at candidate scope.
`VOCABULARY_ABSENT` — the concept is recognizable but no existing vocabulary
represents it. Absence is established, never remedied.
`AMBIGUOUS_EVEN_WITH_CURRENT_CONTEXT` · `OTHER` · `UNDETERMINABLE`.

## Controls

The identical audit runs over the 16 correct cases. Any trigger family is
reported as **wrong-winner rate vs correct-Brand rate**; a trigger that fires as
often on correct Brands is not usable negative evidence.

## Vision gate

Vision or richer semantic modelling is earned **only** for cases classified
`AMBIGUOUS_EVEN_WITH_CURRENT_CONTEXT`, and difficulty alone is never evidence.
