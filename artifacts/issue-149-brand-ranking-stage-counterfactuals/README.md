# Issue #149 — F/E/S ranking-stage counterfactuals

Offline counterfactual diagnosis. **Production behaviour changed: no.** No family
key, ranking weight, prominence threshold, filter, generation or authority was
modified.

| | |
| --- | --- |
| Branch | `research/brand-ranking-stage-counterfactuals` |
| Evaluation dependency | `6a969e4b` (ranking diagnosis) → `8de5b9fc` (oracle). **Evaluation dependency only** |
| Frozen switches | `80f849ee47acf037bb4e6ea102b3b7bb0077c7473298c0ba8e44f9db5aec72bb` |
| **Baseline reproduction** | **115/115 exact**, zero failures |

The offline evaluator reproduces production's selected value on every case before
any switch is applied. No new production seam was introduced.

## Eight arms across all 37 cases

| Arm | Top-3 | Selected correctly | Oracle survives family | Regressions |
| --- | --- | --- | --- | --- |
| `F0E0S0` baseline | 16 | **0** | 27 | — |
| `F1E0S0` family only | 19 | **0** | 37 | 0 |
| `F0E1S0` eligibility only | 17 | **3** | 27 | 0 |
| `F0E0S1` size-score only | 17 | **4** | 26 | 0 |
| `F1E1S0` | 20 | 3 | 37 | 0 |
| `F1E0S1` | 20 | 4 | 37 | 0 |
| `F0E1S1` | 21 | **11** | 26 | 0 |
| `F1E1S1` all three | **25** | **11** | 37 | 0 |

Minimum sufficient sets: **E** 3 · **S** 4 · **E+S** 4 · **NONE_OF_THE_EIGHT** 26.

## Answers

1. **Family suppression independently sufficient? No.** F alone recovers **0**. It
   raises family survival 27 → 37 and top-3 by 3, and converts **none** to top-1.
2. **Eligibility gate independently sufficient?** Weakly — **3 of 37**.
3. **Size/length score terms independently sufficient?** Weakly — **4 of 37**.
4. **Interactions.** E+S is **superadditive**: 3 + 4 = 7 separately, **11**
   together, with **4 cases recoverable only by both**. F is neither sufficient
   nor necessary: `F+E = E`, `F+S = S`, `F+E+S = E+S` on selection. F moves
   candidates into top-3 and never to the top.
5. **Dominant stage? No.** The architecture is jointly size-biased, and no single
   stage carries the population.
6. **All-three recovery: 11 of 37**, with **26 recoverable by none of the eight arms.**

## Why 26 remain unrecoverable — and what it says about a choice I made

Under `F1E1S1` the oracle sits at **rank 1 in 11 of the 26** — second place,
beaten by a single candidate. Of the 26 winners, **6 are overwide supersets of the
Brand itself**:

| Brand | Still beaten by |
| --- | --- |
| Cooley Bay | `Cooley Bay Winery` |
| Curious | `Red Wine Blend Curious` |
| Pacheca | `PACHECA DOURO D.O.C` |
| Mauro Molino | `AZIENDA AGRICOLA MAURO MOLINO` |
| Blazic | `BLAZIC FRANCO` |

**This points directly at the boundary call recorded in the frozen switches.** S
excluded `structure` (+1.2) because it also encodes `brandClass === "positive"`,
a semantic signal — yet `structure` is length-monotone via
`informativeAlphaTokenCount`, which counts tokens of length ≥ 3. With
prominence, area and `meaningfulChars` neutralized, `structure` is the **residual
length-reward term**, and a superset still outscores its own Brand. The exclusion
was defensible and disclosed in advance, but these six cases are the direct
consequence of it.

The other 20 winners are unrelated text, so they are not explained by the residual
length term.

## Gaps, stated rather than papered over

**Authority state per arm was not produced.** The simulator reproduces the family
stage, dedupe stage and comparator; it does **not** implement the authority gate,
which would require reimplementing `buildBrandObservation`. Per-arm
`correct OBSERVED` / `wrong OBSERVED` are therefore **unreported, not zero**.
Independently, the oracle experiment found 0 correct `OBSERVED` even in its one
correctly-selected case, so authority is a separate binding constraint.

**Full-corpus collateral for E and S was not measured.** All 115 cases ran for the
reproduction gate, but arms were computed only for the 37. E and S are
architecture-level treatments and their effect on the other 78 is unknown. No
treatment is called promising here, so nothing rests on the 37 alone.

**F is oracle-assisted and non-deployable** by construction. The two
instance-only dedupe cases are kept distinguishable: `patricia-green-cellars`
(minimal set `S`) and `approved-wine-078` (`NONE_OF_THE_EIGHT`).

## Smallest architecture change actually earned

**None yet.** On this evidence a ranking change is not earned: the best
counterfactual recovers 11 of 37 while requiring two simultaneous architectural
changes, and 26 cases resist all eight arms.

The smallest next *diagnostic* — not implementation — is the **`S′` variant
including `structure`** in the neutralized set. It is a one-line change to the
frozen switch set, reuses this evaluator, needs no production change, and directly
tests whether the residual length-reward term explains the 6 superset cases. If
`S′` does not move them, the length hypothesis is exhausted and the remaining
failures are semantic rather than size-driven.

Authority remains untouched and should be diagnosed separately.

## Verification

- Baseline reproduction 115/115 exact — the gate for everything above.
- Determinism: primary and repeat byte-identical on both artifacts.
- Every case evaluated in every arm, so interactions are observable.
- Zero regressions in all eight arms.
