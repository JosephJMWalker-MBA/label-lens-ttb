# Evidence-availability preflight

Read-only, zero-OCR. Performed before any classification.

**Two separate answers, and they differ.**

| Question | Answer |
| --- | --- |
| Can the **stage location** of each of the 44 losses be established? | **Yes**, for all 44, with one field carried forward and one asymmetric verification. |
| Can the **cost** of a one-rule filter relaxation be measured? | **No.** The required all-candidate evidence is not committed anywhere. |

## Population freeze

The 44 cases were taken by reading the case IDs classified
`CANDIDATE_GROUPING_MISS` in merged PR #217's `per-case-attribution.json`, whose
`artifact-manifest.sha256` verifies at this base. They were **not** recomputed
from a looser predicate. The script halts if the count is not exactly 44, if the
corpus is not exactly 115, or if any frozen ID is absent from the underlying
evidence.

## Stage evidence — available

For all 44 cases, with no missing fields:

| Requirement | Field | Status |
| --- | --- | --- |
| `truthInRawOcr` | `truthInRawOcr` | present, all 44 true |
| `truthOnReconstructedLine` | `truthOnReconstructedLine` | present, 43 true / 1 false |
| reconstructed line texts | `lineTexts` | present, non-empty on all 44, **capped at 12 by the original probe** |
| truth-bearing candidate formed | — | see below |
| every rejection reason on that candidate | `truthFilterReasons` | present |
| one reason or several | derived from `truthFilterReasons` | 41 have ≥1, 3 have none |
| geometry, confidence, provenance | `rankedCandidates` | kept candidates only, capped at 6 |

### `truthReachedCandidate` cannot serve as the formation signal

The brief asks for `truthReachedCandidate` "or its exact equivalent". The
committed field exists — but tracing it to source shows it is
`diagnostics.brandCandidateContainsAcceptable`, and `eval-harness.ts:332` computes
that over `keptBrandCandidates` only. It is therefore a **synonym for
`truthAmongKeptCandidates`**, which the data confirms: across all 115 cases the
pair takes only the values `(false,false)` ×78 and `(true,true)` ×37, never
`(true,false)`.

Using it as a formation signal would have classified all 44 cases
`CANDIDATE_FORMATION_LOSS` and been wrong. It is reported per case with that
warning attached, and it is not used to classify.

**The actual formation signal** is `truthFilterReasons`, derived by the original
probe from `brandCandidateDecisions.filter(!kept && matchesTruth)`. A non-empty
value proves a truth-bearing candidate **object was formed and then rejected**;
an empty value is consistent with no such object being formed.

### Independent verification of the line flag, and its asymmetry

Each case's retained lines were re-tested with the governed normalization
transcribed from `src/fixtures/eval/metrics.ts`.

- **38** cases: truth found in the retained lines → the flag is independently
  confirmed.
- **5** cases: truth not found, but the retained list is at the 12-line cap →
  **unverifiable**, not contradictory.
- **0** contradictions.

The asymmetry is deliberate. Finding the truth confirms the flag. Not finding it
in a capped list cannot refute it, so calling those five contradictions would
manufacture a finding out of a truncation artifact.

## Cost evidence — not available

Measuring what removing one rule would *admit* requires the complete candidate
decision list. It is not committed.

| Required for cost | Available | Why not |
| --- | --- | --- |
| all candidate objects, including non-truth | **no** | the artifact stores `brandCandidateDecisions.filter(kept && ranking).slice(0, 6)` — rejected candidates are absent entirely, kept ones capped at six |
| rejection reasons for those candidates | **no** | only `truthFilterReasons` is committed, and only for candidates carrying the truth |
| values and provenance for all candidates | **no** | present for up to six kept candidates; absent for every rejected one |
| ranking inputs for newly admitted candidates | **no** | committed only for candidates already kept and ranked; a newly admitted candidate has no committed prominence or score components, so its rank cannot be computed |
| evidence for all 10 Brand-absent cases | **no** | same gap — their rejected candidates are not committed |
| evidence for currently correct and correctly withheld cases | **no** | displacement needs the currently-rejected competitors, which are not committed |

**Prior simulation artifacts were checked and are not reusable.**
`e1a-too-many-words-simulation/filter-results.json` records the reason
distribution of sub-spans generated *under the E1a treatment*, not the unmodified
pipeline's decision list, so it cannot say what removing `producer-line`,
`non-brand-keyword`, `domain-like` or `sentence-fragment` would admit. E1b's
Phase 2 was never run.

**Consequence:** the counterfactual is not performed, `counterfactual-results.json`
is deliberately absent, the cost conclusion is `INSUFFICIENT_COST_EVIDENCE`, and
no relaxation is described as safe. Benefit figures are published only as labelled
upper bounds, never as recoverable-case counts.

**No OCR rerun is requested to fill any gap.**

## Prior art that bounds the largest category

`too-many-words` is the largest sole blocker (17 cases). Two treatments targeting
it have already been simulated and killed, in artifacts merged before this sprint:

- **E1a** — sub-span generation for `too-many-words` lines. **KILLED**: truth
  survived as a kept candidate in 17 of 23 targeted cases, but 8 of 10
  Brand-absent cases emitted a value, 2 wrong values reached `OBSERVED`, and 12
  currently-correct selections broke.
- **E1b** — the same, gated by production's own prominence-eligibility rule.
  **KILLED in Phase 1**, and recorded as closing the brand sub-span-generation
  family.

This sprint does not reinterpret either verdict. It records that the largest
upside category is not an open question, which matters for what a successor
experiment should target.

## What was not done

No OCR, no recognizer. No production code changed. No filter relaxed or modified.
No candidate-construction, ranking, selection or authority change. No truth,
normalization, threshold or state-semantics change. No corpus regenerated,
expanded or substituted. No aliases added. No treatment implemented. PR #195
untouched; PRs #214, #216 and #217 not reinterpreted.
