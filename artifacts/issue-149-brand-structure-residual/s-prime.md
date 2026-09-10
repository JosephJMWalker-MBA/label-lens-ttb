# Frozen S′ definition

Frozen **before** outcomes. One question only: is residual `structure` reward what
keeps overwide supersets above the exact Brand once the other size/length terms
are neutralized?

## Evaluation dependency

Descends from the factorial checkpoint `f7ffee9c`, which descends from
`6a969e4b` and `8de5b9fc`. **Evaluation dependency only** — not a claim that any
seam belongs in production. No ranking code, weight, family behaviour,
eligibility threshold, brand-likeness rule, candidate generation, authority or
vision is changed.

## Definitions

```
S  = neutralize  0.8 × prominence(normalized)
               + 0.6 × area
               + 1.6 × meaningfulChars

S′ = S + neutralize 1.2 × structure
```

`score.total` under S′ is
`total − 0.8·prominence − 0.6·area − 1.6·meaningfulChars − 1.2·structure`.

Neutralization is applied **symmetrically to every candidate in the treated
case**, never only to the truth candidate. The eligibility gate is altered only
through E. Family and dedupe handling are untouched. No semantic Brand heuristic
is introduced.

## Why `structure` is the term under test

`structure = min(1, (informativeAlphaTokenCount + (alphaTokens > 1) + positive) / 4)`
and `informativeAlphaTokenCount` counts tokens of length ≥ 3, so it can only rise
as text is added. With prominence, area and `meaningfulChars` already neutralized,
`structure` is the **residual length-monotone reward**. It was deliberately left
intact in the prior experiment because it also encodes
`brandClass === "positive"`, a semantic signal; that exclusion was disclosed in
advance and is exactly what this experiment tests.

Neutralizing it removes semantic positivity along with the length effect. That is
accepted here because the aim is mechanistic attribution, not a proposed
production rule.

## Arms

`baseline (F0E0S0)`, `E+S (F0E1S1)`, `E+S′` — across the same 37 ranking-loss
cases. The causal comparison is `E+S → E+S′`, where the only changed factor is
whether `structure` remains active.

## Primary population

The six overwide-superset residual cases are reported separately from the other
20 unresolved cases, whose winners are unrelated text.

## Decision rule, fixed before results

- `RESIDUAL_LENGTH_HYPOTHESIS_CONFIRMED` — neutralizing `structure` resolves a
  meaningful share of the six.
- `RESIDUAL_LENGTH_HYPOTHESIS_PARTIAL` — some move, substantial superset failures
  remain.
- `RESIDUAL_LENGTH_HYPOTHESIS_EXHAUSTED` — the six do not materially move; the
  remaining unresolved cases then require a semantic-ranking explanation rather
  than another size/length adjustment.

## Carried-forward gaps, not resolved here

Per-arm authority state and full-corpus collateral for E/S remain **unreported**
from the prior experiment. They are not completed by this experiment and are not
claimed to be. They do not block this narrow mechanistic diagnosis because no
production change is proposed. **If S′ looks strong enough to motivate a real
ranking change, that becomes a stop-and-report, with collateral and authority
evaluation as prerequisites before any implementation.**
