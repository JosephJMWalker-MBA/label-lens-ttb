# Brand evidence path — current production code

Base `a9fe943` (`git-sha.txt`). Read-only inspection; nothing modified.

## Files

| File | Role |
|---|---|
| `src/pipeline/extractor/ocr-engine.ts` | tesseract.js adapter. `recognizeWords()` flattens blocks→paragraphs→lines→words into `OcrWord[]` (`text`, `rawConfidence`, `bbox`), dropping empty tokens. OEM 1 (LSTM), vendored `eng`. |
| `src/pipeline/extractor/regions.ts` | Pass planning. Primary: PSM 11 sparse, ×1.5, grayscale+normalise. Up to 4 recovery passes (rotations, edge strips, focus crops), `MAX_TOTAL_PASSES = 5`. |
| `src/pipeline/extractor/extractor.ts` | Orchestration. Runs the primary pass, calls `selectBrandObservation([primaryPass])`, plans recovery only if brand is `NOT_OBSERVED`, then re-selects over all passes **unless** the primary was already `OBSERVED`. |
| `src/pipeline/extractor/field-selection.ts` | Everything below: grouping, generation, filtering, scoring, ranking, authority. |
| `src/pipeline/analyzer/analyzer.types.ts` | Observation states and alternate/ranking contract. |
| `src/domain/evidence/evidence.schema.ts` | Validation of the emitted observation. |
| `src/fixtures/eval/metrics.ts`, `src/fixtures/eval/eval-harness.ts` | Corpus evaluation, truth comparison, failure classification. |

## 1. Word grouping / reconstruction

`lines()` (`field-selection.ts:312`) groups words in reading order into lines.
Line texts are re-joined with single spaces (`words.map(w => w.text).join(" ")`).

## 2. Candidate generation — `selectBrandObservation` (`:2188`)

Three assemblies (`BRAND_CANDIDATE_ASSEMBLIES`):

1. **`whole-line`** — every reconstructed line becomes one span.
2. **`line-window`** — contiguous sub-spans of ≤ `MAX_BRAND_WORDS` (4) words,
   produced by `lineWindows()`.
3. **`multi-line-merge`** — a seed from line *n* joined to a seed from line *n+1*,
   capped at `MAX_MULTI_LINE_SEEDS_PER_LINE = 3` per line, requiring
   `alignment ≥ 0.3`, `proximity > 0`, ≤ 3 alpha tokens, and **at least one side
   already classified `positive`**.

**Critical gate on sub-spans.** Line windows are generated only when
`shouldTrimWholeLineCandidate(wholeLineCandidate)` is true (`:1944`):

```ts
if (!candidate || candidate.brandClass !== "positive") return false;
return residualPenalty(candidate.words) > 0.25;
```

So sub-spans are attempted **only if the whole line already produced a candidate
AND that candidate is `positive` AND it is noisy**. If the whole line is *rejected*
by any filter, `candidate` is `undefined`, the function returns `false`, and **no
sub-span of that line is ever considered.**

## 3. Candidate filtering — `analyzeBrandLine` (`:1626`) / `analyzeBrandSpan` (`:1791`)

Both apply the same ordered rejection ladder, first match wins
(`BRAND_LINE_REASONS`):

| Order | Reason | Rule |
|---|---|---|
| 1 | `producer-line` | a `PRODUCER_WORD` (produced/bottled/made/vinted/cellared/grown/packed/blended) **and** a standalone `by` |
| 2 | `no-letters-or-too-short` | cleaned value < 2 chars or no letters |
| 3 | `non-brand-keyword` | `NON_BRAND_LINE` regex (alcohol, vol, government, warning, contains, sulfites, net, contents, ml, imported, appellation, …) or a `COMPACT_NON_BRAND_KEYWORD` substring |
| 4 | `too-many-words` | cleaned value has > `MAX_BRAND_WORDS` (4) space-separated words |
| 5 | `domain-like` | any token matching `label.tld` syntax, or a `http(s)://` / `www.` prefix |
| 6 | `varietal-or-designation` | every alpha token in `VARIETAL_OR_DESIGNATION` |
| 7 | `generic-product-language` | every alpha token varietal **or** `GENERIC_PRODUCT_TOKEN` |
| 8 | `location-or-appellation` | a known phrase, or ≥2 tokens ending in a country name with `-`/`,` |
| 9 | `low-information-fragment` | joined alpha < 4 chars, or every token ≤ 2 chars |
| 10 | `sentence-fragment` | ends in sentence punctuation without a positive signal; or first word lowercase with ≥1 lowercase content word; or ≥2 lowercase content words |

