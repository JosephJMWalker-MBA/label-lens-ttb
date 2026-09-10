# Frozen ranking-feature inventory

Traced from code, not inferred from names. Frozen **before** the 37 cases were
classified. Diagnosis only — no scoring, ranking, family key, filter, generation
or authority behaviour is changed.

## Evaluation dependency

This branch descends from the oracle checkpoint `8de5b9fc` because the diagnosis
requires the oracle-correct candidates that experiment produced. The ancestry is
an **evaluation dependency only** and is not a claim that the oracle seam belongs
in production. The seam remains default-off with 115/115 parity.

## Pipeline order — decisive for the family-vs-ranking distinction

```
scored = candidates.map(scoreBrandCandidate)          // score.total per candidate
ranked = dedupeBestCandidates(bestFamilyCandidates(scored)).sort(compareCandidateRanking)
```

`bestFamilyCandidates` and `dedupeBestCandidates` run **before** the comparator.
A candidate removed there never reaches `compareCandidateRanking`, and its loss
is **not** a comparator-ordering failure.

- `bestFamilyCandidates` keeps the highest `score.total` per
  `candidateFamilyKey`, which for an ordinary candidate is
  `line:${lineIndexes[0]}` — **line index only, not pass id**. Line indices
  restart per pass, so candidates from the same line index of *different passes*
  share one family.
- `dedupeBestCandidates` keeps the highest `score.total` per normalized value
  `key(value)`, merging support.

Both use `score.total`, and neither consults the eligibility gate below.

## `compareCandidateRanking` — the comparator chain

Ordering is lexicographic over `ranking.comparator`. For Brand, `brandRanking`
emits one of two chains depending on a boolean gate:

```
prominenceFloor = maxProminence * BRAND_SCORE_PROMINENCE_FLOOR_RATIO   // 0.4
scoreEligible   = candidate.prominence > prominenceFloor + BRAND_SCORE_PROMINENCE_BUFFER_PX  // +1px
```

**`score-eligibility` is the PRIMARY comparator, descending.** Every eligible
candidate therefore outranks every ineligible candidate regardless of score.

- eligible chain: `score-eligibility`, `ranking-score` (`score.total`),
  `prominence`, `ocr-evidence-score`, `normalized-value-key` (asc)
- ineligible chain: `score-eligibility`, `prominence`, `ocr-evidence-score`,
  `ranking-score`, then the key

`normalized-value-key` ascending is the final deterministic tie-breaker.

## `prominence` is glyph height

`prominence: geometry.height` — the pixel height of the candidate's span. It is
**not** a semantic salience measure. `maxProminence` is `Math.max` of
`prominence` over the whole kept-candidate pool, so the tallest text anywhere on
the label sets the denominator and the eligibility floor for every candidate.

## `score.total` — every term, with weight

```
+2.0   brandClass === "positive"
+1.6 × meaningfulChars     min(1, alphaChars/14)
+1.2 × structure           min(1, (informativeTokens + (alphaTokens>1) + positive)/4)
+1.0 × ocrEvidenceScore
+0.8 × prominence/maxProminence
+0.6 × area/maxArea
+0.3 × centrality
+0.25 × alignment          (default 1)
+0.2 × lineProximity       (default 1)
−1.8 × lowInformationPenalty
−1.4 × residualPenalty
```

`maxProminence` and `maxArea` are pool-level denominators, so a candidate's score
depends on the rest of the pool, not only on itself.

## Complete ordering-relevant input list

1. `score.total` and each term above
2. `prominence` (glyph height), raw and normalized
3. `maxProminence`, `maxArea` — pool-level denominators
4. `scoreEligible` — the primary boolean gate
5. `ocrEvidenceScore`
6. `brandClass` (`positive` worth +2.0 and a structure point)
7. `meaningfulChars`, `structure`, `informativeAlphaTokenCount`
8. `area`, `centrality`, `alignment`, `lineProximity`
9. `lowInformationPenalty`, `residualPenalty`
10. `candidateFamilyKey` → `line:${lineIndexes[0]}` (pre-comparator survival)
11. `key(value)` — dedupe identity and final tie-breaker
12. comparator chain identity, which itself depends on `scoreEligible`

Pass provenance (`passId`, `passKind`, `regionName`) is **not** an ordering input;
it appears only in provenance output. Verified by tracing every occurrence.

## Primary classes, assigned in pipeline order

1. **FAMILY_SUPPRESSION** — the oracle candidate is removed by
   `bestFamilyCandidates` or `dedupeBestCandidates` and never reaches the
   comparator. Not a scoring failure.
2. **ELIGIBILITY_GATE** — the oracle reaches the comparator but is
   `scoreEligible: false` while the winner is `true`, so it loses on the primary
   comparator irrespective of score. A `NORMALIZATION_EFFECT`, because the gate
   is defined against pool-level `maxProminence`.
3. **SCORE_ORDERING** — both share eligibility and the oracle loses on
   `score.total`.
4. **TIE_BREAK** — decided at `prominence`, `ocr-evidence-score` or the
   normalized-value key after earlier entries tie.
5. **OTHER** / **UNDETERMINABLE**.

`ELIGIBILITY_GATE` is reported separately from `SCORE_ORDERING` because the two
imply different repairs: the first is a gate whose denominator is the label's
tallest text, the second a weighting question.

## Authority boundary

The single correctly selected oracle candidate that remained `AMBIGUOUS` is
recorded as a **downstream authority** observation and is not used to explain any
of the 37 ranking losses.
