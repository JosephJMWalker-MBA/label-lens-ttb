# Issue #149 — Brand `too-many-words` counterfactual cost

**Verdict: `GLOBAL_RELAXATION_KILL`. Narrower-rule research is NOT earned by this evidence.**

Evaluation-only. No production behaviour changed; full-corpus parity is 115/115
byte-identical. No filter was modified.

## Identity

| | |
| --- | --- |
| Frozen base | `4bb3140b56dd1b9aee2c7b015e90a09d0902fe34` |
| Branch | `research/brand-too-many-words-counterfactual` |
| Preregistration | `0f990f390a2e2325d6873280f0539a6c5c8b1ee3591ca363e2b0f7710d4b2522`, frozen before any treatment result |
| Population | 115 governed cases — 105 Brand-present, 10 Brand-absent |
| Seam | `selectBrandObservationWithTooManyWordsCounterfactual`, default-off, evaluation-only |

## Instrumentation completeness

Committed evidence was insufficient, verified not assumed: `brandCandidateDecisions`
is capped at 24 per case with **49 of 115 cases at the cap**, and **0 of 115**
carried `filterChecks` / `activeRejectionReasons`. A fresh instrumented run was
therefore required. OCR runs **once** per case and both arms are applied to the
same `debug.passes`, so image, OCR and candidate-window generation are frozen by
construction. Baseline rejection reasons are read from the baseline arm only and
are never inferred from the treatment arm.

## Effect 1 — true evidence recovery: zero

| | |
| --- | --- |
| Sole-blocker cases | 52 |
| …with a truth-bearing blocked candidate | **0** |
| Became eligible | 52 |
| Reached top-3 / top-1 / selected | **0 / 0 / 0** |
| Admitted but still not selected | 41 |

## The mechanism — contains, not equals

Of the 104 admitted candidates, **9 contain the governed brand and 0 equal it**:

| Case | Truth | Admitted candidate |
| --- | --- | --- |
| `approved-wine-018` | Poqr Krya | `Poqr Krya Red Still Wine 2022 Vayots Dzor` |
| `approved-wine-016` | Marques de Navarro | `Classic Wines Inc. Stamford, CT` |
| `approved-wine-006` | Dark Horse | `wT a I PINOT NOIR WINE` |

The filter was not withholding the brand. **The candidate window equal to the
brand was never formed.** Admitting the long line surfaces the whole line as the
Brand value, which is wrong. This is the same generosity artefact found in
`truthInRawOcr`: the decomposition's "truth blocked by `too-many-words`" used a
*contains* notion; a rule asking whether the candidate would yield the correct
Brand value gives zero.

## Effect 2 — admission cost

104 additional candidates across 60 cases: **0 truth-bearing, 104 non-truth**.
Kept candidates 482 → 586 (**1.22×**), max 11 in one case. Word lengths cluster
at 5–6 (73 of 104).

## Effect 3 — ranking disruption

**3 currently-correct cases displaced** (3 from top-1, 2 from top-3), **0
currently-incorrect improved**, and **8 of 10 Brand-absent cases became
positive** — importer addresses and warning text.

## Effect 4 — authority: the safety property breaks

| | Baseline | Counterfactual |
| --- | --- | --- |
| Correct `OBSERVED` | 4 | **3** |
| Wrong `OBSERVED` | **0** | **1** |

`approved-wine-086`: `OBSERVED "3 STEVES WINERY"` → `OBSERVED "MPA YOUR ABILITY TO
CAl DRI ACAR EALTH PROBLE ERATE i's. MACHIN AND MAY"` — a fragment of the
government health warning, asserted authoritatively as the Brand.

## Verdict

All three KILL clauses fire independently: a new wrong `OBSERVED`; three correct
Brands displaced with nothing gained; and 104 admitted candidates with zero truth
recovery.

**Narrower-rule research is not earned.** The CONTINUE rule requires meaningful
true evidence recovery, and there was none. No narrower predicate over the same
candidate set can promote a candidate that was never formed. The nine
contains-but-not-equals candidates implicate **candidate-window generation**, not
filter breadth — a different lever, not started here.

This also refines the perception-architecture review: the 42-case
candidate-construction loss is real, but for the `too-many-words` share the
binding constraint is window formation, not filter policy.

## Verification

- Production parity **115/115 byte-identical** before the treatment ran.
- Determinism: primary and repeat byte-identical on all three artifacts.
- Every headline aggregate independently recounted from case-level rows.
- 7 seam tests, including one asserting the counterfactual genuinely differs so
  the "production unchanged" assertions cannot pass vacuously; 198 extractor tests.