Survivors are classified by `classifyBrandLine` (`:1508`) into
`excluded` / `positive` / `plausible`. **`positive` requires
`hasPositiveBrandSignal`: a possessive `'s`, or a token in `BRAND_DESIGNATOR`
— exactly `{cellars, cellar, estate, estates, vineyard, vineyards, winery,
wineries}`.** Everything else that survives is `plausible`.

### Designator, possessive, and producer/bottler behaviour

- A **designator** or **possessive** is the *only* route to `positive`, and
  `positive` is worth `+2` in the score — the single largest score term.
- **Producer/bottler text is dropped entirely** at rule 1, before any sub-span is
  considered. A brand that appears only inside a "… BOTTLED BY …" line is
  therefore unreachable.

## 4. Scoring — `scoreBrandCandidate` (`:2045`)

```
total = 2·[brandClass = positive]
      + 1.6·meaningfulChars      (min(1, alphaChars/14))
      + 1.2·structure            (min(1, (informativeTokens + multiToken + positive)/4))
      + 1.0·ocrEvidenceScore
      + 0.8·prominence           (height / maxProminence)
      + 0.6·area                 (area / maxArea)
      + 0.3·centrality
      + 0.25·alignment           (multi-line merges only)
      + 0.2·lineProximity        (multi-line merges only)
      − 1.8·lowInformationPenalty  (share of ≤2-char tokens)
      − 1.4·residualPenalty        (share of suspicious tokens)
```

## 5. Ranking — `brandRanking` (`:2094`) + `compareCandidateRanking` (`:968`)

A candidate is **score-eligible** when
`prominence > maxProminence·0.4 + 1px`. Eligible candidates compare
`score-eligibility → ranking-score → prominence → ocr-evidence → value-key`
(`orderingMode: "score-first"`); ineligible ones compare
`score-eligibility → prominence → ocr-evidence → ranking-score → value-key`
(`"prominence-first"`). Before ranking, `bestFamilyCandidates` and
`dedupeBestCandidates` collapse overlapping spans.

## 6. Top-k and selected-candidate reporting

`ranked[0]` is the selection. All later candidates that do not `corroborate` it
become `alternates`, in rank order. `brandInTopK` (`src/fixtures/eval/metrics.ts:138`) evaluates
`[value, ...alternates]` with normalized matching — so "top-3" is genuinely the
top of the production ordering, not a re-ranked view.

## 7. Authority-state assignment — `buildBrandObservation` (`:2270`)

Applied **after** ranking, in this order:

1. no candidates → **`NOT_OBSERVED`** (`abstentionReason`:
   `no-brand-region-text` | `unsupported-candidates-only`);
2. `competing.length > 0` (a rival with `prominence ≥ best.prominence · 0.8`)
   **or** `weakContestedLead` (`best.ocrEvidenceScore < 0.6` and any
   non-corroborating alternate) → **`AMBIGUOUS`** / `competing_candidates`;
3. `positivelyDistinguished = best.brandClass === "positive" && best.ocrEvidenceScore ≥ 0.6`
   — if false → **`AMBIGUOUS`** / `single_unconfirmed_candidate`;
4. otherwise → **`OBSERVED`**.

**Brand never emits `LOW_CONFIDENCE`.** Only alcohol does (`:1143`). Brand uses
three states: `OBSERVED`, `AMBIGUOUS`, `NOT_OBSERVED`.

## 8. Do ranking and authority share logic or data?

**They share data but not logic, with one exception.**

- Shared *data*: both read `brandClass` and `ocrEvidenceScore`.
- Distinct *logic*: ranking uses the weighted score plus a prominence-eligibility
  switch; authority uses three boolean predicates and never consults
  `rankingScore`.
- **The exception that matters:** `brandClass === "positive"` is simultaneously
  the largest single ranking term (`+2`) and a hard authority precondition. A
  candidate can win the ranking on other terms, but **no amount of ranking
  strength can substitute for the positive signal at the authority gate.**

This coupling is why a change to ranking cannot move authority, and why the two
must be measured separately — which the probe does.

## 9. Corpus evaluation and truth comparison

`runCaseArtifacts` (`src/fixtures/eval/eval-harness.ts`) → `extractLabelEvidenceDetailed` (real extractor, image +
digest only) → `buildCaseReport` compares against
`src/fixtures/eval/eval-manifest.json`. `brandExactMatch` folds case/whitespace;
`brandNormalizedMatch` strips diacritics and non-alphanumerics;
`normalizedIncludes` is diagnostic-only. `classifyBrand` (`src/fixtures/eval/metrics.ts:181`)
assigns the repository's own failure class and has a `correct-uncertainty` branch
for `AMBIGUOUS`/`LOW_CONFIDENCE` on `knownAmbiguous` truth.
