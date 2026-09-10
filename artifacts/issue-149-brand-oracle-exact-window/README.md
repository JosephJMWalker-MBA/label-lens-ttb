# Issue #149 — oracle exact-window counterfactual

**Verdict: `DOWNSTREAM_BOTTLENECK_ALSO_PRESENT`. Enumeration research is NOT
earned on this evidence.**

**Ceiling measurement, not a proposed mechanism.** The oracle token run is
identified offline using governed Brand truth, so the treatment is **not
deployable**. It measures only what the unchanged downstream machinery does when
the already-visible exact Brand window is made available.

## Identity

| | |
| --- | --- |
| Base SHA | `195182c5ccef51e4a15767801d184d12ab07e52a` (authoritative `main`, includes PR #224) |
| Branch | `research/brand-oracle-exact-window-counterfactual` |
| Diagnosis dependency | PR #224, the 40 class-E cases |
| Oracle rule | `b57d6fc6cbd5698bf5748c8af5bc9a429a38eee8d9d54b1b1dd795b4fb118def`, frozen before results |
| Seam | `oracleExactWindows`, default `[]` |
| Default-path parity | **115/115 byte-identical**, re-verified after the instrument correction |

## Injection route — the synthetic-pass approach was tested and rejected

`candidateFamilyKey` returns `line:${lineIndexes[0]}` for ordinary candidates —
line index only, **not** pass id — and indices restart per pass, so
`bestFamilyCandidates` keeps one winner for family `line:0` across all passes. A
synthetic single-line pass necessarily joins that family and can displace a real
candidate: a behaviour change for a reason other than the added candidate.

`passKind`, `regionName` and `passId` appear in `field-selection.ts` only in
provenance outputs — `recoveryPassUsed`, `sourceRegion`, `supportPassIds` — never
in scoring or ranking. The seam therefore inherits the true containing pass's
identity, so provenance reports the genuine source.

**Sham control passes:** a run that already exists as a whole-line candidate
emits nothing and leaves observation, provenance and authority untouched; a run
absent from every line is inert; and an oracle candidate is not exempt from the
filters. One test asserts the oracle *does* change a case, so inertness cannot
pass vacuously.

## Why class E exists — the mechanism

Sub-window enumeration is gated on `shouldTrimWholeLineCandidate`, which requires
a **kept, positive** whole-line candidate. On a rejected whole-line span — the
government-warning-line shape — the candidate is `undefined`, so **no sub-windows
are enumerated at all**. Class E is not a search that missed the window; it is a
search that never ran. The oracle span is therefore emitted *before* that gate,
recorded as a deliberate choice in the frozen rule: honouring the gate would
guarantee a null result by construction.

## Results for the 40 class-E cases

| | |
| --- | --- |
| Oracle candidate produced | **39 / 40** |
| Survives the filters | **38** |
| Reaches top 3 | 13 |
| Reaches top 1 | **1** |
| Selected | 1 |
| Selected correctly | **1** |
| Reaches `OBSERVED` | **0** |
| Correct `OBSERVED` | 0 |
| Wrong `OBSERVED` | **0** |

### Outcome classification

| Class | Cases |
| --- | --- |
| `ENUMERATION_ONLY` | **0** |
| `ENUMERATION_PLUS_FILTER` | 1 |
| `ENUMERATION_PLUS_RANKING` | **37** |
| `ENUMERATION_PLUS_AUTHORITY` | 1 |
| `UNDETERMINABLE_ORACLE_NOT_PRODUCED` | 1 |

Supply was not the limiting step. The correct candidate cleared the filters in 38
of 39 cases and then **lost at ranking in 37**: `Vino Alpino` lost to
`Azienda Agricola Terre Sparse`; `Patricia Green Cellars` to `ESTATE VINEYARD`;
`Cooley Bay` to `Cool&y`. The one correct selection, `approved-wine-042` →
`DOMAINE QUIVY`, remained `AMBIGUOUS`. The one filter rejection was
`approved-wine-006`, whose oracle value `DARK HORSE.` was rejected as
`sentence-fragment`.

## Full-corpus safety, all 115 cases

| Metric | Baseline | Treatment |
| --- | --- | --- |
| Correct selected Brand | 29 | **30** |
| Wrong selected Brand | 76 | 75 |
| Correct `OBSERVED` | 4 | 4 |
| **Wrong `OBSERVED`** | **0** | **0** |
| Top-1 changes | — | 1 |
| Top-3 changes | — | 13 |
| Currently-correct displaced | — | **0** |
| Brand-absent became positive | — | **0** |
| Kept candidates | 482 | 536 |

**Integrity: clean.** 0 of the 75 untreated cases changed, as required — only
class-E cases received a non-empty run list.

## Verdict

`DOWNSTREAM_BOTTLENECK_ALSO_PRESENT`, with the enumeration thesis weakened as a
standalone lever.

Stated as a ceiling: **for 1 of the 40 cases the downstream machinery succeeds
when supplied an oracle exact candidate, and for 0 does it reach a correct
authoritative result.** This is emphatically not "40 Brands can be fixed by
adding more windows."

A generator alone would convert almost none of the 40. Enumeration is necessary
but demonstrably insufficient, so generator work cannot be justified on this
evidence without ranking work beside it.

## Search-space characterization

Recorded because it characterizes the problem, not because headroom was earned.
41 samples across the treated cases:

| | min | median | max |
| --- | --- | --- | --- |
| Truth token length | 1 | 2 | 4 |
| Containing line length | 2 | 6 | 15 |
| Contiguous subspans in the line | 3 | 21 | 120 |

Truth token lengths: 1 token ×16, 2 ×18, 3 ×6, 4 ×1 — all within the existing
`MAX_BRAND_WORDS` of 4. Every containing line is ≤ 15 tokens, so the bounded
search is at most ~60 windows per line under the existing width cap. Position is
not concentrated: 16 of 41 runs are flush to the line start, 13 flush to the end,
the remainder interior. The space is tractable — which is precisely why the
ranking result, not the search cost, is the decisive finding.

## Verification

- Determinism: primary and repeat byte-identical on all three artifacts.
- Default-path parity 115/115, re-verified after the instrument correction.
- 10 seam tests including the sham control and two separator regressions.
- Instrument defect and its effect disclosed in `instrument-correction.md`; the
  superseded aggregate is retained, not deleted.
- Production behaviour changed by default: **no**.
