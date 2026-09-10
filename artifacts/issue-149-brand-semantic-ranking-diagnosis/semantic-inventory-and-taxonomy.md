# Frozen semantic evidence inventory and taxonomy

Traced from code. Frozen **before** classification. Diagnosis only — no ranking,
filter, authority, OCR, candidate generation or model architecture changed.
Descends from `283a0823` as an **evaluation dependency only**.

## Semantic / contextual signals that actually exist

Only signals present in the code or evidence are listed. Nothing is invented.

### Candidate-level predicates (`evaluateBrandFilterChecks`, all ten evaluated independently)

| Signal | Function | Input |
| --- | --- | --- |
| producer / winery language | `isProducerLine` | the whole **line** of `OcrWord`s |
| non-brand keyword | `hasNonBrandKeyword` | line `rawText` **and** candidate value |
| sentence fragment | `isSentenceFragment` | line `rawText` **and** candidate value |
| varietal or designation | `isPurelyVarietalOrDesignation` | candidate value |
| generic product language | `isGenericProductLanguage` | candidate value |
| location or appellation | `isLocationOrAppellationLike` | candidate value |
| domain / URL | `isDomainLike` | candidate value |
| low-information fragment | `isLowInformationFragment` | candidate value |
| too many words | length | candidate value |
| no letters / too short | length | candidate value |

Three of these already consult line context: `isProducerLine` reads the entire
line, and `hasNonBrandKeyword` / `isSentenceFragment` read the line `rawText`.

### Line-level verdicts (`BrandLineDiagnostic`)

`lines[]` carries `rawText`, `kept`, and `reason` from `BRAND_LINE_REASONS`,
which includes the same semantic categories plus `candidate-positive` /
`candidate-plausible`. **This is a per-line semantic judgement the pipeline
already computes.**

### Other available signals

`brandClass` from `classifyBrandLine` (`positive` / plausible), `lineIndexes`,
`assembly`, `passId` / `passKind` / `regionName`, `supportPassIds`
(cross-pass corroboration), `ocrEvidenceScore`, `ocrConfidence`, and the score
components.

### Signals that do NOT exist

No vintage/numeric-pattern classifier, no importer/distributor classifier
distinct from `non-brand-keyword`, no address/city/state classifier, no
regulatory-phrase classifier separate from the keyword list, no capitalization
feature, and no neighbouring-line context beyond the candidate's own line. These
are **absent**, and no case may be classified using them.

## Key structural fact, established before classification

A **kept** candidate has, by invariant, failed **none** of the ten checks. So the
winner's own diagnostics can never carry a negative semantic signal. Any
"available negative context" must therefore come from a *different* object — in
practice the candidate's **containing line**, whose verdict the pipeline already
computes but which a sub-window candidate can escape.

## Frozen winner-role taxonomy

`OVERWIDE_BRAND_SUPERSET` · `PRODUCER_OR_WINERY_NAME` · `VINEYARD_OR_SITE_NAME` ·
`IMPORTER_DISTRIBUTOR` · `APPELLATION_OR_GEOGRAPHY` ·
`VARIETAL_OR_PRODUCT_DESCRIPTOR` · `REGULATORY_OR_WARNING_TEXT` ·
`ADDRESS_OR_CONTACT_TEXT` · `OCR_FRAGMENT` · `OTHER_BRANDLIKE_TEXT` · `OTHER` ·
`UNDETERMINABLE`

Roles are assigned from the **existing predicates and line verdicts only**, never
from my own reading of what a phrase means.

## Frozen failure-type classification

1. **`AVAILABLE_NEGATIVE_CONTEXT_UNUSED`** — an existing deterministic signal
   already marks the winner or its containing line as non-Brand, and ranking does
   not use it. Operational test: the winner's containing line is `kept: false`
   with a semantic `reason`, while the winner itself passes every check.
2. **`CONTEXT_NOT_PROPAGATED`** — the containing line is kept, but its `rawText`
   is strictly larger than the candidate value, so context exists in OCR that the
   candidate representation does not carry.
3. **`SEMANTICALLY_AMBIGUOUS_FROM_CURRENT_EVIDENCE`** — neither holds: the winner
   is locally as Brand-like as the truth on the evidence present.
4. `OTHER` / `UNDETERMINABLE`.

## Control population

The 16 cases correct under `E+S′` are diagnosed with the identical procedure, so
any claimed distinguishing property must hold for the 21 and **not** for the 16.

## Vision constraint

Vision or VLM research is **not** recommended merely because ranking is hard. It
is earned only where case-level evidence shows the deterministic pipeline lacks
the information needed to distinguish the Brand — i.e. class 3, and only where
the containing line genuinely does not carry the distinction.
