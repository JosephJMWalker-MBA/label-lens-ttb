# E1a recommendation

## Verdict: **KILL E1a as specified.** Narrowing is possible but must be re-derived, not tuned.

## Kill criteria — five of six triggered

| Kill criterion | Result | Triggered? |
|---|---|---|
| Any wrong candidate becomes `OBSERVED` | **2** (`approved-wine-075`, `approved-wine-082`, both brand-absent) | **YES** |
| Any absent-brand case emits a value | **8 of 10** | **YES** |
| Normalized selected match falls below 29 | **17** | **YES** |
| Any currently-correct `OBSERVED` case becomes incorrect or uncertain | 0 — the 4 `OBSERVED` cases are untouched; but **12 currently-correct selections** were broken | **YES** (in substance) |
| A deliberate non-`too-many-words` filter is bypassed | `producer-line` is bypassed in practice by 4-word windows lacking a standalone `by` | **YES** |
| Candidate generation grows without a bounded, explainable limit | growth *is* explainable (O(words × 4) per triggered line) and bounded in principle, but p95 rises 38 → 356 | **NO**, strictly — but see below |

The fourth row deserves precision rather than a convenient reading. The criterion
as written protects currently-correct **`OBSERVED`** cases, and none of the four
changed. Taken literally it did not trigger. Taken as intended — do not break
cases the machine currently gets right — it triggered twelve times. **I am
recording it as triggered**, because reading it the narrow way would let a
treatment that destroys 12 correct answers pass a safety gate.

Any one of these ends the treatment. Five did.

## What the simulation nevertheless established

The diagnosis was right about the mechanism, and that result is worth keeping:

- 20 of 23 targeted cases were reached;
- **truth survives as a kept candidate in 17 of them, up from 0**;
- `too-many-words` really was blocking those brands from ever becoming candidates.

The treatment fails because of what comes *after* generation. 2 017 sub-spans of
back-label prose also survive the filters, and the ranker — which has no notion of
"this text is on the front label" — prefers them. Adding true candidates and
adding noise in the same operation is a net loss when the noise outnumbers the
signal ~118 : 1.

## The safety lesson that outlives this experiment

Two brand-absent labels reached **`OBSERVED`** with `Baltana Vella vineyard` and
`OPENED THEIR WINERY AND`. Both cleared the authority gate because a 4-word window
of prose happened to contain a `BRAND_DESIGNATOR` token. **The cause is the
treatment, which created those windows; the gate behaved exactly as specified on
the input it was given.** Before this change, no such candidate existed.

The designator vocabulary is a safe authority signal **only under the implicit
assumption that candidates are whole, coherent label lines**. Any future change
that admits arbitrary sub-spans breaks that assumption and turns the designator
list into a way of manufacturing false certainty. **Any successor experiment must
be evaluated against brand-absent cases before anything else.**

## Options, in the order I would take them

### 1. Narrow again — E1b: restrict sub-spans by *prominence*, not by rejection reason

The one signal that separates a front-label brand mark from back-label prose is
already computed and already used by the ranker: text height. A sub-span could be
offered only when its source line's prominence is near the label's maximum — the
same `BRAND_SCORE_PROMINENCE_FLOOR_RATIO` concept the ranker uses, applied at
generation instead of at ordering. That is still one variable, it reuses an
existing constant, and it directly targets the observed failure: every one of the
12 broken cases lost to *small* back-label text.

This must be re-simulated from scratch with the same kill criteria. It must not
be arrived at by trying thresholds until the corpus looks acceptable — the
threshold has to be justified by the front/back-label distinction before it is
measured.

### 2. Kill the generation family entirely

Defensible. The corpus currently has **0 false certainty** and **0 absent-brand
false positives**; this experiment showed how easily both can be lost. The
27.6 % selected accuracy is poor, but it is honest, and every uncertain case
already reaches a human with its value and alternates intact.

### 3. Do not pursue E2 or E3 first

E2 reaches 2 cases; E3 changes no behaviour. Neither is a substitute for deciding
whether the generation family is viable at all.

## Recommendation

**Kill E1a. Do not implement it in any form.** If there is appetite to continue,
proceed to a fresh read-only simulation of **E1b (prominence-restricted
sub-spans)** under the identical kill criteria, with brand-absent behaviour as the
first thing measured rather than the last. If there is no appetite, close the
generation family and record `CANDIDATE_GENERATION_MISS` as a known, measured
limitation of the current brand path.

Nothing here should be implemented or committed on the strength of this document.
