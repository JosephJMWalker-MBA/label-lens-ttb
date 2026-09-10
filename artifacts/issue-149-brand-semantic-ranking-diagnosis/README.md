# Issue #149 — semantic diagnosis of the residual Brand ranking failures

Diagnosis only. **Production behaviour changed: no.** No ranking, filter,
authority, OCR, candidate generation or model architecture was modified.

| | |
| --- | --- |
| Branch | `research/brand-semantic-ranking-diagnosis` |
| Dependency | `283a0823` (S′) → `f7ffee9c` → `6a969e4b` → `8de5b9fc`. **Evaluation dependency only** |
| Frozen inventory + taxonomy | `763eebbc77db4d5f402ddd86997969e1aa929c63f3fc72fe48e7b214a55f23ae` |
| Baseline reproduction | **115/115 exact** · Determinism **PASS** (fail-closed) |

## Headline: vision is **NOT** earned by this evidence

## The control comparison invalidated my own test

The frozen operational test for `AVAILABLE_NEGATIVE_CONTEXT_UNUSED` was: *is the
winner's containing line already marked `kept: false` with a semantic reason?*

| Population | Winner's line rejected |
| --- | --- |
| 21 unresolved | **0 / 21** |
| 16 control (correct) | **15 / 16** |

The signal is **anti-discriminative**. In class-E cases the *correct Brand* is the
one buried in a rejected line — a government-warning or producer line — while the
wrong winners sit on their own clean `candidate-plausible` lines. Demoting
candidates from rejected lines would penalize the correct Brand far more often
than the wrong one. This is exactly the control the protocol demanded, and it
killed the hypothesis.

## The 21 unresolved, fully accounted for

| Failure type | Cases |
| --- | --- |
| `SEMANTICALLY_AMBIGUOUS_FROM_CURRENT_EVIDENCE` | **20** |
| `CONTEXT_NOT_PROPAGATED` | 1 |
| `AVAILABLE_NEGATIVE_CONTEXT_UNUSED` | **0** |
| `OTHER` / `UNDETERMINABLE` | 0 |

Winner roles: `OTHER_BRANDLIKE_TEXT` 18 · `OVERWIDE_BRAND_SUPERSET` 3.

## Representative cases

| Brand | Wrong winner | Winner's line | Brand's line |
| --- | --- | --- | --- |
| Vino Alpino | `Azienda Agricola Terre Sparse` | kept, plausible | `Vino Alpino LLC`, kept |
| Prinsi | `AZIENDA AGRICOLA` | kept, plausible | `AZIENDA ESTATE AGRICOLA BOTTLED BY PRINSI`, **rejected: producer-line** |
| Pacha | `Winemaker` | kept, plausible | `Pacha RESERVA - CARMENERE`, kept |
| Poqr Krya | `Indigenous blend` | kept, plausible | `… 2022 Vayots Dzor`, **rejected: too-many-words** |

## Post-hoc observation, labelled as such

Not part of the frozen taxonomy and not counted in the aggregates. Several
winners are **producer/estate vocabulary that the existing predicates already
know** — `isProducerLine` fires on `AZIENDA ESTATE AGRICOLA BOTTLED BY PRINSI`
but not on the standalone candidate `AZIENDA AGRICOLA`, and `Winemaker` passes
every check. The deterministic vocabulary is therefore **incomplete at
candidate scope**, rather than present-and-ignored. That is a materially
different problem from missing perception, and it is testable deterministically.

## The two S′ regressions — what `structure` was protecting

| Case | Brand | `E+S` | `E+S′` | Brand `structure` |
| --- | --- | --- | --- | --- |
| luigi-giovanni-live | Luigi & Giovanni | `LUIGI & GIOVANNI` ✓ | `VANNI` | 0.75 |
| approved-wine-067 | Domaine Juliette Avril | `Domaine Juliette Avril` ✓ | `JULIETTE VRIL` | 1.00 |

The feature difference is **multi-token informative coherence**, not size.
`structure` counts tokens of length ≥ 3 plus a multi-token bonus, so a complete
brand phrase scores 0.75–1.00 while a truncated OCR fragment (`VANNI`,
`JULIETTE VRIL`) scores lower. Removing `1.2 × structure` removes exactly that
margin and lets the fragment win. `structure` was the only remaining term
distinguishing a coherent brand phrase from a corrupted fragment.

## Counts requested

- Existing deterministic signal could **in principle** distinguish: **0** by the
  frozen test (the line signal is anti-discriminative). The post-hoc vocabulary
  observation suggests a deterministic path exists but was **not** measured here.
- Requiring richer context: **1** (`CONTEXT_NOT_PROPAGATED`).
- Requiring knowledge unavailable in current evidence: **not established** —
  `SEMANTICALLY_AMBIGUOUS_FROM_CURRENT_EVIDENCE` (20) means my frozen tests did
  not separate them, **not** that no deterministic signal could.

## Is richer vision/semantic modelling earned? **No.**

The wrong winners are legible text on clean lines — `AZIENDA AGRICOLA`,
`Winemaker`, `Indigenous blend`. OCR read them correctly and read the Brand
correctly. Nothing here shows the pipeline **lacks information**; it shows the
ranking has no vocabulary for what the text *means* at candidate scope. Better
perception would not change that, and recommending vision because ranking is hard
is precisely what the protocol forbids.

## Smallest next discriminating experiment (proposed, not started)

A read-only measurement over the 21: for each wrong winner, does the existing
producer/generic/appellation vocabulary match its **candidate value** under the
same predicates already applied at line scope? That counts how many wrong winners
the pipeline's own vocabulary would already reject if evaluated at candidate
scope — discriminating "vocabulary incomplete" from "genuinely ambiguous" without
adding a rule, a weight, or a model.

## Carried-forward gaps, still unreported

Per-arm **authority state** and **full-corpus collateral for E/S** remain
unreported from the factorial experiment. Not completed here, not claimed.

## Verification

Fail-closed: aborts on either run exiting non-zero, on missing or empty
artifacts, and on empty hashes; emits explicit `PASS`/`FAIL`. Not reused from the
previous experiment, whose check could pass on two missing files.
