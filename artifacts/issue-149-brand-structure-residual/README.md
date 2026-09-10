# Issue #149 — S′ residual-structure counterfactual

**Verdict: `RESIDUAL_LENGTH_HYPOTHESIS_PARTIAL`.**
Only **2 of the 6** predicted superset cases move. **S′ is not a production candidate.**

Offline counterfactual. **Production behaviour changed: no.**

| | |
| --- | --- |
| Branch | `research/brand-structure-residual-counterfactual` |
| Evaluation dependency | `f7ffee9c` → `6a969e4b` → `8de5b9fc`. **Evaluation dependency only** |
| Frozen S′ | `ca07f75d1f2710a03ad8b51fef20c33486779bd2ea8c9d934fff271eb8be6bd0` |
| Baseline reproduction | **115/115 exact** |
| Determinism | **PASS**, fail-closed |

## Arms (37 ranking-loss cases)

| Arm | Top-3 | Selected correctly |
| --- | --- | --- |
| baseline | 16 | **0** |
| `E+S` | 21 | **11** |
| `E+S′` | 28 | **16** |

`structure` neutralization: **+7 recovered, −2 regressed, net +5**; 21 still unresolved.

## The six superset cases — the population the hypothesis named

| Case | Brand | structure exact vs winner | `E+S` | `E+S′` |
| --- | --- | --- | --- | --- |
| approved-wine-051 | Pacheca | 0.250 vs 1.000 | `PACHECA DOURO D.O.C` | **`Pacheca` ✓** |
| wine-multi-artifact-06 | Mauro Molino | 0.750 vs 1.000 | `AZIENDA AGRICOLA MAURO MOLINO` | **`MAURO MOLINO` ✓** |
| approved-wine-012 | Cooley Bay | 0.750 vs 1.000 | `Cooley Bay Winery` | `Cooley Bay Winery` |
| approved-wine-110 | Cooley Bay | 0.750 vs 1.000 | `Cooley Bay Winery` | `Cooley Bay Winery` |
| approved-wine-046 | Curious | 0.250 vs 1.000 | `Red Wine Blend Curious` | `Red Wine Blend Curious` |
| wine-multi-artifact-05 | Blazic | 0.250 vs 0.750 | `BLAZIC FRANCO` | `COLLIO` (still wrong) |

**2 of 6 move.** In the four that do not, the winner *did* carry higher
`structure` — 1.000 against the Brand's 0.250–0.750 — yet removing that advantage
still did not flip them. The residual length term was therefore **not** what kept
those supersets on top.

## The effect is not specific to the named mechanism

**5 non-superset cases also flip** (`approved-wine-037`, `-076`, `-094`, `-099`,
`wine-multi-artifact-08`), so neutralizing `structure` is a broad perturbation
rather than a targeted correction of superset preference.

## Two regressions show `structure` is doing real semantic work

| Case | `E+S` | `E+S′` |
| --- | --- | --- |
| luigi-giovanni-live | correct | `VANNI` — a fragment |
| approved-wine-067 | correct | `JULIETTE VRIL` |

Without `structure`, short low-information fragments win. This is the concrete
vindication of the reason it was excluded from S in the first place: it encodes
`brandClass === "positive"` alongside the length-monotone term, and removing it
strips semantic evidence.

## Consequences

**S′ is not a production candidate**, so the escalation condition in the frozen
definition is **not triggered**: recovery of 16/37 accompanied by two regressions
and demonstrated semantic damage does not motivate a ranking change. Full-corpus
collateral and authority evaluation are therefore not required here — and are
**not** claimed to have been done.

**The four unmoved superset failures require a semantic-ranking explanation**, not
another size or length adjustment. Size and length are now exhausted as
explanations for them: prominence, area, `meaningfulChars` and `structure` have
each been neutralized, and `Cooley Bay Winery` still outranks `Cooley Bay`.

## Carried-forward gaps, still unreported

Per-arm **authority state** and **full-corpus collateral for E/S** remain
unreported from the factorial experiment. This experiment did not complete them
and does not claim to.
