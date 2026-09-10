# Issue #149 — semantic vocabulary coverage audit at candidate scope

Read-only audit. **Production behaviour changed: no.** No rule, regex, predicate,
vocabulary, ranking feature, candidate representation, weight, OCR or model was
changed.

| | |
| --- | --- |
| Branch | `research/brand-semantic-vocabulary-coverage` |
| Dependency | `671800a5` → `283a0823` → `f7ffee9c` → `6a969e4b` → `8de5b9fc`. **Evaluation dependency only** |
| Frozen inventory | `b372744662a2d5c7bd3d5ec1c1deef69100d62434218e28a30da3eb2cce8c14a` |
| Determinism | **PASS**, fail-closed |

## Counts — 21 unresolved, fully accounted for

| Class | Cases |
| --- | --- |
| `VOCABULARY_ABSENT` | **18** |
| `EXISTING_VOCABULARY_PREDICATE_FALSE_NEGATIVE` | **2** |
| `AMBIGUOUS_EVEN_WITH_CURRENT_CONTEXT` | **1** |
| `CONTEXT_REQUIRED_BUT_NOT_PROPAGATED` | **0** |
| `OTHER` / `UNDETERMINABLE` | 0 |

Verdicts, coexisting as counts rather than one global label:
**`NEW_SEMANTIC_VOCABULARY_REQUIRED` 18** · **`EXISTING_VOCABULARY_COVERAGE_GAP` 2** ·
**`CURRENT_EVIDENCE_SEMANTICALLY_INSUFFICIENT` 1** · `CONTEXT_PROPAGATION_GAP` 0.

## The controls disqualified every existing trigger

| Trigger family | Wrong-winner rate | Correct-Brand rate | Usable? |
| --- | --- | --- | --- |
| `BRAND_DESIGNATOR` in candidate | 0.143 | 0.125 | **No** — fires equally on correct Brands |
| `NON_BRAND_LINE` in candidate | 0.000 | 0.000 | No — never fires on a kept candidate |
| `NON_BRAND_LINE` in containing line | 0.000 | **0.313** | **No** — fires *only* on correct Brands |
| `PRODUCER_WORD` in containing line | 0.000 | **0.250** | **No** — fires *only* on correct Brands |

Two of the four point **backwards**: the producer and non-brand line signals fire
on the *correct* Brand's line and never on the wrong winner's, because the Brand
is the text buried in a producer or warning line while the wrong winner sits on
its own clean line. Using them as negative evidence would demote the truth.

`CONTEXT_REQUIRED_BUT_NOT_PROPAGATED = 0` follows directly: there is no case where
the winner's line carries deterministic evidence against it.

## My own memorable example does not generalize

The `Cooley Bay Winery` mechanism is real and precisely traced — `BRAND_DESIGNATOR`
(`winery`, `cellars`, `estate`, `vineyard`) has **positive** polarity through
`hasPositiveBrandSignal`, giving the designator-bearing superset `brandClass:
"positive"` and **+2.0** over the exact Brand. But it explains **2 of 21**, and the
control rate (0.125) is indistinguishable from the wrong rate (0.143). Per the
protocol, it is reported as a coverage gap of 2 cases and **not** promoted into a
general signal.

## `AZIENDA AGRICOLA` — mechanism traced, and my prior lead corrected

The earlier diagnosis proposed that `AZIENDA AGRICOLA` escapes `isProducerLine`
because of the `by` conjunct. **That was wrong.**

`PRODUCER_WORD = /^(?:produced|bottled|made|vinted|cellared|grown|packed|blended)$/i`
contains only English participles and **no Italian terms**. The broader line
`AZIENDA ESTATE AGRICOLA BOTTLED BY PRINSI` fires solely because it contains
`BOTTLED` **and** `BY`. The shorter candidate has **no producer word to match at
all**, so it is `VOCABULARY_ABSENT`, not a predicate false negative.

The same mechanism recurs: `Winemaker`, `Azienda Agricola Terre Sparse`,
`Indigenous blend`, `TRE FICHI` — all carry recognizable non-Brand roles for which
**no existing vocabulary entry exists**. No vocabulary was invented here; absence
is established, not remedied.

## Is vision earned? **For 1 case.**

Only `m-cellars-baseline` is `AMBIGUOUS_EVEN_WITH_CURRENT_CONTEXT`: brand
`M Cellars`, winner `CELLARS` — a genuine truncation ambiguity where the existing
evidence does not separate them.

**18 of 21 are a deterministic vocabulary gap, not a perception gap.** OCR read
both the Brand and the winner correctly; the system simply has no representation
for "azienda agricola", "winemaker" or "indigenous blend" as non-Brand roles.
Difficulty is not evidence for a model, and this audit gives none.

## Smallest next discriminating experiment (proposed, not started)

A read-only coverage measurement: for the 18 `VOCABULARY_ABSENT` winners, how
many distinct concepts would a minimal vocabulary extension have to cover, and do
those same tokens appear in the 16 correct Brands? That sizes the gap and tests
its safety **before** anyone proposes a term — and it is the discriminating step
between "small bounded list" and "open-ended semantic problem".

## Carried-forward gaps, still unreported

Per-arm **authority state** and **full-corpus collateral for E/S** remain
unreported from the factorial experiment. Not completed here, not claimed.
